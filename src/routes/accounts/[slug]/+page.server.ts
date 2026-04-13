import { error, fail, redirect } from "@sveltejs/kit";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { validateUserAccess, withUserFilter } from "$lib/auth/row-security";
import { getAlertsForAccount } from "$lib/server/alerts";
import { db } from "$lib/db/client";
import {
	accountNotes,
	accounts,
	accountTransactions,
	interestRates,
	settings,
} from "$lib/db/schema";
import {
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from "$lib/server/calculations";
import {
	getCurrentBalanceForAccount,
	getMonthlyBalanceHistory,
} from "$lib/server/derivedBalances";
import { getAccountInterestSummary } from "$lib/server/interestBreakdown";
import {
	createInterestRate,
	deleteInterestRate,
	getCurrentRate,
	getInterestRateById,
	parseRateToBasisPoints,
} from "$lib/server/interestRates";
import { getISABreakdownReport } from "$lib/server/isaBreakdown";
import { getCategories } from "$lib/server/categories";
import { createNote, deleteNote, getNoteBySlug } from "$lib/server/notes";
import {
	createTransaction,
	deleteTransaction,
	getTransactionBySlug,
	type TransactionType,
} from "$lib/server/transactions";
import { calculateTTZ } from "$lib/utils/debt-calculator";
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

/**
 * Calculate debt health status badge
 * HEALTHY: Pays off in < 5 years
 * WARNING: Pays off in 5+ years
 * CRITICAL: Never pays off
 */
function getDebtHealthStatus(ttz: {
	months: number | null;
	years: number | null;
}): { label: string; class: string } {
	if (ttz.months === null) {
		return { label: "[CRITICAL]", class: "text-red-700" };
	}
	if (ttz.years !== null && ttz.years >= 5) {
		return { label: "[WARNING]", class: "text-amber-700" };
	}
	return { label: "[HEALTHY]", class: "text-green-700" };
}

type RecurringPattern = {
	description: string;
	approximateAmount: number;
	lastDate: Date;
};

/**
 * Detect recurring transaction patterns from full transaction history.
 * Requires ≥ 3 occurrences, amounts within ±10% of median, and ≥ 2 gaps in 28–35 day range.
 */
function detectRecurringPatterns(
	txs: Array<{ description: string | null; amount: number; transactionDate: Date }>,
): RecurringPattern[] {
	const groups = new Map<string, typeof txs>();

	for (const tx of txs) {
		if (!tx.description || tx.description.trim().length <= 3) continue;
		const key = tx.description.toLowerCase().trim();
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(tx);
	}

	const patterns: RecurringPattern[] = [];

	for (const group of groups.values()) {
		if (group.length < 3) continue;

		const sorted = [...group].sort(
			(a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
		);

		const amounts = sorted.map((t) => Math.abs(t.amount));
		const sortedAmounts = [...amounts].sort((a, b) => a - b);
		const median = sortedAmounts[Math.floor(sortedAmounts.length / 2)];

		if (median === 0) continue;
		const allWithinRange = amounts.every(
			(a) => a >= median * 0.9 && a <= median * 1.1,
		);
		if (!allWithinRange) continue;

		let monthlyGaps = 0;
		for (let i = 1; i < sorted.length; i++) {
			const daysDiff =
				(sorted[i].transactionDate.getTime() -
					sorted[i - 1].transactionDate.getTime()) /
				(1000 * 60 * 60 * 24);
			if (daysDiff >= 28 && daysDiff <= 35) monthlyGaps++;
		}
		if (monthlyGaps < 2) continue;

		patterns.push({
			description: group[0].description!.trim(),
			approximateAmount: median,
			lastDate: sorted[sorted.length - 1].transactionDate,
		});
	}

	return patterns;
}

/**
 * Calculate minimum payment from account rule
 * Note: percentage is stored in basis points in the database (100 = 1%)
 */
function calculateMinimumPayment(
	balance: number,
	_rate: number,
	rule: { type: string; flat: number | null; percentage: number | null },
): number {
	if (rule.type === "flat" && rule.flat !== null) {
		return rule.flat;
	}
	if (rule.type === "percentage" && rule.percentage !== null) {
		// percentage is in basis points: 100 = 1%, so divide by 10000
		return Math.round((balance * rule.percentage) / 10000);
	}
	// Default to 1% of balance
	return Math.round(balance * 0.01);
}

/**
 * Calculate payment suggestion
 * Returns optimal payment and time/interest savings if significant improvement found
 */
function calculatePaymentSuggestion(
	balance: number,
	rate: number,
	currentPayment: number,
	ttz: { months: number | null; totalInterest: number | null },
): {
	suggestedPayment: number;
	monthsSaved: number;
	interestSaved: number;
} | null {
	// No suggestion if never pays off or already fast (< 6 months)
	if (ttz.months === null || ttz.months < 6) {
		return null;
	}

	// Try +25%, +50%, +100% payment increments
	const increments = [1.25, 1.5, 2.0];

	for (const mult of increments) {
		const newPayment = Math.round(currentPayment * mult);
		const newTtz = calculateTTZ(balance, rate, {
			type: "flat",
			flat: newPayment,
		});

		if (
			newTtz.months !== null &&
			newTtz.totalInterest !== null &&
			ttz.totalInterest !== null
		) {
			const monthsSaved = ttz.months - newTtz.months;
			const interestSaved = ttz.totalInterest - newTtz.totalInterest;

			// Only suggest if saves 3+ months
			if (monthsSaved > 3) {
				return {
					suggestedPayment: newPayment,
					monthsSaved,
					interestSaved,
				};
			}
		}
	}

	return null;
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

	// Pagination for transactions (1-indexed URL parameter)
	const TRANSACTIONS_PER_PAGE = 20;
	const pageParam = url.searchParams.get("txPage");
	const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : 1;
	const validPage =
		Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

	// Get total transaction count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(accountTransactions)
		.where(eq(accountTransactions.accountId, account.id));
	const totalTransactionPages = Math.ceil(total / TRANSACTIONS_PER_PAGE);
	// Convert 1-indexed to 0-indexed and clamp to valid range
	const safePage = Math.min(
		validPage - 1,
		Math.max(0, totalTransactionPages - 1),
	);
	const safeOffset = safePage * TRANSACTIONS_PER_PAGE;

	// Get paginated transactions for this account
	const transactions = await db.query.accountTransactions.findMany({
		where: eq(accountTransactions.accountId, account.id),
		orderBy: desc(accountTransactions.transactionDate),
		limit: TRANSACTIONS_PER_PAGE,
		offset: safeOffset,
		with: {
			category: true,
		},
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
			availableTaxYears.set(slug, {
				slug,
				start: bounds.start,
				end: bounds.end,
			});
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

	// Calculate ISA summary if account has tax wrapper
	let isaSummary: {
		taxYearStart: Date;
		taxYearEnd: Date;
		subscribed: number;
		remaining: number;
		utilizationPercent: number;
		prevTaxYearParam: string;
		nextTaxYearParam: string;
	} | null = null;

	if (account.taxWrapper !== "none") {
		const taxYear = getUkTaxYearBounds();
		const isaReport = await getISABreakdownReport({
			userId: locals.user.id,
			taxYearStart: taxYear.start,
			taxYearEnd: taxYear.end,
		});

		// Find this account's contribution
		const accountContribution =
			isaReport.actual.byAccount.find((a) => a.accountId === account.id)
				?.total ?? 0;

		isaSummary = {
			taxYearStart: isaReport.meta.taxYearStart,
			taxYearEnd: isaReport.meta.taxYearEnd,
			subscribed: accountContribution,
			remaining: Math.max(0, ISA_ALLOWANCE_IN_CENTS - accountContribution),
			utilizationPercent: Math.round(
				(accountContribution / ISA_ALLOWANCE_IN_CENTS) * 100,
			),
			prevTaxYearParam: new Date(
				Date.UTC(taxYear.start.getUTCFullYear() - 1, 3, 6),
			).toISOString(),
			nextTaxYearParam: new Date(
				Date.UTC(taxYear.start.getUTCFullYear() + 1, 3, 6),
			).toISOString(),
		};
	}

	// Extend summary with navigation params for client-side
	const summaryWithNav = interestSummary
		? {
				...interestSummary,
				prevTaxYearParam,
				nextTaxYearParam,
				selectedTaxYearStart: formatTaxYearStartParam(taxYear.start),
			}
		: null;

	// Calculate TTZ and projection for liability accounts
	let projection: Array<{
		month: number;
		balance: number;
		interest: number;
		payment: number;
	}> | null = null;
	let ttz: {
		months: number | null;
		years: number | null;
		totalInterest: number | null;
	} | null = null;
	let debtHealthStatus: { label: string; class: string } | null = null;
	let paymentSuggestion: {
		suggestedPayment: number;
		monthsSaved: number;
		interestSaved: number;
	} | null = null;
	let overpaymentScenarios: Array<{
		label: string;
		payment: number;
		ttzMonths: number | null;
		totalInterest: number | null;
		debtFreeDate: string | null;
	}> | null = null;
	let rateScenarios: Array<{
		label: string;
		rate: number;
		ttzMonths: number | null;
		ttzDelta: number | null;
		totalInterest: number | null;
		debtFreeDate: string | null;
	}> | null = null;
	let liabilityContext: {
		strategy: "avalanche" | "snowball" | null;
		totalLiabilities: number;
	} | null = null;
	let breakEvenMonthIndex: number | null = null;

	if (account.category === "liability") {
		// Use derived balance from transactions (source of truth)
		// currentBalance is calculated at line 79 from transactions
		// For liability accounts, balance is negative; convert to positive for debt calculator
		const balanceForTTZ = Math.abs(currentBalance);

		const rate = await getCurrentRate(account.id);
		if (rate !== null) {
			const rule = {
				type: account.minimumPaymentType,
				flat: account.minimumPaymentFlat,
				percentage: account.minimumPaymentPercentage,
			};
			const ttzResult = calculateTTZ(balanceForTTZ, rate, rule);
			projection = ttzResult.projection.slice(0, 24); // 24 months for toggle support
			ttz = {
				months: ttzResult.months,
				years: ttzResult.years,
				totalInterest: ttzResult.totalInterest,
			};

			// Calculate debt health status
			if (ttz) {
				debtHealthStatus = getDebtHealthStatus(ttz);
			}

			// Calculate payment suggestion
			if (ttz && ttz.months !== null) {
				const currentPayment = calculateMinimumPayment(balanceForTTZ, rate, {
					type: account.minimumPaymentType,
					flat: account.minimumPaymentFlat,
					percentage: account.minimumPaymentPercentage,
				});
				paymentSuggestion = calculatePaymentSuggestion(
					balanceForTTZ,
					rate,
					currentPayment,
					ttz,
				);

				// Pre-compute overpayment scenarios: minimum, +25%, +50%
				const now = new Date();
				overpaymentScenarios = ([1, 1.25, 1.5] as const).map((mult, i) => {
					const label = i === 0 ? "Minimum" : i === 1 ? "+25%" : "+50%";
					const payment = Math.round(currentPayment * mult);
					const result = calculateTTZ(balanceForTTZ, rate, {
						type: "flat",
						flat: payment,
					});
					let debtFreeDate: string | null = null;
					if (result.months !== null) {
						const d = new Date(now);
						d.setMonth(d.getMonth() + result.months);
						debtFreeDate = d.toLocaleDateString("en-GB", {
							month: "short",
							year: "numeric",
						});
					}
					return {
						label,
						payment,
						ttzMonths: result.months,
						totalInterest: result.totalInterest,
						debtFreeDate,
					};
				});

				// Rate change stress test: +2% and +5% scenarios
				rateScenarios = [200, 500].map((delta) => {
					const scenarioRate = rate + delta;
					const result = calculateTTZ(balanceForTTZ, scenarioRate, rule);
					const cappedMonths =
						result.months !== null ? Math.min(result.months, 300) : null;
					let debtFreeDate: string | null = null;
					if (cappedMonths !== null) {
						const d = new Date(now);
						d.setMonth(d.getMonth() + cappedMonths);
						debtFreeDate = d.toLocaleDateString("en-GB", {
							month: "short",
							year: "numeric",
						});
					}
					const ttzDelta =
						cappedMonths !== null ? cappedMonths - ttz!.months! : null;
					return {
						label: `+${delta / 100}%`,
						rate: scenarioRate,
						ttzMonths: cappedMonths,
						ttzDelta,
						totalInterest: result.totalInterest,
						debtFreeDate,
					};
				});
			}

			// Break-even month: first row where cumulative interest ≥ originalPrincipal
			if (account.originalPrincipal) {
				let cumInterest = 0;
				for (let i = 0; i < ttzResult.projection.length; i++) {
					cumInterest += ttzResult.projection[i].interest;
					if (cumInterest >= account.originalPrincipal) {
						breakEvenMonthIndex = i;
						break;
					}
				}
			}
		}
	}

	// Cross-account liability context for payoff strategy tip
	if (account.category === "liability") {
		const allLiabilities = await db.query.accounts.findMany({
			where: and(
				withUserFilter(locals.user.id, accounts),
				eq(accounts.category, "liability"),
			),
			columns: { id: true },
		});

		if (allLiabilities.length > 1) {
			const accountData = await Promise.all(
				allLiabilities.map(async (a) => {
					const [bal, r] = await Promise.all([
						getCurrentBalanceForAccount(a.id),
						getCurrentRate(a.id),
					]);
					return { id: a.id, balance: Math.abs(bal), rate: r };
				}),
			);

			const ratedAccounts = accountData.filter((a) => a.rate !== null);
			const maxRate =
				ratedAccounts.length > 0
					? Math.max(...ratedAccounts.map((a) => a.rate!))
					: null;
			const minBalance = Math.min(...accountData.map((a) => a.balance));

			const current = accountData.find((a) => a.id === account.id);
			let strategy: "avalanche" | "snowball" | null = null;
			if (current?.rate !== null && current?.rate === maxRate) {
				strategy = "avalanche";
			} else if (current?.balance === minBalance) {
				strategy = "snowball";
			}

			liabilityContext = {
				strategy,
				totalLiabilities: allLiabilities.length,
			};
		}
	}

	// Recurring transaction pattern detection (all account types, full history)
	const allTransactionsForPatterns = await db.query.accountTransactions.findMany(
		{
			where: eq(accountTransactions.accountId, account.id),
			columns: { description: true, amount: true, transactionDate: true },
		},
	);
	const recurringPatterns = detectRecurringPatterns(allTransactionsForPatterns);

	// Get notes for this account
	const notes = await db.query.accountNotes.findMany({
		where: eq(accountNotes.accountId, account.id),
		orderBy: desc(accountNotes.createdAt),
		limit: 10, // Show 10 most recent notes
	});

	// Get BoE base rate from settings (stored as basis points, e.g. "450" = 4.50%)
	const boeRow = await db.query.settings.findFirst({
		where: eq(settings.key, "boeBaseRate"),
	});
	const boeBaseRate = boeRow ? parseInt(boeRow.value, 10) : null;

	// Compute rate spread: accountRate - boeBaseRate (signed, basis points)
	const rateSpread =
		boeBaseRate !== null && currentRate !== null
			? currentRate - boeBaseRate
			: null;

	// Get spending categories for transaction form
	const categories = await getCategories(locals.user.id);

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
		isaSummary,
		availableTaxYears: sortedTaxYears,
		projection,
		ttz,
		notes,
		debtHealthStatus,
		paymentSuggestion,
		overpaymentScenarios,
		rateScenarios,
		liabilityContext,
		breakEvenMonthIndex,
		recurringPatterns,
		boeBaseRate,
		rateSpread,
		categories,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false },
		],
		alerts: await getAlertsForAccount(account.id, locals.user.id),
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
		const categoryIdStr = formData.get("categoryId") as string | null;
		const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null;
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

		// Validate date format (YYYY-MM-DD)
		if (!transactionDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDateStr)) {
			return fail(400, { error: "Invalid date format. Use YYYY-MM-DD." });
		}
		const transactionDate = new Date(`${transactionDateStr}T00:00:00.000Z`);
		if (Number.isNaN(transactionDate.getTime())) {
			return fail(400, { error: "Invalid date" });
		}

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
					categoryId,
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

		// Validate date format (YYYY-MM-DD)
		if (!effectiveFromStr || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromStr)) {
			return fail(400, { error: "Invalid date format. Use YYYY-MM-DD." });
		}
		const effectiveFrom = new Date(`${effectiveFromStr}T00:00:00.000Z`);
		if (Number.isNaN(effectiveFrom.getTime())) {
			return fail(400, { error: "Invalid date" });
		}

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

	/**
	 * Add a new note to an account
	 */
	addNote: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("addNote", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("addNote", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		const formData = await request.formData();
		const content = formData.get("content") as string;

		// Validate content
		if (!content || content.trim().length === 0) {
			return fail(400, { error: "Note content is required" });
		}

		if (content.length > 5000) {
			return fail(400, {
				error: "Note content must be 5000 characters or less",
			});
		}

		try {
			const result = await createNote({
				accountId: account.id,
				content: content.trim(),
			});

			devLog("addNote", "Note created successfully", {
				accountSlug,
				noteSlug: result.noteSlug,
			});

			return { success: true, noteSlug: result.noteSlug };
		} catch (err) {
			logError("addNote", "Failed to create note", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to create note" });
		}
	},

	/**
	 * Delete a note
	 */
	deleteNote: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("deleteNote", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("deleteNote", "Account not found", {
				accountSlug,
				userId: locals.user.id,
			});
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		const formData = await request.formData();
		const noteSlug = formData.get("noteSlug") as string;

		if (!noteSlug) {
			return fail(400, { error: "Note slug is required" });
		}

		try {
			// Verify note belongs to this account (account ownership already validated above)
			const note = await getNoteBySlug(noteSlug);
			if (!note || note.accountId !== account.id) {
				return fail(404, { error: "Note not found" });
			}

			await deleteNote(noteSlug);

			devLog("deleteNote", "Note deleted successfully", {
				accountSlug,
				noteSlug,
			});

			return { success: true };
		} catch (err) {
			logError("deleteNote", "Failed to delete note", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to delete note" });
		}
	},
};
