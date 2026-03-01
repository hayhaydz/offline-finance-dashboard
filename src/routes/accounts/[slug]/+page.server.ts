import { error, fail, redirect } from "@sveltejs/kit";
import { count, desc, eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accountBalances, accounts } from "$lib/db/schema";
import { addBalanceEntry } from "$lib/utils/balances";
import { devLog, logError } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const accountSlug = params.slug;
	const pageParam = url.searchParams.get("page");
	const page = Math.max(0, pageParam ? parseInt(pageParam, 10) - 1 : 0);
	const PAGE_SIZE = 20;
	const _offset = page * PAGE_SIZE;

	// Get account with ownership validation using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug),
	});

	if (!account) {
		logError("accountDetail", "Account not found", {
			accountSlug,
			userId: locals.user.id,
		});
		error(404, "Account not found");
	}

	validateUserAccess(account, locals.user, "Account");

	// Total balance count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(accountBalances)
		.where(eq(accountBalances.accountId, account.id));

	const totalPages = Math.ceil(total / PAGE_SIZE);
	const safePage = Math.min(page, Math.max(0, totalPages - 1));
	const safeOffset = safePage * PAGE_SIZE;

	// Get balance history (newest first) using account.id
	const balances = await db.query.accountBalances.findMany({
		where: eq(accountBalances.accountId, account.id),
		orderBy: desc(accountBalances.asOfDate),
		limit: PAGE_SIZE + 1, // fetch one extra to check change from next page
		offset: safeOffset,
	});

	// Calculate "change from previous" for display
	const balancesPage = balances.slice(0, PAGE_SIZE);
	const balancesWithChange = balancesPage.map((balance, index) => {
		const previous = balancesPage[index + 1];
		return {
			...balance,
			changeFromPrevious: previous
				? balance.balanceInCents - previous.balanceInCents
				: null,
		};
	});

	// Get current balance (most recent entry across all pages)
	const currentBalance =
		safePage === 0 && balancesPage.length > 0
			? balancesPage[0].balanceInCents
			: 0;

	return {
		account,
		balances: balancesWithChange,
		currentBalance,
		page: safePage,
		totalPages,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false },
		],
	};
};

export const actions: Actions = {
	/**
	 * Add a new balance entry to an account
	 */
	addBalance: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("addBalance", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership first using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("addBalance", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		if (account.closedAt) {
			logError("addBalance", "Attempt to add balance to closed account", {
				accountSlug,
			});
			return fail(403, {
				error: "Cannot add balance entries to a closed account.",
			});
		}

		const formData = await request.formData();
		const balanceStr = formData.get("balance") as string;
		const asOfDateStr = formData.get("asOfDate") as string; // YYYY-MM-DD format
		const notes = formData.get("notes") as string | null;

		// Validate notes length
		if (notes && notes.trim().length > 500) {
			return fail(400, { error: "Notes must be 500 characters or less" });
		}

		// Parse date (midnight UTC to avoid timezone issues)
		const asOfDate = new Date(`${asOfDateStr}T00:00:00.000Z`);

		// Check for future date (block it)
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		today.setUTCMilliseconds(0);
		if (asOfDate > today) {
			devLog("addBalance", "Future date blocked", {
				asOfDate: asOfDateStr,
				accountSlug,
			});
			return fail(400, { error: "Cannot enter balances for future dates" });
		}

		// Use shared balance entry function
		const result = await addBalanceEntry(
			{ accountId: account.id, balanceStr, asOfDate, notes },
			account,
		);

		if (result.type === "conflict") {
			return fail(409, {
				error: result.error,
				existingBalanceId: result.existingBalanceId,
				existingBalance: result.existingBalance,
				proposedBalance: result.proposedBalance,
			});
		}

		devLog("addBalance", "Balance entry created successfully", {
			accountSlug,
			balanceSlug: result.balanceSlug,
			balanceInCents: result.balanceInCents,
		});
		return { success: result.success };
	},
};
