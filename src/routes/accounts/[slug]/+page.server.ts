import { error, fail, redirect } from "@sveltejs/kit";
import { count, desc, eq, inArray } from "drizzle-orm";
import { validateUserAccess, withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, interestRates } from "$lib/db/schema";
import { getUkTaxYearBounds } from "$lib/server/calculations";
import {
	getCurrentBalanceForAccount,
	getMonthlyBalanceHistory,
} from "$lib/server/derivedBalances";
import {
	createInterestRate,
	deleteInterestRate,
	getCurrentRate,
	getInterestRateById,
	parseRateToBasisPoints,
} from "$lib/server/interestRates";
import { getAccountInterestSummary } from "$lib/server/interestBreakdown";
import {
	createTransaction,
	deleteTransaction,
	getTransactionBySlug,
	type TransactionType,
} from "$lib/server/transactions";
import { devLog, logError } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

function formatTaxYearStartParam(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getTaxYearEndFromStart(taxYearStart: Date): Date {
	return new Date(
		Date.UTC(taxYearStart.getUTCFullYear() + 1, 3, 5, 23, 59, 59, 999),
	);
}

function parseTaxYearStart(value: string | null): Date | null {
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	if (parsed.getUTCMonth() !== 3 || parsed.getUTCDate() !== 6) return null;
	return parsed;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const accountSlug = params.slug;

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

	// Derive balances from transactions (source of truth).
	const [currentBalance, monthlyBalances] = await Promise.all([
		getCurrentBalanceForAccount(account.id),
		getMonthlyBalanceHistory(account.id, 24),
	]);

	// Pagination for transactions
	const TRANSACTIONS_PER_PAGE = 20;
	const page = Number(url.searchParams.get("page")) || 0;
	const offset = page * TRANSACTIONS_PER_PAGE;

	// Get total transaction count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(accountTransactions)
		.where(eq(accountTransactions.accountId, account.id));
	const totalTransactionPages = Math.ceil(total / TRANSACTIONS_PER_PAGE);
	const safePage = Math.min(page, Math.max(0, totalTransactionPages - 1));
	const safeOffset = safePage * TRANSACTIONS_PER_PAGE;

	// Get paginated transactions for this account
	const transactions = await db.query.accountTransactions.findMany({
		where: eq(accountTransactions.accountId, account.id),
		orderBy: desc(accountTransactions.transactionDate),
		limit: TRANSACTIONS_PER_PAGE,
		offset: safeOffset,
	});

	// Get interest rate history for this account
	const rates = await db.query.interestRates.findMany({
		where: eq(interestRates.accountId, account.id),
		orderBy: desc(interestRates.effectiveFrom),
		limit: 20,
	});

	// Get current effective rate
	const currentRate = await getCurrentRate(account.id);

	// Get all interest transactions to determine available tax years (global context for navigation)
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		columns: { id: true },
	});
	const accountIds = userAccounts.map((a) => a.id);
	const interestTransactions = await db.query.accountTransactions.findMany({
		where:
			accountIds.length > 0
				? inArray(accountTransactions.accountId, accountIds)
				: eq(accountTransactions.id, 0),
		columns: { transactionDate: true },
	});
	const availableTaxYears = new Map<
		string,
		{ slug: string; start: Date; end: Date }
	>();
	for (const tx of interestTransactions) {
		const bounds = getUkTaxYearBounds(tx.transactionDate);
		const startYear = bounds.start.getUTCFullYear();
		const endYear = bounds.end.getUTCFullYear();
		const slug = `${startYear}-${String(endYear).slice(-2)}`;
		if (!availableTaxYears.has(slug)) {
			availableTaxYears.set(slug, { slug, start: bounds.start, end: bounds.end });
		}
	}
	const sortedTaxYears = Array.from(availableTaxYears.values()).sort(
		(a, b) => b.start.getTime() - a.start.getTime(),
	);

	const currentTaxYear = getUkTaxYearBounds(new Date());
	const selectedTaxYearStart =
		parseTaxYearStart(url.searchParams.get("taxYearStart")) ??
		currentTaxYear.start;
	const taxYear = {
		start: selectedTaxYearStart,
		end: getTaxYearEndFromStart(selectedTaxYearStart),
	};

	// Get unified interest summary with projection eligibility
	const interestSummary = await getAccountInterestSummary({
		accountId: account.id,
		taxYearStart: taxYear.start,
		taxYearEnd: taxYear.end,
		taxBand: "basic",
	});

	// Format tax year params for navigation (only if summary exists)
	const prevTaxYearStart = new Date(
		Date.UTC(taxYear.start.getUTCFullYear() - 1, 3, 6),
	);
	const nextTaxYearStart = new Date(
		Date.UTC(taxYear.start.getUTCFullYear() + 1, 3, 6),
	);
	const prevTaxYearParam = formatTaxYearStartParam(prevTaxYearStart);
	const nextTaxYearParam = formatTaxYearStartParam(nextTaxYearStart);

	// Extend summary with navigation params for client-side
	const summaryWithNav = interestSummary
		? {
				...interestSummary,
				prevTaxYearParam,
				nextTaxYearParam,
				selectedTaxYearStart: formatTaxYearStartParam(taxYear.start),
		  }
		: null;

	return {
		account,
		monthlyBalances: monthlyBalances.toReversed(),
		currentBalance,
		transactions,
		transactionPagination: {
			page: safePage,
			totalPages: totalTransactionPages,
		},
		rates,
		currentRate,
		interestSummary: summaryWithNav,
		availableTaxYears: sortedTaxYears,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false },
		],
	};
};

export const actions: Actions = {
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
		const parsedAmount = Math.round(parseFloat(amountStr) * 100);
		if (Number.isNaN(parsedAmount) || parsedAmount === 0) {
			return fail(400, { error: "Invalid amount" });
		}
		const amount =
			type === "withdrawal" || type === "transfer_out"
				? -Math.abs(parsedAmount)
				: type === "value_change"
					? parsedAmount
					: Math.abs(parsedAmount);

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
			const transaction = await getTransactionBySlug(transactionSlug);
			if (
				!transaction ||
				transaction.accountId !== account.id ||
				transaction.account.userId !== locals.user.id
			) {
				return fail(404, { error: "Transaction not found" });
			}

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
			const rate = await getInterestRateById(rateId);
			if (
				!rate ||
				rate.accountId !== account.id ||
				rate.account.userId !== locals.user.id
			) {
				return fail(404, { error: "Interest rate not found" });
			}

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
