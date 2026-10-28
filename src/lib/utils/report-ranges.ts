/**
 * Report history range slicing (Phase 5 line 1: 1y / 5y / all).
 *
 * Pure + deterministic: the range anchor is the NEWEST point's date, not
 * the wall clock — seeded histories (2025-11 → 2026-02) slice identically
 * on every run and in SSR tests. Always keeps the newest point; a range
 * covering everything returns the input unchanged.
 */

export type HistoryRange = "1y" | "5y" | "all";

export const HISTORY_RANGES: readonly HistoryRange[] = ["1y", "5y", "all"] as const;

const RANGE_DAYS: Record<Exclude<HistoryRange, "all">, number> = {
	"1y": 365,
	"5y": 365 * 5,
};

export function sliceNetWorthRange<T extends { date: string }>(
	points: T[],
	range: HistoryRange,
): T[] {
	if (points.length === 0 || range === "all") return points;

	const newest = points[points.length - 1].date;
	const cutoffMs = Date.parse(newest) - RANGE_DAYS[range] * 86_400_000;
	const sliced = points.filter((p) => Date.parse(p.date) >= cutoffMs);

	// never return an empty slice — the newest point always anchors the chart
	return sliced.length > 0 ? sliced : points.slice(-1);
}

/** Human label for the range buttons/summaries. */
export function rangeLabel(range: HistoryRange): string {
	return range === "all" ? "all time" : range === "1y" ? "last 12 months" : "last 5 years";
}
