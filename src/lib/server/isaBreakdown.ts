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
import { devLog } from "$lib/utils/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

/**
 * ISA subscription transaction with account details
 */
export interface ISATransaction {
	id: number;
	slug: string;
	transactionDate: Date;
	type: string; // 'deposit', 'transfer_in' (excluded from allowance)
	amount: number; // in cents
	description: string | null;
	runningTotal: number; // cumulative subscription in cents

	// Account details
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string; // 'isa', 'lisa', 'premium-bonds'
}

/**
 * Account breakdown of ISA subscriptions
 */
export interface ISAAccountBreakdown {
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;
	total: number; // in cents subscribed this tax year
	transactionCount: number;
}

/**
 * Monthly breakdown of ISA subscriptions
 */
export interface ISAMonthBreakdown {
	year: number;
	month: number; // 1-12
	monthName: string; // e.g., "April"
	total: number; // in cents subscribed
	transactionCount: number;
}

/**
 * Institution breakdown of ISA subscriptions
 */
export interface ISAInstitutionBreakdown {
	institution: string;
	total: number; // in cents subscribed
	transactionCount: number;
}

/**
 * Tax wrapper breakdown (ISA vs LISA vs Premium Bonds)
 */
export interface ISATaxWrapperBreakdown {
	taxWrapper: string;
	total: number; // in cents subscribed
	transactionCount: number;
	displayName: string; // "ISA", "LISA", "Premium Bonds"
}

/**
 * Meta information about the tax year and allowance status
 */
export interface ISAMeta {
	taxYearStart: Date;
	taxYearEnd: Date;
	taxYearLabel: string; // "2025-26"
	asOfDate: Date;
	daysRemainingInTaxYear: number;
	allowanceInCents: number; // 20_000_00
	allowanceUsed: number; // in cents
	allowanceRemaining: number; // in cents
	utilizationPercent: number; // 0-100
	overAllowance: boolean;
}

/**
 * Actual ISA subscriptions breakdown with all dimensions
 */
export interface ISAActualBreakdown {
	total: number; // in cents subscribed
	byAccount: ISAAccountBreakdown[];
	byMonth: ISAMonthBreakdown[];
	byInstitution: ISAInstitutionBreakdown[];
	byTaxWrapper: ISATaxWrapperBreakdown[];
	transactions: ISATransaction[];
}

/**
 * ISA subscription reconciliation for data integrity
 */
export interface ISAReconciliation {
	totalVsByAccountDelta: number; // Should be 0
	totalVsByMonthDelta: number; // Should be 0
	totalVsTransactionsDelta: number; // Should be 0
	flags: Array<{
		type: "warning" | "error";
		message: string;
	}>;
}

/**
 * Complete ISA breakdown report
 */
export interface ISABreakdownReport {
	meta: ISAMeta;
	actual: ISAActualBreakdown;
	reconciliation: ISAReconciliation;
}

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
	const byInstitution = new Map<string, ISAInstitutionBreakdown>();

	for (const tx of transactions) {
		if (tx.type !== "deposit") continue;

		const institution = tx.accountInstitution || "Unknown";
		const existing = byInstitution.get(institution);

		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount++;
		} else {
			byInstitution.set(institution, {
				institution,
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}

	return Array.from(byInstitution.values());
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
	const totalVsByAccountDelta =
		allowanceUsed - byAccount.reduce((sum, a) => sum + a.total, 0);
	const totalVsByMonthDelta =
		allowanceUsed - byMonth.reduce((sum, m) => sum + m.total, 0);
	const totalVsTransactionsDelta =
		allowanceUsed -
		transactions
			.filter((tx) => tx.type === "deposit")
			.reduce((sum, tx) => sum + tx.amount, 0);

	const flags: Array<{ type: "warning" | "error"; message: string }> = [];

	if (totalVsByAccountDelta !== 0) {
		flags.push({
			type: "error",
			message: `Account breakdown delta: ${totalVsByAccountDelta} cents`,
		});
	}
	if (totalVsByMonthDelta !== 0) {
		flags.push({
			type: "error",
			message: `Month breakdown delta: ${totalVsByMonthDelta} cents`,
		});
	}
	if (totalVsTransactionsDelta !== 0) {
		flags.push({
			type: "error",
			message: `Transaction delta: ${totalVsTransactionsDelta} cents`,
		});
	}

	if (allowanceUsed > ISA_ALLOWANCE_IN_CENTS) {
		flags.push({
			type: "warning",
			message: `ISA allowance exceeded by ${allowanceUsed - ISA_ALLOWANCE_IN_CENTS} cents`,
		});
	}

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
