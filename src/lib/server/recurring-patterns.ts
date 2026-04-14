export interface RecurringPattern {
	description: string;
	approximateAmount: number;
	lastDate: Date;
}

/**
 * Detect recurring transaction patterns from full transaction history.
 * Requires ≥ 3 occurrences, amounts within ±10% of median, and ≥ 2 gaps in 28–35 day range.
 */
export function detectRecurringPatterns(
	txs: Array<{
		description: string | null;
		amount: number;
		transactionDate: Date;
	}>,
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
