/**
 * Surface-intelligence helpers (Phase 7 line 2): pure data shaping for
 * the rate heatmap, goals allocation view, and cashflow calendar.
 * Deterministic and SSR-safe — components stay thin.
 */

/* ── rate heatmap (accounts × months) ─────────────────────────────── */

export interface RatePoint {
	/** basis points */
	rate: number;
	/** effective date (ms or Date — compared via getTime when Date) */
	effectiveFrom: Date;
}

/** The rate in effect at a given month start: the latest row with
 *  effectiveFrom <= monthStart (same rule as getCurrentRatesForAccounts). */
export function rateAtMonthStart(
	rates: Array<{ rate: number; effectiveFrom: Date }>,
	monthStart: Date,
): number | null {
	let best: number | null = null;
	let bestTime = -Infinity;
	for (const r of rates) {
		const t = r.effectiveFrom.getTime();
		if (t <= monthStart.getTime() && t > bestTime) {
			best = r.rate;
			bestTime = t;
		}
	}
	return best;
}

/** Month-start dates for the last `count` months (inclusive of the
 *  current one), oldest first — UTC, deterministic. */
export function recentMonthStarts(count: number, now = new Date()): Date[] {
	const out: Date[] = [];
	for (let i = count - 1; i >= 0; i--) {
		out.push(
			new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)),
		);
	}
	return out;
}

/** Ink-density level 0–4 for a rate between min and max (Variant B:
 *  magnitude is ink, not semantic colour). Flat ranges → level 2. */
export function heatLevel(
	rate: number,
	min: number,
	max: number,
): 0 | 1 | 2 | 3 | 4 {
	if (max <= min) return 2;
	const t = Math.max(0, Math.min(1, (rate - min) / (max - min)));
	return Math.min(4, Math.floor(t * 5)) as 0 | 1 | 2 | 3 | 4;
}

/* ── goals allocation view ────────────────────────────────────────── */

export interface AllocationShare {
	name: string;
	value: number;
	/** 0–100, rounded; the last entry absorbs rounding so the list sums to 100 */
	percent: number;
}

/** Shares of a total, rounded to whole percents with the largest item
 *  absorbing the remainder (so percentages always sum to 100). */
export function allocationShares(
	items: Array<{ name: string; value: number }>,
): AllocationShare[] {
	const positive = items.filter((i) => i.value > 0);
	const total = positive.reduce((s, i) => s + i.value, 0);
	if (total <= 0) return [];

	const sorted = [...positive].sort((a, b) => b.value - a.value);
	const raw = sorted.map((i) => (i.value / total) * 100);
	const rounded = raw.map((p) => Math.floor(p));
	let drift = 100 - rounded.reduce((s, p) => s + p, 0);

	// hand the rounding drift to the biggest items (stable, deterministic)
	const out = sorted.map((item, i) => ({ ...item, percent: rounded[i] }));
	for (let i = 0; i < out.length && drift > 0; i++, drift--) {
		out[i].percent += 1;
	}
	return out.map((o) => ({ name: o.name, value: o.value, percent: o.percent }));
}

/* ── cashflow calendar (monthly obligations) ──────────────────────── */

export interface Obligation {
	/** ISO date (YYYY-MM-DD) */
	date: string;
	description: string;
	amountPence: number;
}

/** Project recurring patterns forward: each pattern recurs every ~30
 *  days from its last occurrence (the detection engine's monthly band
 *  is 28–35d). Only future dates within the horizon are returned. */
export function projectObligations(
	patterns: Array<{
		description: string;
		approximateAmount: number;
		lastDate: Date;
	}>,
	from: Date,
	days = 31,
): Obligation[] {
	const horizon = from.getTime() + days * 86_400_000;
	const out: Obligation[] = [];

	for (const p of patterns) {
		// step forward in monthly increments from the last occurrence
		let next = new Date(p.lastDate.getTime() + 30 * 86_400_000);
		while (next.getTime() < from.getTime()) {
			next = new Date(next.getTime() + 30 * 86_400_000);
		}
		while (next.getTime() <= horizon) {
			out.push({
				date: next.toISOString().slice(0, 10),
				description: p.description,
				amountPence: Math.round(p.approximateAmount),
			});
			next = new Date(next.getTime() + 30 * 86_400_000);
		}
	}

	return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Calendar grid for a month: weeks × 7 columns, leading blanks for the
 *  weekday offset of day 1 (Monday-first, terminal convention), each
 *  cell carrying its day number + obligations on that day. */
export function monthGrid(
	year: number,
	/** 1–12 */
	month: number,
	obligations: Obligation[],
): Array<Array<{ day: number; items: Obligation[] } | null>> {
	const byDay = new Map<number, Obligation[]>();
	for (const o of obligations) {
		const d = Number(o.date.slice(8, 10));
		const list = byDay.get(d) ?? [];
		list.push(o);
		byDay.set(d, list);
	}

	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	// weekday of day 1, Monday-first (0 = Mon … 6 = Sun)
	const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

	const cells: Array<{ day: number; items: Obligation[] } | null> = [];
	for (let i = 0; i < firstDow; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) {
		cells.push({ day: d, items: byDay.get(d) ?? [] });
	}
	while (cells.length % 7 !== 0) cells.push(null);

	const weeks: Array<Array<{ day: number; items: Obligation[] } | null>> = [];
	for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
	return weeks;
}
