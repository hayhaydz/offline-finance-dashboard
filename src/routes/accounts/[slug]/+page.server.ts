import { error, fail, redirect } from "@sveltejs/kit";
import { count, desc, eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accountBalances, accountTransactions, accounts, interestRates } from "$lib/db/schema";
import {
	createInterestRate,
	deleteInterestRate,
	getCurrentRate,
	parseRateToBasisPoints,
} from "$lib/server/interestRates";
import {
	createTransaction,
	deleteTransaction,
	type TransactionType,
} from "$lib/server/transactions";
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

	// Get recent transactions for this account
	const transactions = await db.query.accountTransactions.findMany({
		where: eq(accountTransactions.accountId, account.id),
		orderBy: desc(accountTransactions.transactionDate),
		limit: 20,
	});

	// Get interest rate history for this account
	const rates = await db.query.interestRates.findMany({
		where: eq(interestRates.accountId, account.id),
		orderBy: desc(interestRates.effectiveFrom),
		limit: 20,
	});

	// Get current effective rate
	const currentRate = await getCurrentRate(account.id);

	return {
		account,
		balances: balancesWithChange,
		currentBalance,
		transactions,
		rates,
		currentRate,
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

	/**
	 * Add a new transaction to an account
	 */
	addTransaction: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("addTransaction", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("addTransaction", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		const formData = await request.formData();
		const type = formData.get("type") as TransactionType;
		const amountStr = formData.get("amount") as string;
		const description = formData.get("description") as string | null;
		const category = formData.get("category") as string | null;
		const transactionDateStr = formData.get("transactionDate") as string;

		// Validate type
		const validTypes: TransactionType[] = [
			"deposit",
			"withdrawal",
			"interest",
			"dividend",
			"value_change",
			"transfer_in",
			"transfer_out",
		];
		if (!validTypes.includes(type)) {
			return fail(400, { error: "Invalid transaction type" });
		}

		// Parse amount (handle both decimal and integer input)
		const amount = Math.round(parseFloat(amountStr) * 100);
		if (Number.isNaN(amount)) {
			return fail(400, { error: "Invalid amount" });
		}

		// Parse date
		const transactionDate = new Date(`${transactionDateStr}T00:00:00.000Z`);

		// Validate description length
		if (description && description.trim().length > 500) {
			return fail(400, { error: "Description must be 500 characters or less" });
		}

		try {
			const result = await createTransaction(
				{
					accountId: account.id,
					type,
					amount,
					description: description ?? undefined,
					category: category ?? undefined,
					transactionDate,
				},
				account,
			);

			devLog("addTransaction", "Transaction created successfully", {
				accountSlug,
				transactionSlug: result.transactionSlug,
				type,
				amount,
			});

			return { success: true, transactionSlug: result.transactionSlug };
		} catch (err) {
			logError("addTransaction", "Failed to create transaction", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to create transaction" });
		}
	},

	/**
	 * Delete a transaction
	 */
	deleteTransaction: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("deleteTransaction", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("deleteTransaction", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		const formData = await request.formData();
		const transactionSlug = formData.get("transactionSlug") as string;

		if (!transactionSlug) {
			return fail(400, { error: "Transaction slug is required" });
		}

		try {
			await deleteTransaction(transactionSlug);

			devLog("deleteTransaction", "Transaction deleted successfully", {
				accountSlug,
				transactionSlug,
			});

			return { success: true };
		} catch (err) {
			logError("deleteTransaction", "Failed to delete transaction", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to delete transaction" });
		}
	},

	/**
	 * Add a new interest rate to an account
	 */
	addInterestRate: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("addInterestRate", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("addInterestRate", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		const formData = await request.formData();
		const rateStr = formData.get("rate") as string;
		const effectiveFromStr = formData.get("effectiveFrom") as string;

		// Parse rate (percentage to basis points)
		const ratePercent = parseFloat(rateStr);
		if (Number.isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
			return fail(400, { error: "Invalid rate (must be 0-100%)" });
		}
		const rate = parseRateToBasisPoints(ratePercent);

		// Parse date
		const effectiveFrom = new Date(`${effectiveFromStr}T00:00:00.000Z`);

		try {
			const result = await createInterestRate(
				{
					accountId: account.id,
					rate,
					effectiveFrom,
				},
				account,
			);

			devLog("addInterestRate", "Interest rate created successfully", {
				accountSlug,
				rateId: result.rateId,
				rate,
				effectiveFrom: effectiveFromStr,
			});

			return { success: true, rateId: result.rateId };
		} catch (err) {
			logError("addInterestRate", "Failed to create interest rate", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to create interest rate" });
		}
	},

	/**
	 * Delete an interest rate
	 */
	deleteInterestRate: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("deleteInterestRate", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("deleteInterestRate", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		const formData = await request.formData();
		const rateIdStr = formData.get("rateId") as string;
		const rateId = parseInt(rateIdStr, 10);

		if (!rateId) {
			return fail(400, { error: "Rate ID is required" });
		}

		try {
			await deleteInterestRate(rateId);

			devLog("deleteInterestRate", "Interest rate deleted successfully", {
				accountSlug,
				rateId,
			});

			return { success: true };
		} catch (err) {
			logError("deleteInterestRate", "Failed to delete interest rate", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to delete interest rate" });
		}
	},
};
