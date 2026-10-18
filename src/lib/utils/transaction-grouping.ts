/**
 * Transaction grouping utilities for monthly ledger display.
 *
 * Groups transactions by month for display in account detail pages.
 * Each group includes totals for inflow, outflow, and net change.
 *
 * Also hosts the month-keyed pagination helpers (UTC month keys,
 * boundaries, resolution and adjacency) shared by the account detail
 * server load and the ledger pager UI.
 */

export type GroupedTransaction<T> = {
	monthKey: string;
	monthLabel: string;
	transactions: T[];
	inflow: number;
	outflow: number;
	net: number;
};

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * UTC month range for a `YYYY-MM` key: `[start, end)` where `end` is the
 * first instant of the next month. Matches the grouping below (UTC-based).
 * Returns null for malformed keys.
 */
export function utcMonthRange(
	monthKey: string,
): { start: Date; end: Date } | null {
	const match = MONTH_KEY_PATTERN.exec(monthKey);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	return {
		start: new Date(Date.UTC(year, month - 1, 1)),
		end: new Date(Date.UTC(year, month, 1)),
	};
}

/**
 * Human label for a `YYYY-MM` key (e.g. "March 2026"), en-GB, matching
 * the ledger month header labels.
 */
export function monthLabelForKey(monthKey: string): string {
	const [year, month] = monthKey.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
	});
}

/**
 * Inflow/outflow/net totals for a set of transactions. Used both by the
 * client-side grouping and by the server load so month headers are always
 * computed from the same definition.
 */
export function computeMonthTotals<T>(
	transactions: T[],
	getAmount: (tx: T) => number,
): { inflow: number; outflow: number; net: number } {
	let inflow = 0;
	let outflow = 0;
	let net = 0;
	for (const tx of transactions) {
		const amount = getAmount(tx);
		if (amount > 0) inflow += amount;
		else outflow += Math.abs(amount);
		net += amount;
	}
	return { inflow, outflow, net };
}

/**
 * Resolve the ledger month to display.
 *
 * `monthKeys` is the list of data-bearing months, oldest → newest.
 * A param is honoured only when it names a data-bearing month; anything
 * else (absent, malformed, empty month, legacy `?page=` noise) falls back
 * to the latest data-bearing month. Returns null when there is no data.
 */
export function resolveLedgerMonth(
	monthKeys: string[],
	monthParam: string | null,
): string | null {
	if (monthKeys.length === 0) return null;
	if (monthParam !== null && monthKeys.includes(monthParam)) {
		return monthParam;
	}
	return monthKeys[monthKeys.length - 1];
}

/**
 * Previous (older) and next (newer) data-bearing months relative to
 * `current`. `months` is newest → oldest (pager display order). Empty
 * months are absent from the list by construction, so navigation skips
 * them. Returns nulls when there is no month to move to (or the current
 * month is unknown).
 */
export function adjacentMonths(
	months: string[],
	current: string | null,
): { prev: string | null; next: string | null } {
	const index = current === null ? -1 : months.indexOf(current);
	if (index === -1) return { prev: null, next: null };
	return {
		next: index > 0 ? months[index - 1] : null,
		prev: index < months.length - 1 ? months[index + 1] : null,
	};
}

/**
 * Group transactions by month (UTC-based), newest first.
 *
 * @param transactions - Array of transaction objects
 * @param getDate - Accessor for the transaction date
 * @param getAmount - Accessor for the transaction amount in pence
 * @returns Array of monthly groups sorted newest-first
 */
export function groupTransactionsByMonth<T>(
	transactions: T[],
	getDate: (tx: T) => Date,
	getAmount: (tx: T) => number,
): GroupedTransaction<T>[] {
	const groups = new Map<string, GroupedTransaction<T>>();

	for (const tx of transactions) {
		const d = getDate(tx);
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth();
		const key = `${year}-${String(month + 1).padStart(2, "0")}`;

		if (!groups.has(key)) {
			groups.set(key, {
				monthKey: key,
				monthLabel: monthLabelForKey(key),
				transactions: [],
				inflow: 0,
				outflow: 0,
				net: 0,
			});
		}
		const g = groups.get(key);
		if (!g) continue;
		g.transactions.push(tx);
		const amount = getAmount(tx);
		if (amount > 0) g.inflow += amount;
		else g.outflow += Math.abs(amount);
		g.net += amount;
	}

	return Array.from(groups.values());
}
