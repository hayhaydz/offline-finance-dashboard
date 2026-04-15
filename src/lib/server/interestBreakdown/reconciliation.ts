/**
 * Interest Breakdown — Reconciliation
 *
 * Generates reconciliation report to validate data integrity.
 * Checks that breakdowns sum to headline totals and flags any discrepancies.
 */

import { formatCurrency } from "$lib/utils/currency";
import { devLog } from "$lib/server/logger";

import type {
	ReconciliationFlag,
	InterestReconciliationReport,
} from "$lib/types/breakdown";

import { getActualInterestBreakdown } from "./aggregations";

/**
 * Generate reconciliation report to validate data integrity.
 * Checks that breakdowns sum to headline totals and flags any discrepancies.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April)
 * @param taxYearEnd - End of tax year (5 April)
 * @param asOfDate - Reference date for projections (default: now)
 * @returns Reconciliation report with validation results
 */
export async function getInterestReconciliationReport(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
	asOfDate?: Date,
): Promise<InterestReconciliationReport> {
	devLog("getInterestReconciliationReport", "Running reconciliation", {
		userId,
		taxYearStart,
		taxYearEnd,
		asOfDate,
	});

	const flags: ReconciliationFlag[] = [];

	// Get actual breakdown
	const actual = await getActualInterestBreakdown(
		userId,
		taxYearStart,
		taxYearEnd,
	);

	// Check: transactions sum should equal total
	const transactionsSum = actual.transactions.reduce(
		(sum, tx) => sum + tx.amount,
		0,
	);
	const actualVsTransactionsDelta = actual.total - transactionsSum;

	if (actualVsTransactionsDelta !== 0) {
		flags.push({
			type: "error",
			category: "transactions",
			message: `Transaction sum (${formatCurrency(transactionsSum)}) does not match headline total (${formatCurrency(actual.total)})`,
			delta: actualVsTransactionsDelta,
		});
	}

	// Check: by-account sum should equal total
	const byAccountSum = actual.byAccount.reduce(
		(sum, acc) => sum + acc.total,
		0,
	);
	const actualVsByAccountDelta = actual.total - byAccountSum;

	if (actualVsByAccountDelta !== 0) {
		flags.push({
			type: "error",
			category: "by_account",
			message: `Account breakdown sum (${formatCurrency(byAccountSum)}) does not match headline total (${formatCurrency(actual.total)})`,
			delta: actualVsByAccountDelta,
		});
	}

	// Check: by-month sum should equal total
	const byMonthSum = actual.byMonth.reduce(
		(sum, month) => sum + month.total,
		0,
	);
	const actualVsByMonthDelta = actual.total - byMonthSum;

	if (actualVsByMonthDelta !== 0) {
		flags.push({
			type: "error",
			category: "by_month",
			message: `Monthly breakdown sum (${formatCurrency(byMonthSum)}) does not match headline total (${formatCurrency(actual.total)})`,
			delta: actualVsByMonthDelta,
		});
	}

	devLog("getInterestReconciliationReport", "Reconciliation complete", {
		actualVsTransactionsDelta,
		actualVsByAccountDelta,
		actualVsByMonthDelta,
		flagCount: flags.length,
	});

	return {
		actualVsTransactionsDelta,
		actualVsByAccountDelta,
		actualVsByMonthDelta,
		flags,
	};
}
