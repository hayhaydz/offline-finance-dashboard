/**
 * Transaction grouping utilities for monthly ledger display.
 *
 * Groups transactions by month for display in account detail pages.
 * Each group includes totals for inflow, outflow, and net change.
 */

export type GroupedTransaction<T> = {
	monthKey: string;
	monthLabel: string;
	transactions: T[];
	inflow: number;
	outflow: number;
	net: number;
};

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
		const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString(
			"en-GB",
			{ month: "long", year: "numeric" },
		);

		if (!groups.has(key)) {
			groups.set(key, {
				monthKey: key,
				monthLabel: label,
				transactions: [],
				inflow: 0,
				outflow: 0,
				net: 0,
			});
		}
		const g = groups.get(key)!;
		g.transactions.push(tx);
		const amount = getAmount(tx);
		if (amount > 0) g.inflow += amount;
		else g.outflow += Math.abs(amount);
		g.net += amount;
	}

	return Array.from(groups.values());
}
