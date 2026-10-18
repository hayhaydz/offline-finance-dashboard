import { error, fail, redirect } from "@sveltejs/kit";
import { count, eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accountNotes,
	accounts,
	accountTransactions,
	goalAllocations,
	goals,
	interestRates,
} from "$lib/db/schema";
import { devLog, isVerboseDebug, logError, logInfo } from "$lib/server/logger";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);

	const accountSlug = params.slug;
	if (isVerboseDebug())
		devLog("closeAccount", "Loading account for close", { accountSlug });

	// Get account and validate ownership using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug),
	});

	if (!account || account.deletedAt) {
		logError("closeAccount", "Account not found", {
			accountSlug,
			userId: user.id,
		});
		error(404, "Account not found");
	}

	validateUserAccess(account, user, "Account");

	if (account.closedAt) {
		logError(
			"closeAccount",
			"Attempt to visit close page for already-closed account",
			{ accountSlug },
		);
		redirect(303, `/accounts/${account.slug}`);
	}

	// Disclosure counts for the destructive-delete section. The delete is
	// empty-accounts-only: an account with any transaction history sees the
	// close flow only (no delete affordance anywhere).
	const [{ transactionCount }] = await db
		.select({ transactionCount: count() })
		.from(accountTransactions)
		.where(eq(accountTransactions.accountId, account.id));
	const [{ noteCount }] = await db
		.select({ noteCount: count() })
		.from(accountNotes)
		.where(eq(accountNotes.accountId, account.id));
	const [{ rateCount }] = await db
		.select({ rateCount: count() })
		.from(interestRates)
		.where(eq(interestRates.accountId, account.id));

	return {
		account,
		transactionCount,
		noteCount,
		rateCount,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false }, // Replace account slug with account name
			{ segmentIndex: 2, label: "Close / Delete", skipLink: false }, // Replace 'delete' with page purpose
		],
	};
};

export const actions: Actions = {
	/**
	 * Close an account (soft state change, distinct from deletion)
	 * - Sets closedAt timestamp instead of hard-deleting
	 * - Preserves all balance history (still counted in interest/ISA/tax-year)
	 * - Account stays listed behind the [Show N closed] toggle on /accounts
	 */
	closeAccount: async ({ locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account || account.deletedAt) {
			logError("closeAccount", "Account not found", { accountSlug });
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, user, "Account");

		if (account.closedAt) {
			return fail(400, { error: "Account is already closed" });
		}

		if (isVerboseDebug()) {
			devLog("closeAccount", "Closing account", {
				accountSlug,
				accountId: account.id,
			});
		}

		try {
			// Soft state change: set closedAt timestamp
			const closedAt = new Date();
			await db
				.update(accounts)
				.set({
					closedAt,
					updatedAt: new Date(),
				})
				.where(eq(accounts.id, account.id));

			if (isVerboseDebug()) {
				devLog("closeAccount", "Account closed successfully", {
					accountId: account.id,
					accountSlug,
					closedAt: closedAt.toISOString(),
				});
			}
		} catch (err) {
			logError("closeAccount", "Failed to close account", err);
			// Failure renders on the page (audit #10) — account remains open
			return fail(500, {
				error: "Failed to close the account. Please try again.",
			});
		}

		// Success feedback banner on the accounts list (audit #10)
		redirect(303, "/accounts?closed=1");
	},

	/**
	 * Destructive delete — empty accounts only (user decision 2026-10-18).
	 *
	 * Removes the account row plus its notes and rate history in ONE
	 * transaction. Server-side gates enforced at action time (not just UI):
	 * - transactionCount === 0 (accounts with history must be closed instead)
	 * - typed confirmation matches the account name
	 * - defensive goal-allocation check (no allocation rows / linked goals)
	 */
	deleteAccount: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account || account.deletedAt) {
			logError("deleteAccount", "Account not found", { accountSlug });
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, user, "Account");

		if (account.closedAt) {
			return fail(400, {
				error:
					"Closed accounts cannot be deleted. Closed accounts keep their history.",
			});
		}

		// Typed confirmation — must match the account name exactly
		const formData = await request.formData();
		const confirmName = formData.get("confirmName");
		if (confirmName !== account.name) {
			return fail(400, {
				error: "Typed name does not match the account name.",
			});
		}

		// Empty-only gate, enforced server-side at action time
		const [{ transactionCount }] = await db
			.select({ transactionCount: count() })
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, account.id));
		if (transactionCount > 0) {
			logError("deleteAccount", "Refused delete — account has history", {
				accountSlug,
				transactionCount,
			});
			return fail(400, {
				error:
					"Accounts with transaction history cannot be deleted — close the account instead (history is preserved).",
			});
		}

		// Defensive goal-allocation check: zero transactions should imply
		// nothing financial depends on this account, but allocation rows or a
		// linked debt goal would both FK-block the hard delete.
		const [{ allocationCount }] = await db
			.select({ allocationCount: count() })
			.from(goalAllocations)
			.where(eq(goalAllocations.accountId, account.id));
		if (allocationCount > 0) {
			return fail(400, {
				error:
					"This account is referenced by goal allocations — remove the allocations first.",
			});
		}
		const [{ linkedGoalCount }] = await db
			.select({ linkedGoalCount: count() })
			.from(goals)
			.where(eq(goals.linkedAccountId, account.id));
		if (linkedGoalCount > 0) {
			return fail(400, {
				error:
					"A debt goal is linked to this account — unlink it before deleting.",
			});
		}

		try {
			// Atomic hard delete: account + notes + rate history in one
			// transaction (better-sqlite3 sync callback). Transaction rows are
			// deleted defensively — the gate above means this is always 0.
			const removed = db.transaction((tx) => {
				const notesDeleted = tx
					.delete(accountNotes)
					.where(eq(accountNotes.accountId, account.id))
					.run().changes;
				const ratesDeleted = tx
					.delete(interestRates)
					.where(eq(interestRates.accountId, account.id))
					.run().changes;
				const transactionsDeleted = tx
					.delete(accountTransactions)
					.where(eq(accountTransactions.accountId, account.id))
					.run().changes;
				tx.delete(accounts).where(eq(accounts.id, account.id)).run();
				return { notesDeleted, ratesDeleted, transactionsDeleted };
			});

			// Counts only — no account names in logs
			logInfo("deleteAccount", "Empty account hard-deleted", {
				accountId: account.id,
				...removed,
			});
			if (isVerboseDebug()) {
				devLog("deleteAccount", "Account deleted (hard delete)", {
					accountSlug,
					...removed,
				});
			}
		} catch (err) {
			logError("deleteAccount", "Failed to delete account", err);
			return fail(500, {
				error: "Failed to delete the account. Nothing was removed.",
			});
		}

		// Success feedback banner on the accounts list
		redirect(303, "/accounts?deleted=1");
	},
};
