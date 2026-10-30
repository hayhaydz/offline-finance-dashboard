import { devLog, isVerboseDebug } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

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
	if (isVerboseDebug())
		devLog("detectRecurringPatterns", "Detecting recurring patterns", {
			txCount: txs.length,
		});
	const groups = new Map<string, typeof txs>();

	for (const tx of txs) {
		if (!tx.description || tx.description.trim().length <= 3) continue;
		const key = tx.description.toLowerCase().trim();
		const group = groups.get(key);
		if (group) {
			group.push(tx);
		} else {
			groups.set(key, [tx]);
		}
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
				MS_PER_DAY;
			if (daysDiff >= 28 && daysDiff <= 35) monthlyGaps++;
		}
		if (monthlyGaps < 2) continue;

		const description = group[0].description?.trim();
		if (!description) continue;

		patterns.push({
			description,
			approximateAmount: median,
			lastDate: sorted[sorted.length - 1].transactionDate,
		});
	}

	return patterns;
}

export interface EmergingPattern {
	description: string;
	approximateAmount: number;
	lastDate: Date;
	firstDate: Date;
}

/**
 * Emerging patterns (v3 R-H15): description groups with EXACTLY two
 * occurrences, consistent amounts (±10% of the pair) and one monthly
 * gap (28–35d). One more matching occurrence would confirm them as a
 * bill — shown on /overview/bills as watchlist candidates so the page
 * is useful before the 3-occurrence threshold is met.
 */
export function detectEmergingPatterns(
	txs: Array<{
		description: string | null;
		amount: number;
		transactionDate: Date;
	}>,
): EmergingPattern[] {
	const groups = new Map<string, typeof txs>();
	for (const tx of txs) {
		if (!tx.description || tx.description.trim().length <= 3) continue;
		const key = tx.description.toLowerCase().trim();
		const group = groups.get(key);
		if (group) group.push(tx);
		else groups.set(key, [tx]);
	}

	const emerging: EmergingPattern[] = [];
	for (const group of groups.values()) {
		if (group.length !== 2) continue;
		const sorted = [...group].sort(
			(a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
		);
		const amounts = sorted.map((t) => Math.abs(t.amount));
		const lo = Math.min(...amounts);
		const hi = Math.max(...amounts);
		if (lo <= 0) continue;
		// ±10% of the pair's mean, mirroring the confirmed-pattern tolerance
		const mean = (lo + hi) / 2;
		if (hi > mean * 1.1 || lo < mean * 0.9) continue;
		const daysDiff =
			(sorted[1].transactionDate.getTime() - sorted[0].transactionDate.getTime()) /
			MS_PER_DAY;
		if (daysDiff < 28 || daysDiff > 35) continue;

		const description = group[0].description?.trim();
		if (!description) continue;
		emerging.push({
			description,
			approximateAmount: Math.round(mean),
			firstDate: sorted[0].transactionDate,
			lastDate: sorted[1].transactionDate,
		});
	}

	// newest last-seen first — the freshest candidates matter most
	return emerging.sort(
		(a, b) => b.lastDate.getTime() - a.lastDate.getTime(),
	);
}
