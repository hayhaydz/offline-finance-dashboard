/**
 * ISA Breakdown Module
 *
 * Provides traceable, auditable ISA subscription reporting for UK tax years.
 * Tracks deposits into ISA, LISA, and Premium Bonds accounts against the
 * £20,000 annual subscription allowance.
 *
 * UK tax year: 6 April to 5 April (inclusive)
 * ISA allowance: £20,000 per tax year
 *
 * NOTE: Once subscribed to an ISA, money remains "used" for allowance purposes
 * even if withdrawn. Transfers between ISAs should not double-count.
 */

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { TAX_FREE_WRAPPERS, MONTH_NAMES } from "$lib/utils/domain-constants";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import {
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from "$lib/server/calculations";
import { aggregateByKey } from "$lib/server/utils/aggregate";
import {
	reconcileBreakdowns,
	addWarningFlag,
} from "$lib/server/utils/reconciliation";
import { devLog } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

import type {
	ISATransaction,
	ISAAccountBreakdown,
	ISAMonthBreakdown,
	ISAInstitutionBreakdown,
	ISATaxWrapperBreakdown,
	ISAMeta,
	ISAActualBreakdown,
	ISAReconciliation,
	ISABreakdownReport,
} from "$lib/types/breakdown";

// Re-export types for backward compatibility
export type {
	ISATransaction,
	ISAAccountBreakdown,
	ISAMonthBreakdown,
	ISAInstitutionBreakdown,
	ISATaxWrapperBreakdown,
	ISAMeta,
	ISAActualBreakdown,
	ISAReconciliation,
	ISABreakdownReport,
};

/**
 * Fetch all ISA subscription transactions for a tax year
 * Includes account details for display and filtering
 *
 * @param params - User ID and tax year bounds
 * @returns Array of ISA transactions with running total
 */
async function getISATransactions(params: {
	userId: number;
	taxYearStart: Date;
	taxYearEnd: Date;
}): Promise<ISATransaction[]> {
	const { userId, taxYearStart, taxYearEnd } = params;

	devLog("isaBreakdown", "Fetching ISA transactions", {
		userId,
		taxYearStart: taxYearStart.toISOString(),
		taxYearEnd: taxYearEnd.toISOString(),
	});

	// Fetch ISA accounts for user
	const isaAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			inArray(accounts.taxWrapper, TAX_FREE_WRAPPERS),
		),
		columns: {
			id: true,
			slug: true,
			name: true,
			type: true,
			institution: true,
			taxWrapper: true,
		},
	});

	if (isaAccounts.length === 0) {
		devLog("isaBreakdown", "No ISA accounts found for user", { userId });
		return [];
	}

	const accountIds = isaAccounts.map((a) => a.id);
	const accountMap = new Map(isaAccounts.map((a) => [a.id, a]));

	// Fetch deposit and transfer_in transactions
	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			inArray(accountTransactions.type, ["deposit", "transfer_in"]),
			gte(accountTransactions.transactionDate, taxYearStart),
			lte(accountTransactions.transactionDate, taxYearEnd),
		),
		orderBy: [
			asc(accountTransactions.transactionDate),
			asc(accountTransactions.id),
		],
		columns: {
			id: true,
			slug: true,
			type: true,
			amount: true,
			description: true,
			transactionDate: true,
			accountId: true,
		},
	});

	devLog("isaBreakdown", "Fetched ISA transactions", {
		userId,
		transactionCount: transactions.length,
	});

	// Build transactions with account details and running total
	// NOTE: transfer_in between ISAs should be excluded from allowance calculation
	// to avoid double-counting. Only "deposit" transactions count toward subscription.
	const allowanceTransactions: ISATransaction[] = [];
	let runningTotal = 0;

	for (const tx of transactions) {
		const account = accountMap.get(tx.accountId);
		if (!account) continue;

		// Only deposits count toward ISA subscription allowance
		// transfer_in is for ISA-to-ISA transfers which don't use additional allowance
		if (tx.type === "deposit") {
			runningTotal += Math.max(0, tx.amount);
		}

		allowanceTransactions.push({
			id: tx.id,
			slug: tx.slug,
			transactionDate: tx.transactionDate,
			type: tx.type,
			amount: tx.amount,
			description: tx.description,
			runningTotal,
			accountId: account.id,
			accountSlug: account.slug,
			accountName: account.name,
			accountType: account.type,
			accountInstitution: account.institution,
			accountTaxWrapper: account.taxWrapper,
		});
	}

	return allowanceTransactions;
}

