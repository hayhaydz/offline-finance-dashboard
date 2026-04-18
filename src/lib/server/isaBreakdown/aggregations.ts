/**
 * ISA Breakdown — Aggregations
 *
 * Pure functions that aggregate ISA transactions by various dimensions.
 * These are synchronous — no DB access, just data transformation.
 */

import { MONTH_NAMES } from "$lib/utils/domain-constants";
import { aggregateByKey } from "$lib/server/utils/aggregate";
import { devLog, isVerboseDebug } from "$lib/server/logger";

import type {
	ISATransaction,
	ISAAccountBreakdown,
	ISAMonthBreakdown,
	ISAInstitutionBreakdown,
	ISATaxWrapperBreakdown,
} from "$lib/types/breakdown";

/** Aggregate ISA subscriptions by account. */
export function getISABreakdownByAccount(
	transactions: ISATransaction[],
): ISAAccountBreakdown[] {
	if (isVerboseDebug()) devLog("getISABreakdownByAccount", "Aggregating ISA by account", { txCount: transactions.length });
	const byAccount = new Map<number, ISAAccountBreakdown>();

	for (const tx of transactions) {
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

/** Aggregate ISA subscriptions by month. */
export function getISABreakdownByMonth(
	transactions: ISATransaction[],
): ISAMonthBreakdown[] {
	if (isVerboseDebug()) devLog("getISABreakdownByMonth", "Aggregating ISA by month", { txCount: transactions.length });
	const byMonth = new Map<string, ISAMonthBreakdown>();

	for (const tx of transactions) {
		if (tx.type !== "deposit") continue;

		const year = tx.transactionDate.getUTCFullYear();
		const month = tx.transactionDate.getUTCMonth() + 1;
		const key = `${year}-${month}`;

		const existing = byMonth.get(key);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount++;
		} else {
			byMonth.set(key, {
				year,
				month,
				monthName: MONTH_NAMES[month - 1],
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}

	return Array.from(byMonth.values());
}

/** Aggregate ISA subscriptions by institution. */
export function getISABreakdownByInstitution(
	transactions: ISATransaction[],
): ISAInstitutionBreakdown[] {
	if (isVerboseDebug()) devLog("getISABreakdownByInstitution", "Aggregating ISA by institution", { txCount: transactions.length });
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

/** Aggregate ISA subscriptions by tax wrapper. */
export function getISABreakdownByTaxWrapper(
	transactions: ISATransaction[],
): ISATaxWrapperBreakdown[] {
	if (isVerboseDebug()) devLog("getISABreakdownByTaxWrapper", "Aggregating ISA by tax wrapper", { txCount: transactions.length });
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
