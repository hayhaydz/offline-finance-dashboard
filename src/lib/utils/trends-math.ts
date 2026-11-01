/**
 * Trends math (v3.2 A14 / V6) — pure, pence-denominated helpers for the
 * Monzo-style trends surfaces, adapted to the STATEMENT MODEL (D0):
 * every input is DECLARED history (statement months already entered);
 * projections are always averages of declared months, never realtime
 * confidence.
 *
 * Conventions (match the budget engine in src/lib/server/budgets.ts):
 * - "spend" = outflow magnitude (positive number) after exclusions
 * - moneyIn/moneyOut split by transaction sign
 * - monthKey = "YYYY-MM"; day = 1..daysInMonth; all math is UTC
 */

export interface DailyTx {
	day: number;
	amountPence: number;
}

export interface MonthlyFlow {
	monthKey: string;
	moneyInPence: number;
	moneyOutPence: number;
}

/** Cumulative spend per day 1..daysInMonth (spend = |negative| amounts).
 *  Days with no transactions carry the previous day's cumulative. */
export function cumulativeSpendByDay(txs: DailyTx[], daysInMonth: number): number[] {
	const perDay = new Array<number>(daysInMonth).fill(0);
	for (const tx of txs) {
		if (tx.amountPence < 0 && tx.day >= 1 && tx.day <= daysInMonth) {
			perDay[tx.day - 1] += -tx.amountPence;
		}
	}
	const out = new Array<number>(daysInMonth);
	let running = 0;
	for (let i = 0; i < daysInMonth; i++) {
		running += perDay[i];
		out[i] = running;
	}
	return out;
}

/** In/out totals per month, declared months only (sorted by monthKey). */
export function flowsByMonth(
	txs: Array<{ monthKey: string; amountPence: number }>,
): MonthlyFlow[] {
	const map = new Map<string, MonthlyFlow>();
	for (const tx of txs) {
		let flow = map.get(tx.monthKey);
		if (!flow) {
			flow = { monthKey: tx.monthKey, moneyInPence: 0, moneyOutPence: 0 };
			map.set(tx.monthKey, flow);
		}
		if (tx.amountPence >= 0) flow.moneyInPence += tx.amountPence;
		else flow.moneyOutPence += -tx.amountPence;
	}
	return [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/** Mean of the last `window` values; null when there is no history. */
export function averageOfLast(values: number[], window = 3): number | null {
	if (values.length === 0) return null;
	const slice = values.slice(-window);
	return Math.round(slice.reduce((s, v) => s + v, 0) / slice.length);
}

/**
 * Estimated end balance for the CURRENT statement window (Monzo's
 * "estimated balance", statement-model honest):
 * projected end = start + max(declaredIn, avgIn) − max(declaredOut, avgOut).
 * Declared figures win once they exceed the average — averages only fill
 * the REST of the month. Null when no declared history exists at all.
 */
export function estimateEndBalance(params: {
	startingBalancePence: number;
	declaredInPence: number;
	declaredOutPence: number;
	avgInPence: number | null;
	avgOutPence: number | null;
}): number | null {
	const { startingBalancePence, declaredInPence, declaredOutPence } = params;
	if (params.avgInPence === null && params.avgOutPence === null) return null;
	const projectedIn = Math.max(declaredInPence, params.avgInPence ?? 0);
	const projectedOut = Math.max(declaredOutPence, params.avgOutPence ?? 0);
	return startingBalancePence + projectedIn - projectedOut;
}

/** The DIAGONAL cumulative target baseline: target × (day / daysInMonth). */
export function targetPaceByDay(targetPence: number, daysInMonth: number): number[] {
	const out = new Array<number>(daysInMonth);
	for (let d = 1; d <= daysInMonth; d++) {
		out[d - 1] = Math.round((targetPence * d) / daysInMonth);
	}
	return out;
}

/** + = saved (under target), − = lost (over target). */
export function savedOrLostPence(targetPence: number, spentPence: number): number {
	return targetPence - spentPence;
}

/** Previous calendar month ("2026-01" → "2025-12"). */
export function prevMonthKey(monthKey: string): string {
	const [y, m] = monthKey.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 2, 1));
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Days in the month (UTC, leap-year aware). */
export function daysInMonthKey(monthKey: string): number {
	const [y, m] = monthKey.split("-").map(Number);
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Monzo-parity headline count (D0): "£X — spent so far — N accounts".
 * N is the accounts that FEED the spend figure — contributing accounts
 * when the month is declared. With nothing declared yet the honest
 * fallback is the in-scope account count (whose statements would feed
 * the month), never a fabricated "0".
 */
export function headlineAccountCount(
	monthDeclared: boolean,
	contributingAccounts: number,
	inScopeAccounts: number,
): number {
	return monthDeclared ? contributingAccounts : inScopeAccounts;
}