/**
 * Aggregate ISA subscriptions by account
 */
function getISABreakdownByAccount(
	transactions: ISATransaction[],
): ISAAccountBreakdown[] {
	const byAccount = new Map<number, ISAAccountBreakdown>();

	for (const tx of transactions) {
		// Only count deposits toward subscription total
		if (tx.type !== "deposit") continue;

		const existing = byAccount.get(tx.accountId);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount++;
		} else {
			byAccount.set(tx.accountId, {
				accountId: tx.accountId,
				accountSlug: tx.accountSlug,
				accountName: tx.accountName,
				accountType: tx.accountType,
				accountInstitution: tx.accountInstitution,
				accountTaxWrapper: tx.accountTaxWrapper,
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}

	return Array.from(byAccount.values());
}

/**
 * Aggregate ISA subscriptions by month
 */
function getISABreakdownByMonth(
	transactions: ISATransaction[],
): ISAMonthBreakdown[] {
	const byMonth = new Map<string, ISAMonthBreakdown>();
	const monthNames = MONTH_NAMES;

	for (const tx of transactions) {
		if (tx.type !== "deposit") continue;

		const year = tx.transactionDate.getUTCFullYear();
		const month = tx.transactionDate.getUTCMonth() + 1; // 1-12
		const key = `${year}-${month}`;

		const existing = byMonth.get(key);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount++;
		} else {
			byMonth.set(key, {
				year,
				month,
				monthName: monthNames[month - 1],
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}

	return Array.from(byMonth.values());
}

/**
 * Aggregate ISA subscriptions by institution
 */
function getISABreakdownByInstitution(
	transactions: ISATransaction[],
): ISAInstitutionBreakdown[] {
	const deposits = transactions.filter((tx) => tx.type === "deposit");

	return aggregateByKey(
		deposits,
		(tx) => tx.accountInstitution || "Unknown",
		(tx) => tx.amount,
	).map(({ key: institution, total, count }) => ({
		institution,
		total,
		transactionCount: count,
	}));
}

/**
 * Aggregate ISA subscriptions by tax wrapper
 */
function getISABreakdownByTaxWrapper(
	transactions: ISATransaction[],
): ISATaxWrapperBreakdown[] {
	const displayNames: Record<string, string> = {
		isa: "ISA",
		lisa: "LISA",
		"premium-bonds": "Premium Bonds",
	};

	const byWrapper = new Map<string, ISATaxWrapperBreakdown>();

	for (const tx of transactions) {
		if (tx.type !== "deposit") continue;

		const wrapper = tx.accountTaxWrapper;
		const existing = byWrapper.get(wrapper);

		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount++;
		} else {
			byWrapper.set(wrapper, {
				taxWrapper: wrapper,
				displayName: displayNames[wrapper] || wrapper.toUpperCase(),
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}

	return Array.from(byWrapper.values());
}

/**
 * Generate comprehensive ISA breakdown report for a tax year
 *
 * @param params - User ID, tax year bounds
 * @returns Complete ISA breakdown report with meta, actuals, and reconciliation
 */
export async function getISABreakdownReport(params: {
	userId: number;
	taxYearStart: Date;
	taxYearEnd: Date;
}): Promise<ISABreakdownReport> {
	const { userId, taxYearStart, taxYearEnd } = params;

	devLog("isaBreakdown", "Generating ISA breakdown report", {
		userId,
		taxYearStart: taxYearStart.toISOString(),
		taxYearEnd: taxYearEnd.toISOString(),
	});

	// Calculate meta information
	const asOfDate = new Date();
	const daysRemainingInTaxYear = Math.max(
		0,
		Math.ceil(
			(taxYearEnd.getTime() - asOfDate.getTime()) / MS_PER_DAY,
		),
	);

	// Fetch all ISA transactions
	const transactions = await getISATransactions({
		userId,
		taxYearStart,
		taxYearEnd,
	});

	// Calculate total allowance used (sum of deposits only)
	const allowanceUsed = transactions
		.filter((tx) => tx.type === "deposit")
		.reduce((sum, tx) => sum + tx.amount, 0);

	const allowanceRemaining = Math.max(
		0,
		ISA_ALLOWANCE_IN_CENTS - allowanceUsed,
	);
	const utilizationPercent = Math.min(
		100,
		Math.round((allowanceUsed / ISA_ALLOWANCE_IN_CENTS) * 100),
	);

	const meta: ISAMeta = {
		taxYearStart,
		taxYearEnd,
		taxYearLabel: `${taxYearStart.getUTCFullYear()}-${String(taxYearEnd.getUTCFullYear()).slice(-2)}`,
		asOfDate,
		daysRemainingInTaxYear,
		allowanceInCents: ISA_ALLOWANCE_IN_CENTS,
		allowanceUsed,
		allowanceRemaining,
		utilizationPercent,
		overAllowance: allowanceUsed > ISA_ALLOWANCE_IN_CENTS,
	};

	// Generate breakdowns
	const byAccount = getISABreakdownByAccount(transactions);
	const byMonth = getISABreakdownByMonth(transactions);
	const byInstitution = getISABreakdownByInstitution(transactions);
	const byTaxWrapper = getISABreakdownByTaxWrapper(transactions);

	const actual: ISAActualBreakdown = {
		total: allowanceUsed,
		byAccount,
		byMonth,
		byInstitution,
		byTaxWrapper,
		transactions,
	};

	// Reconciliation checks
	const { flags, deltas } = reconcileBreakdowns(allowanceUsed, [
		{
			label: "Account breakdown",
			category: "by_account",
			sum: byAccount.reduce((s, a) => s + a.total, 0),
		},
		{
			label: "Monthly breakdown",
			category: "by_month",
			sum: byMonth.reduce((s, m) => s + m.total, 0),
		},
		{
			label: "Transaction",
			category: "transactions",
			sum: transactions
				.filter((tx) => tx.type === "deposit")
				.reduce((s, tx) => s + tx.amount, 0),
		},
	]);

	if (allowanceUsed > ISA_ALLOWANCE_IN_CENTS) {
		addWarningFlag(
			flags,
			"allowance",
			`ISA allowance exceeded by ${allowanceUsed - ISA_ALLOWANCE_IN_CENTS} cents`,
		);
	}

	const totalVsByAccountDelta = deltas.by_account ?? 0;
	const totalVsByMonthDelta = deltas.by_month ?? 0;
	const totalVsTransactionsDelta = deltas.transactions ?? 0;

	const reconciliation: ISAReconciliation = {
		totalVsByAccountDelta,
		totalVsByMonthDelta,
		totalVsTransactionsDelta,
		flags,
	};

	devLog("isaBreakdown", "ISA breakdown report generated", {
		userId,
		allowanceUsed,
		utilizationPercent,
		reconciliationFlags: flags.length,
	});

	return {
		meta,
		actual,
		reconciliation,
	};
}

/**
 * Get available tax years for ISA breakdown navigation
 * Based on existing ISA deposit transactions
 */
export async function getISAAvailableTaxYears(
	userId: number,
): Promise<Array<{ slug: string; start: Date; end: Date }>> {
	// Fetch all ISA accounts
	const isaAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			inArray(accounts.taxWrapper, TAX_FREE_WRAPPERS),
		),
		columns: { id: true },
	});

	if (isaAccounts.length === 0) {
		return [];
	}

	const accountIds = isaAccounts.map((a) => a.id);

	// Fetch all deposit transactions
	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			eq(accountTransactions.type, "deposit"),
		),
		columns: { transactionDate: true },
	});

	// Build available tax years from transactions
	const availableTaxYears = new Map<
		string,
		{ slug: string; start: Date; end: Date }
	>();

	for (const tx of transactions) {
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

	// Sort by year (newest first)
	return Array.from(availableTaxYears.values()).sort(
		(a, b) => b.start.getTime() - a.start.getTime(),
	);
}
