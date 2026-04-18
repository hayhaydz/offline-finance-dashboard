import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);

	const accountSlug = params.slug;
	if (isVerboseDebug()) devLog("closeAccount", "Loading account for close", { accountSlug });

	// Get account and validate ownership using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug),
	});

	if (!account) {
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

	return {
		account,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false }, // Replace account slug with account name
			{ segmentIndex: 2, label: `Close Account`, skipLink: false }, // Replace 'delete' with 'Close Account'
		],
	};
};

export const actions: Actions = {
	/**
	 * Close an account (soft-delete)
	 * - Sets closedAt timestamp instead of hard-deleting
	 * - Preserves all balance history
	 * - Account remains in database but marked as closed
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

		if (!account) {
			logError("closeAccount", "Account not found", { accountSlug });
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, user, "Account");

		if (isVerboseDebug()) {
			devLog("closeAccount", "Closing account", {
				accountSlug,
				accountId: account.id,
			});
		}

		// Soft-delete by setting closedAt timestamp
		const closedAt = new Date();
		await db
			.update(accounts)
			.set({
				closedAt,
				updatedAt: new Date(),
			})
			.where(eq(accounts.id, account.id));

		if (isVerboseDebug()) {
			devLog("closeAccount", "Account closed successfully (soft-delete)", {
				accountId: account.id,
				accountSlug,
				closedAt: closedAt.toISOString(),
			});
		}

		// Redirect to accounts list
		if (isVerboseDebug()) devLog("closeAccount", "Redirecting to accounts list", { accountSlug });
		redirect(303, "/accounts");
	},
};
