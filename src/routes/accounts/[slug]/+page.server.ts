import { error, fail, redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accountTransactions, accounts, interestRates } from "$lib/db/schema";
import {
	createInterestRate,
	deleteInterestRate,
	getCurrentRate,
	getInterestRateById,
	parseRateToBasisPoints,
} from "$lib/server/interestRates";
import {
	ISA_ALLOWANCE_IN_CENTS,
	getAccountInterestEarned,
	getActualInterestEarned,
	getISAAllowanceUsed,
	getProjectedInterest,
	getTaxFreeStatus,
	getUkTaxYearBounds,
} from "$lib/server/calculations";
import {
	getCurrentBalanceForAccount,
	getMonthlyBalanceHistory,
} from "$lib/server/derivedBalances";
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
		Date.UTC(
			taxYearStart.getUTCFullYear() + 1,
			3,
			5,
			23,
			59,
			59,
			999,
		),
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
	const currentTaxYear = getUkTaxYearBounds(new Date());
	const selectedTaxYearStart =
		parseTaxYearStart(url.searchParams.get("taxYearStart")) ??
		currentTaxYear.start;
	const taxYear = {
		start: selectedTaxYearStart,
		end: getTaxYearEndFromStart(selectedTaxYearStart),
	};
	const taxYearOptions = Array.from({ length: 5 }, (_, i) => {
		const start = new Date(
			Date.UTC(currentTaxYear.start.getUTCFullYear() - i, 3, 6, 0, 0, 0, 0),
		);
		const end = getTaxYearEndFromStart(start);
		const label = `${start.getUTCFullYear()}/${String(end.getUTCFullYear()).slice(-2)}`;
		return {
			value: formatTaxYearStartParam(start),
			label,
		};
	});

	const [isaAllowanceUsed, actualInterestAllAccounts, accountActualInterest, projectedInterest] =
		await Promise.all([
			getISAAllowanceUsed(locals.user.id, taxYear.start, taxYear.end),
			getActualInterestEarned(locals.user.id, taxYear.start, taxYear.end),
			getAccountInterestEarned(account.id, taxYear.start, taxYear.end),
			getProjectedInterest(account.id, taxYear.end),
		]);
	const taxBand = "basic" as const;
	const taxFreeStatus = getTaxFreeStatus(actualInterestAllAccounts, taxBand);
	const totalExpectedInterest = accountActualInterest + projectedInterest;

	return {
		account,
		monthlyBalances: monthlyBalances.toReversed(),
		currentBalance,
		transactions,
		rates,
		currentRate,
		interestSummary:
			account.type === "savings" || account.type === "investment"
				? {
						taxYearStart: taxYear.start,
						taxYearEnd: taxYear.end,
						actualInterest: accountActualInterest,
						projectedInterest,
						totalExpectedInterest,
						taxBand,
						taxFreeStatus,
						isaAllowance: {
							limit: ISA_ALLOWANCE_IN_CENTS,
							used: isaAllowanceUsed,
							remaining: Math.max(0, ISA_ALLOWANCE_IN_CENTS - isaAllowanceUsed),
						},
						selectedTaxYearStart: formatTaxYearStartParam(taxYear.start),
						taxYearOptions,
					}
				: null,
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
