import { fail } from "@sveltejs/kit";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accountNotes,
	accounts,
	accountTransactions,
	interestRates,
	settings,
} from "$lib/db/schema";
import { requireAccountOwnership } from "$lib/server/account-ownership";
import { buildAvailableTaxYears } from "$lib/server/account-tax-year";
import { getAlertsForAccount } from "$lib/server/alerts";
import { getCategories } from "$lib/server/categories";
import {
	calculateMinimumPayment,
	calculatePaymentSuggestion,
	formatTaxYearStartParam,
	getDebtHealthStatus,
	getTaxYearEndFromStart,
	parseTaxYearStart,
} from "$lib/server/debt-projections";
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
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";
import { createNote, deleteNote, getNoteBySlug } from "$lib/server/notes";
import {
	buildOverpaymentScenarios,
	buildRateStressScenarios,
	calculateBreakEvenMonth,
} from "$lib/server/rate-scenarios";
import { detectRecurringPatterns } from "$lib/server/recurring-patterns";
import { bandForTaxYear } from "$lib/server/tax-bands";
import {
	createTransaction,
	deleteTransaction,
	getTransactionBySlug,
} from "$lib/server/transactions";
import { requireAuth } from "$lib/server/utils/auth-guard";
import {
	FIELD_LIMITS,
	requireDateISO,
	requireEnum,
	requireString,
} from "$lib/server/validation";
import {
	calculateTTZ,
	getProjectionNullReason,
} from "$lib/utils/debt-calculator";
import {
	getTransactionTypesForAccountType,
	NEGATIVE_AMOUNT_TYPES,
	SIGNED_AMOUNT_TYPES,
	type TransactionType,
} from "$lib/utils/domain-constants";
import {
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
	taxYearLabelFromDate,
} from "$lib/utils/tax-year-utils";
import {
	computeMonthTotals,
	resolveLedgerMonth,
	resolveLedgerTypeFilter,
	utcMonthRange,
} from "$lib/utils/transaction-grouping";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const account = await requireAccountOwnership(locals, params.slug);
	// requireAuth returns non-null (redirects when unauthenticated)
	const user = requireAuth(locals);

	// Derive balances from transactions (source of truth).
	const [currentBalance, monthlyBalances] = await Promise.all([
		getCurrentBalanceForAccount(account.id),
		getMonthlyBalanceHistory(account.id, 24),
	]);

	// Month-keyed ledger pagination: one page = one calendar month (UTC,
	// boundaries matching transaction-grouping.ts). The data-bearing months
	// come from the monthly balances already fetched. Legacy `?page=` /
	// `?txPage=` params are ignored (dead per decision 2026-10-18) — the
	// default latest month renders.
	const ledgerMonthKeys = monthlyBalances.map((m) => m.monthKey); // oldest → newest
	const selectedMonthKey = resolveLedgerMonth(
		ledgerMonthKeys,
		url.searchParams.get("month"),
	);
	const monthRange =
		selectedMonthKey !== null ? utcMonthRange(selectedMonthKey) : null;

	// Full month of transactions — no offset/limit, so a month can never be
	// split across pages and totals always see the complete range.
	const transactions = monthRange
		? await db.query.accountTransactions.findMany({
				where: and(
					eq(accountTransactions.accountId, account.id),
					gte(accountTransactions.transactionDate, monthRange.start),
					lt(accountTransactions.transactionDate, monthRange.end),
				),
				orderBy: desc(accountTransactions.transactionDate),
				with: {
					category: true,
				},
			})
		: [];

	const ledgerMonth =
		selectedMonthKey !== null
			? {
					monthKey: selectedMonthKey,
					totals: computeMonthTotals(transactions, (tx) => tx.amount),
				}
			: null;

	// `?type=` prefilter (alert deep links): validated against
	// TRANSACTION_TYPES; invalid values are ignored. Filtering is
	// client-side display-only — rows for the whole month are loaded
	// so totals stay full-month, and the param is never persisted.
	const ledgerTypeFilter = resolveLedgerTypeFilter(
		url.searchParams.get("type"),
	);

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
		where: withUserFilter(user.id, accounts),
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
	const availableTaxYears = buildAvailableTaxYears(interestTransactions);
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

	// Get unified interest summary with projection eligibility.
	// Band resolves for the SELECTED tax year (history → legacy cache).
	const { band: interestTaxBand } = await bandForTaxYear(
		user.id,
		taxYearLabelFromDate(taxYear.start),
	);
	const interestSummary = await getAccountInterestSummary({
		accountId: account.id,
		taxYearStart: taxYear.start,
		taxYearEnd: taxYear.end,
		taxBand: interestTaxBand,
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
			userId: user.id,
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
	let projectionNullReason:
		| "no_minimum_payment"
		| "payment_below_interest"
		| null = null;

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
			projectionNullReason = getProjectionNullReason(ttzResult.months, rule);

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
				overpaymentScenarios = buildOverpaymentScenarios(
					([1, 1.25, 1.5] as const).map((multiplier) => {
						const payment = Math.round(currentPayment * multiplier);
						return {
							multiplier,
							ttzResult: calculateTTZ(balanceForTTZ, rate, {
								type: "flat",
								flat: payment,
							}),
						};
					}),
					currentPayment,
					now,
				);

				// Rate change stress test: +2% and +5% scenarios
				rateScenarios = buildRateStressScenarios(
					[200, 500].map((delta) => {
						const scenarioRate = rate + delta;
						return {
							basisPointDelta: delta,
							scenarioRate,
							ttzResult: calculateTTZ(balanceForTTZ, scenarioRate, rule),
						};
					}),
					ttzResult.months,
					now,
				);
			}

			// Break-even month: first row where cumulative interest ≥ originalPrincipal
			if (account.originalPrincipal) {
				const result = calculateBreakEvenMonth(
					ttzResult.projection,
					account.originalPrincipal,
				);
				// calculateBreakEvenMonth returns 1-indexed month; convert to 0-indexed
				breakEvenMonthIndex = result !== null ? result - 1 : null;
			}
		}
	}

	// Cross-account liability context for payoff strategy tip
	if (account.category === "liability") {
		const allLiabilities = await db.query.accounts.findMany({
			where: and(
				withUserFilter(user.id, accounts),
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

			const ratedAccounts = accountData.filter(
				(a): a is { id: number; balance: number; rate: number } =>
					a.rate !== null,
			);
			const maxRate =
				ratedAccounts.length > 0
					? Math.max(...ratedAccounts.map((a) => a.rate))
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
	const allTransactionsForPatterns =
		await db.query.accountTransactions.findMany({
			where: eq(accountTransactions.accountId, account.id),
			columns: { description: true, amount: true, transactionDate: true },
		});
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
	const categories = await getCategories(user.id);

	return {
		account,
		monthlyBalances: monthlyBalances.toReversed(),
		currentBalance,
		transactions,
		ledgerMonth,
		ledgerMonths: ledgerMonthKeys.toReversed(), // newest → oldest
		ledgerTypeFilter,
		rates,
		currentRate,
		interestSummary: summaryWithNav,
		isaSummary,
		availableTaxYears: sortedTaxYears,
		projection,
		ttz,
		projectionNullReason,
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
		alerts: await getAlertsForAccount(account.id, user.id),
	};
};

export const actions: Actions = {
	/**
	 * Add a new transaction to an account
	 */
	addTransaction: async ({ request, locals, params }) => {
		const account = await requireAccountOwnership(locals, params.slug);

		const formData = await request.formData();
		const type = formData.get("type") as TransactionType;
		const amountStr = formData.get("amount") as string;
		const description = formData.get("description") as string | null;
		const categoryIdStr = formData.get("categoryId") as string | null;
		const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null;
		const transactionDateStr = formData.get("transactionDate") as string;

		// Validate type — single-sourced from TRANSACTION_TYPES via the
		// per-account-type filter map (same source the creator form renders from)
		const VALID_TX_TYPES: readonly TransactionType[] =
			getTransactionTypesForAccountType(account.type);
		const typeResult = requireEnum(type, VALID_TX_TYPES, "Transaction type");
		if (!typeResult.ok) {
			return fail(400, { error: typeResult.error });
		}

		// Parse amount (handle both decimal and integer input)
		const parsedAmount = Math.round(parseFloat(amountStr) * 100);
		if (Number.isNaN(parsedAmount) || parsedAmount === 0) {
			return fail(400, { error: "Invalid amount" });
		}
		// Sign normalisation per glossary: money-out/debt-up types are forced
		// negative, value_change keeps the entered sign, everything else
		// (deposit, refund, interest, payment, ...) is forced positive.
		const amount = NEGATIVE_AMOUNT_TYPES.includes(type)
			? -Math.abs(parsedAmount)
			: SIGNED_AMOUNT_TYPES.includes(type)
				? parsedAmount
				: Math.abs(parsedAmount);

		const dateResult = requireDateISO(transactionDateStr, "Transaction date");
		if (!dateResult.ok) {
			return fail(400, { error: dateResult.error });
		}
		const transactionDate = dateResult.date;

		if (description) {
			const descResult = requireString(
				description,
				"Description",
				FIELD_LIMITS.BALANCE_NOTES,
			);
			if (!descResult.ok) {
				return fail(400, { error: descResult.error });
			}
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

			if (!result.ok) {
				logError("addTransaction", "Failed to create transaction", {
					error: result.error,
				});
				return fail(500, { error: result.error });
			}

			if (isVerboseDebug()) {
				devLog("addTransaction", "Transaction created successfully", {
					accountSlug: params.slug,
					transactionSlug: result.data,
					type,
					amount,
				});
			}

			return { success: true, transactionSlug: result.data };
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
		const account = await requireAccountOwnership(locals, params.slug);
		const user = requireAuth(locals);

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
				transaction.account.userId !== user.id
			) {
				return fail(404, { error: "Transaction not found" });
			}

			const result = await deleteTransaction(transactionSlug);
			if (!result.ok) {
				logError("deleteTransaction", "Failed to delete transaction", {
					error: result.error,
				});
				return fail(500, { error: result.error });
			}

			if (isVerboseDebug()) {
				devLog("deleteTransaction", "Transaction deleted successfully", {
					accountSlug: params.slug,
					transactionSlug,
				});
			}

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
		const account = await requireAccountOwnership(locals, params.slug);

		const formData = await request.formData();
		const rateStr = formData.get("rate") as string;
		const effectiveFromStr = formData.get("effectiveFrom") as string;

		// Parse rate (percentage to basis points)
		const ratePercent = parseFloat(rateStr);
		if (Number.isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
			return fail(400, { error: "Invalid rate (must be 0-100%)" });
		}
		const rate = parseRateToBasisPoints(ratePercent);

		const dateResult = requireDateISO(effectiveFromStr, "Effective from date");
		if (!dateResult.ok) {
			return fail(400, { error: dateResult.error });
		}
		const effectiveFrom = dateResult.date;

		try {
			const result = await createInterestRate(
				{
					accountId: account.id,
					rate,
					effectiveFrom,
				},
				account,
			);

			if (!result.ok) {
				logError("addInterestRate", "Failed to create interest rate", {
					error: result.error,
				});
				return fail(500, { error: result.error });
			}

			if (isVerboseDebug()) {
				devLog("addInterestRate", "Interest rate created successfully", {
					accountSlug: params.slug,
					rateId: result.data,
					rate,
					effectiveFrom: effectiveFromStr,
				});
			}

			return { success: true, rateId: result.data };
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
		const account = await requireAccountOwnership(locals, params.slug);
		const user = requireAuth(locals);

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
				rate.account.userId !== user.id
			) {
				return fail(404, { error: "Interest rate not found" });
			}

			const deleteResult = await deleteInterestRate(rateId);

			if (!deleteResult.ok) {
				logError("deleteInterestRate", "Failed to delete interest rate", {
					error: deleteResult.error,
				});
				return fail(500, { error: deleteResult.error });
			}

			if (isVerboseDebug()) {
				devLog("deleteInterestRate", "Interest rate deleted successfully", {
					accountSlug: params.slug,
					rateId,
				});
			}

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
		const account = await requireAccountOwnership(locals, params.slug);

		const formData = await request.formData();
		const content = formData.get("content") as string;

		const noteResult = requireString(
			content,
			"Note content",
			FIELD_LIMITS.NOTE_CONTENT,
		);
		if (!noteResult.ok) {
			return fail(400, { error: noteResult.error });
		}
		const trimmedContent = noteResult.value;

		try {
			const result = await createNote({
				accountId: account.id,
				content: trimmedContent,
			});

			if (!result.ok) {
				logError("addNote", "Failed to create note", {
					error: result.error,
				});
				return fail(500, { error: result.error });
			}

			if (isVerboseDebug()) {
				devLog("addNote", "Note created successfully", {
					accountSlug: params.slug,
					noteSlug: result.data,
				});
			}

			return { success: true, noteSlug: result.data };
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
		const account = await requireAccountOwnership(locals, params.slug);

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

			if (isVerboseDebug()) {
				devLog("deleteNote", "Note deleted successfully", {
					accountSlug: params.slug,
					noteSlug,
				});
			}

			return { success: true };
		} catch (err) {
			logError("deleteNote", "Failed to delete note", {
				error: err instanceof Error ? err.message : String(err),
			});
			return fail(500, { error: "Failed to delete note" });
		}
	},
};
