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

import { ISA_ALLOWANCE_IN_CENTS } from "$lib/utils/tax-year-utils";
import { reconcileBreakdowns, addWarningFlag } from "$lib/server/utils/reconciliation";
import { devLog, isVerboseDebug } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

import { getISATransactions, getISAAvailableTaxYears } from "./queries";
import {
	getISABreakdownByAccount,
	getISABreakdownByMonth,
	getISABreakdownByInstitution,
	getISABreakdownByTaxWrapper,
} from "./aggregations";

import type {
	ISAMeta,
	ISAActualBreakdown,
	ISAReconciliation,
	ISABreakdownReport,
	ISATransaction,
	ISAAccountBreakdown,
	ISAMonthBreakdown,
	ISAInstitutionBreakdown,
	ISATaxWrapperBreakdown,
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

// Re-export query functions
export { getISAAvailableTaxYears };

/**
 * Generate comprehensive ISA breakdown report for a tax year.
 */
export async function getISABreakdownReport(params: {
	userId: number;
	taxYearStart: Date;
	taxYearEnd: Date;
}): Promise<ISABreakdownReport> {
	const { userId, taxYearStart, taxYearEnd } = params;

	if (isVerboseDebug()) {
		devLog("isaBreakdown", "Generating ISA breakdown report", {
			userId,
			taxYearStart: taxYearStart.toISOString(),
			taxYearEnd: taxYearEnd.toISOString(),
		});
	}

	const asOfDate = new Date();
	const daysRemainingInTaxYear = Math.max(
		0,
		Math.ceil((taxYearEnd.getTime() - asOfDate.getTime()) / MS_PER_DAY),
	);

	const transactions = await getISATransactions({
		userId,
		taxYearStart,
		taxYearEnd,
	});

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

	const reconciliation: ISAReconciliation = {
		totalVsByAccountDelta: deltas.by_account ?? 0,
		totalVsByMonthDelta: deltas.by_month ?? 0,
		totalVsTransactionsDelta: deltas.transactions ?? 0,
		flags,
	};

	return {
		meta,
		actual,
		reconciliation,
	};
}
