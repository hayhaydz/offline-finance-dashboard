/**
 * Tax Bands Module — resolver, band history writes, and band finder
 *
 * The resolver (`bandForTaxYear`) is the single source of truth for "which
 * band applies to this tax year": covering history row → nearest earlier row
 * ("assumed from history") → legacy users.taxBand enum (denormalised cache).
 *
 * UK tax years are Apr 6 – Apr 5, stored canonically as "YYYY/YY".
 * Bands are tax-year-atomic: a mid-year change records from the tax year
 * containing the change and applies to that entire year.
 */

import { and, asc, eq } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { incomeHistory, taxBandHistory, users } from "$lib/db/schema";
import {
	getActualInterestBreakdown,
	getProjectedInterestBreakdown,
} from "$lib/server/interestBreakdown";
import { devLog, isVerboseDebug } from "$lib/server/logger";
import {
	compareTaxYears,
	getAdditionalRateThresholdInCents,
	getHigherRateThresholdInCents,
	getUkTaxYearBounds,
	previousTaxYear,
	type TaxBand,
	taxYearLabelFromDate,
	taxYearMonths,
	taxYearSlugFromCanonical,
	toCanonicalTaxYear,
} from "$lib/utils/tax-year-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BandResolutionSource = "history" | "assumed-earlier" | "legacy";

export interface BandResolution {
	band: TaxBand;
	source: BandResolutionSource;
	/** Start of the row the resolution came from (null when legacy fallback) */
	fromTaxYear: string | null;
	toTaxYear: string | null;
}

export interface BandRowShape {
	band: TaxBand;
	fromTaxYear: string;
	toTaxYear: string | null;
}

export type BandsWriteResult = { ok: true } | { ok: false; error: string };

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Pure resolution core: covering row, else nearest earlier row, else legacy enum.
 * Exported for call sites that already hold the user's rows (avoids N queries).
 */
export function resolveBandFromRows(
	rows: BandRowShape[],
	taxYear: string,
	legacyBand: TaxBand,
): BandResolution {
	// Covering row: from <= year <= to (null to = open-ended)
	const covering = rows
		.filter(
			(r) =>
				compareTaxYears(r.fromTaxYear, taxYear) <= 0 &&
				(r.toTaxYear === null || compareTaxYears(taxYear, r.toTaxYear) <= 0),
		)
		.sort((a, b) => compareTaxYears(b.fromTaxYear, a.fromTaxYear));

	if (covering.length > 0) {
		return {
			band: covering[0].band,
			source: "history",
			fromTaxYear: covering[0].fromTaxYear,
			toTaxYear: covering[0].toTaxYear,
		};
	}

	// Nearest earlier row (gap in history — deterministic fallback)
	const earlier = rows
		.filter((r) => compareTaxYears(r.fromTaxYear, taxYear) < 0)
		.sort((a, b) => compareTaxYears(b.fromTaxYear, a.fromTaxYear));

	if (earlier.length > 0) {
		return {
			band: earlier[0].band,
			source: "assumed-earlier",
			fromTaxYear: earlier[0].fromTaxYear,
			toTaxYear: earlier[0].toTaxYear,
		};
	}

	// No history coverage at all — legacy enum cache
	return {
		band: legacyBand,
		source: "legacy",
		fromTaxYear: null,
		toTaxYear: null,
	};
}

/** The user's band history, oldest first. */
export async function getTaxBandHistory(
	userId: number,
): Promise<(BandRowShape & { id: number })[]> {
	const rows = await db.query.taxBandHistory.findMany({
		where: withUserFilter(userId, taxBandHistory),
		orderBy: [asc(taxBandHistory.fromTaxYear)],
		columns: { id: true, band: true, fromTaxYear: true, toTaxYear: true },
	});
	return rows;
}

/** Legacy enum cache on the user row. */
export async function getLegacyTaxBand(userId: number): Promise<TaxBand> {
	const row = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { taxBand: true },
	});
	return row?.taxBand ?? "basic";
}

/**
 * Resolve the band in effect for a tax year ("YYYY/YY" or "YYYY-YY").
 * Used by interest tax calcs, PSA logic, snapshots, and ISA projections.
 */
export async function bandForTaxYear(
	userId: number,
	taxYear: string,
): Promise<BandResolution> {
	const canonical = toCanonicalTaxYear(taxYear);
	if (canonical === null) {
		throw new Error(`bandForTaxYear: invalid tax year "${taxYear}"`);
	}

	const [rows, legacyBand] = await Promise.all([
		getTaxBandHistory(userId),
		getLegacyTaxBand(userId),
	]);

	const resolution = resolveBandFromRows(rows, canonical, legacyBand);

	if (isVerboseDebug()) {
		devLog("bandForTaxYear", "Resolved band", {
			userId,
			taxYear: canonical,
			band: resolution.band,
			source: resolution.source,
		});
	}

	return resolution;
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/**
 * Normalise user input to a canonical tax year ("YYYY/YY").
 * Accepts tax years ("2026/27", "2026-27"), months ("2026-07") and dates
 * ("2026-07-15") — a July 2026 date records as "2026/27" (year-atomic rule).
 * Returns null for unparseable input.
 */
export function normalizeEffectiveFromInput(input: string): string | null {
	const trimmed = input.trim();

	// Tax year forms first ("2026/27" or "2026-27" slug)
	const canonical = toCanonicalTaxYear(trimmed);
	if (canonical !== null) return canonical;

	// Otherwise treat as a date (month or day precision).
	// Month precision uses mid-month so "2026-04" → 2026/27 (April is the
	// first month of that tax year, even though Apr 1–5 precede its start).
	const parsed = new Date(trimmed.length === 7 ? `${trimmed}-15` : trimmed);
	if (Number.isNaN(parsed.getTime())) return null;
	return taxYearLabelFromDate(parsed);
}

// ─── Overlap validation + writes ─────────────────────────────────────────────

export interface BandRangeConflict {
	fromTaxYear: string;
	toTaxYear: string | null;
}

/** Find an existing row whose range overlaps the candidate; null if clear. */
export function findBandRangeConflict(
	existing: BandRowShape[],
	candidate: { fromTaxYear: string; toTaxYear: string | null },
): BandRangeConflict | null {
	return (
		existing.find((row) => {
			const startsBeforeCandidateEnds =
				candidate.toTaxYear === null ||
				compareTaxYears(row.fromTaxYear, candidate.toTaxYear) <= 0;
			const endsAfterCandidateStarts =
				row.toTaxYear === null ||
				compareTaxYears(candidate.fromTaxYear, row.toTaxYear) <= 0;
			return startsBeforeCandidateEnds && endsAfterCandidateStarts;
		}) ?? null
	);
}

function describeRange(range: {
	fromTaxYear: string;
	toTaxYear: string | null;
}): string {
	return range.toTaxYear === null
		? `${range.fromTaxYear} → open`
		: `${range.fromTaxYear} → ${range.toTaxYear}`;
}

/**
 * Keep the legacy users.taxBand enum in sync with the latest history row.
 * The enum is a denormalised cache only — the resolver prefers the table.
 */
export async function syncLegacyTaxBandCache(userId: number): Promise<void> {
	const rows = await getTaxBandHistory(userId);
	if (rows.length === 0) return;
	const latest = rows.reduce((a, b) =>
		compareTaxYears(a.fromTaxYear, b.fromTaxYear) >= 0 ? a : b,
	);
	await db
		.update(users)
		.set({ taxBand: latest.band, updatedAt: new Date() })
		.where(eq(users.id, userId));
}

/**
 * Add a band history row. Rejects overlapping ranges with an error naming
 * the conflicting range. Syncs the legacy enum cache when the row is latest.
 */
export async function addTaxBandRow(
	userId: number,
	input: {
		band: TaxBand;
		fromTaxYear: string;
		toTaxYear?: string | null;
	},
): Promise<BandsWriteResult> {
	const fromTaxYear = toCanonicalTaxYear(input.fromTaxYear);
	if (fromTaxYear === null) {
		return { ok: false, error: `Invalid tax year "${input.fromTaxYear}"` };
	}
	const toTaxYear =
		input.toTaxYear === null || input.toTaxYear === undefined
			? null
			: toCanonicalTaxYear(input.toTaxYear);
	if (toTaxYear === null && input.toTaxYear) {
		return { ok: false, error: `Invalid tax year "${input.toTaxYear}"` };
	}
	if (toTaxYear !== null && compareTaxYears(fromTaxYear, toTaxYear) > 0) {
		return {
			ok: false,
			error: `"From" tax year must not be after "to" tax year`,
		};
	}

	const existing = await getTaxBandHistory(userId);
	const conflict = findBandRangeConflict(existing, { fromTaxYear, toTaxYear });
	if (conflict) {
		return {
			ok: false,
			error: `Overlaps existing band (${describeRange(conflict)})`,
		};
	}

	const now = new Date();
	await db.insert(taxBandHistory).values({
		userId,
		band: input.band,
		fromTaxYear,
		toTaxYear,
		createdAt: now,
		updatedAt: now,
	});

	await syncLegacyTaxBandCache(userId);
	devLog("addTaxBandRow", "Band row added", { userId, fromTaxYear, toTaxYear });

	return { ok: true };
}

/** Close an open band row at a tax year (inclusive). */
export async function closeTaxBandRow(
	userId: number,
	rowId: number,
	toTaxYearInput: string,
): Promise<BandsWriteResult> {
	const toTaxYear = toCanonicalTaxYear(toTaxYearInput);
	if (toTaxYear === null) {
		return { ok: false, error: `Invalid tax year "${toTaxYearInput}"` };
	}

	const row = await db.query.taxBandHistory.findFirst({
		where: eq(taxBandHistory.id, rowId),
		columns: { id: true, userId: true, band: true, fromTaxYear: true },
	});
	if (!row || row.userId !== userId) {
		return { ok: false, error: "Band row not found" };
	}
	if (compareTaxYears(row.fromTaxYear, toTaxYear) > 0) {
		return {
			ok: false,
			error: `"To" tax year must not be before the row's start (${row.fromTaxYear})`,
		};
	}

	const others = await getTaxBandHistory(userId);
	const conflict = findBandRangeConflict(
		others.filter((r) => r.fromTaxYear !== row.fromTaxYear),
		{
			fromTaxYear: row.fromTaxYear,
			toTaxYear,
		},
	);
	if (conflict) {
		return {
			ok: false,
			error: `Closing here overlaps another band (${describeRange(conflict)})`,
		};
	}

	await db
		.update(taxBandHistory)
		.set({ toTaxYear, updatedAt: new Date() })
		.where(eq(taxBandHistory.id, rowId));

	devLog("closeTaxBandRow", "Band row closed", { userId, rowId, toTaxYear });
	return { ok: true };
}

/** Reopen a closed band row (toTaxYear → null, open-ended). */
export async function reopenTaxBandRow(
	userId: number,
	rowId: number,
): Promise<BandsWriteResult> {
	const row = await db.query.taxBandHistory.findFirst({
		where: eq(taxBandHistory.id, rowId),
		columns: { id: true, userId: true, fromTaxYear: true },
	});
	if (!row || row.userId !== userId) {
		return { ok: false, error: "Band row not found" };
	}

	const others = (await getTaxBandHistory(userId)).filter(
		(r) => r.fromTaxYear !== row.fromTaxYear,
	);
	const conflict = findBandRangeConflict(others, {
		fromTaxYear: row.fromTaxYear,
		toTaxYear: null,
	});
	if (conflict) {
		return {
			ok: false,
			error: `Reopening overlaps another band (${describeRange(conflict)})`,
		};
	}

	await db
		.update(taxBandHistory)
		.set({ toTaxYear: null, updatedAt: new Date() })
		.where(eq(taxBandHistory.id, rowId));

	return { ok: true };
}

/** Delete a band row. */
export async function deleteTaxBandRow(
	userId: number,
	rowId: number,
): Promise<BandsWriteResult> {
	const row = await db.query.taxBandHistory.findFirst({
		where: eq(taxBandHistory.id, rowId),
		columns: { id: true, userId: true },
	});
	if (!row || row.userId !== userId) {
		return { ok: false, error: "Band row not found" };
	}

	await db.delete(taxBandHistory).where(eq(taxBandHistory.id, rowId));
	await syncLegacyTaxBandCache(userId);

	return { ok: true };
}

// ─── Band finder ─────────────────────────────────────────────────────────────

export type FinderVerdictState = "FIRM" | "EXPECTED" | "BOUNDED" | "UNKNOWN";

export interface FinderYear {
	taxYear: string;
	slug: string;
	state: FinderVerdictState;
	months: string[];
	knownMonths: string[];
	missingMonths: string[];
	missingPastMonths: string[];
	missingFutureMonths: string[];
	currentMonth: string;
	yearComplete: boolean;
	knownTotalInCents: number;
	projectionAssumptionInCents: number | null;
	projectionAssumptionSource: "override" | "last-known" | null;
	projectedMonths: string[];
	projectedTotalInCents: number;
	taxableInterestInCents: number;
	interestIncludesProjection: boolean;
	assessmentTotalInCents: number;
	higherThresholdInCents: number;
	additionalThresholdInCents: number;
	targetThresholdInCents: number;
	suggestedBand: TaxBand | null;
	marginInCents: number;
	overRegardless: boolean;
	requiredAvgPerMissingMonthInCents: number | null;
}

function bandForTotal(
	totalInCents: number,
	higherThreshold: number,
	additionalThreshold: number,
): TaxBand {
	if (totalInCents >= additionalThreshold) return "additional";
	if (totalInCents >= higherThreshold) return "higher";
	return "basic";
}

function nextThreshold(
	totalInCents: number,
	higherThreshold: number,
	additionalThreshold: number,
): number {
	// The nearest threshold not yet reached — the verdict's judging line
	return totalInCents >= additionalThreshold
		? additionalThreshold
		: higherThreshold;
}

/**
 * Pure verdict computation for one tax year.
 *
 * FIRM — all 12 months known → final verdict.
 * EXPECTED — year in progress, only future months missing → projected at the
 *   last known month's rate (or an explicit override).
 * BOUNDED — past months missing → never invented; reverse-computes the average
 *   the missing months would need to cross the threshold ("over regardless"
 *   when known income + interest alone reaches it).
 * UNKNOWN — no income rows for the year.
 */
export function computeFinderYear(params: {
	taxYear: string;
	incomeByMonth: Map<string, number>;
	taxableInterestInCents: number;
	interestIncludesProjection: boolean;
	now: Date;
	projectionOverrideInCents?: number | null;
}): FinderYear {
	const {
		taxYear,
		incomeByMonth,
		taxableInterestInCents,
		interestIncludesProjection,
		now,
	} = params;

	const months = taxYearMonths(taxYear);
	const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
	const yearComplete = currentMonth > months[months.length - 1];

	const knownMonths = months.filter((m) => incomeByMonth.has(m));
	const missingMonths = months.filter((m) => !incomeByMonth.has(m));
	// Mid-month, the current month isn't yet "past" — a missing current month
	// projects (EXPECTED), it doesn't count as a past gap (BOUNDED).
	const missingPastMonths = missingMonths.filter((m) => m < currentMonth);
	const missingFutureMonths = missingMonths.filter((m) => m >= currentMonth);

	const knownTotalInCents = knownMonths.reduce(
		(sum, m) => sum + (incomeByMonth.get(m) ?? 0),
		0,
	);

	const higherThresholdInCents = getHigherRateThresholdInCents(taxYear);
	const additionalThresholdInCents = getAdditionalRateThresholdInCents(taxYear);

	// State classification
	let state: FinderVerdictState;
	if (knownMonths.length === 0) {
		state = "UNKNOWN";
	} else if (missingMonths.length === 0) {
		state = "FIRM";
	} else if (missingPastMonths.length > 0) {
		state = "BOUNDED";
	} else {
		state = "EXPECTED";
	}

	// Projection (EXPECTED, and BOUNDED years still in progress)
	let projectionAssumptionInCents: number | null = null;
	let projectionAssumptionSource: "override" | "last-known" | null = null;
	let projectedMonths: string[] = [];
	let projectedTotalInCents = 0;

	if (state === "EXPECTED" || (state === "BOUNDED" && !yearComplete)) {
		projectedMonths = missingFutureMonths;
		if (params.projectionOverrideInCents != null) {
			projectionAssumptionInCents = params.projectionOverrideInCents;
			projectionAssumptionSource = "override";
		} else {
			// Last known month's run-rate (latest known month ≤ current month)
			const lastKnown = knownMonths
				.filter((m) => m <= currentMonth)
				.sort()
				.at(-1);
			projectionAssumptionInCents = lastKnown
				? (incomeByMonth.get(lastKnown) ?? 0)
				: 0;
			projectionAssumptionSource = "last-known";
		}
		projectedTotalInCents =
			projectionAssumptionInCents * projectedMonths.length;
	}

	const assessmentTotalInCents =
		knownTotalInCents + projectedTotalInCents + taxableInterestInCents;

	const targetThresholdInCents = nextThreshold(
		assessmentTotalInCents,
		higherThresholdInCents,
		additionalThresholdInCents,
	);

	const suggestedBand =
		state === "UNKNOWN"
			? null
			: bandForTotal(
					assessmentTotalInCents,
					higherThresholdInCents,
					additionalThresholdInCents,
				);

	// BOUNDED reverse-computation: what would the missing past months need?
	const overRegardless =
		state === "BOUNDED" &&
		knownTotalInCents + taxableInterestInCents >= targetThresholdInCents;

	const requiredAvgPerMissingMonthInCents =
		state === "BOUNDED"
			? overRegardless
				? 0
				: Math.max(
						0,
						Math.ceil(
							(targetThresholdInCents - assessmentTotalInCents) /
								missingPastMonths.length,
						),
					)
			: null;

	return {
		taxYear,
		slug: taxYearSlugFromCanonical(taxYear),
		state,
		months,
		knownMonths,
		missingMonths,
		missingPastMonths,
		missingFutureMonths,
		currentMonth,
		yearComplete,
		knownTotalInCents,
		projectionAssumptionInCents,
		projectionAssumptionSource,
		projectedMonths,
		projectedTotalInCents,
		taxableInterestInCents,
		interestIncludesProjection,
		assessmentTotalInCents,
		higherThresholdInCents,
		additionalThresholdInCents,
		targetThresholdInCents,
		suggestedBand,
		marginInCents: assessmentTotalInCents - targetThresholdInCents,
		overRegardless,
		requiredAvgPerMissingMonthInCents,
	};
}

/** Distinct tax years (canonical, desc) touched by income rows, capped. */
async function finderYears(
	userId: number,
	now: Date,
	maxYears: number,
): Promise<string[]> {
	const rows = await db.query.incomeHistory.findMany({
		where: withUserFilter(userId, incomeHistory),
		columns: { month: true },
	});

	const years = new Set<string>();
	for (const row of rows) {
		const match = row.month.match(/^(\d{4})-(\d{2})$/);
		if (!match) continue;
		const year = Number(match[1]);
		const month = Number(match[2]);
		const startYear = month >= 4 ? year : year - 1;
		years.add(`${startYear}/${String(startYear + 1).slice(-2)}`);
	}
	years.add(taxYearLabelFromDate(now));

	return Array.from(years)
		.sort((a, b) => compareTaxYears(b, a))
		.slice(0, maxYears);
}

/**
 * Band finder report: per-tax-year threshold verdicts combining known income
 * months with auto-computed non-ISA (taxable) interest from the app's own data.
 * Never writes band rows — application is explicit (`applyBandVerdict`).
 */
export async function getBandFinderReport(
	userId: number,
	opts?: {
		now?: Date;
		/** canonical tax year → £/month override for future-month projection */
		projectionOverrides?: Record<string, number>;
		maxYears?: number;
	},
): Promise<FinderYear[]> {
	const now = opts?.now ?? new Date();
	const maxYears = opts?.maxYears ?? 8;
	const years = await finderYears(userId, now, maxYears);

	const incomeRows = await db.query.incomeHistory.findMany({
		where: withUserFilter(userId, incomeHistory),
		columns: { month: true, grossIncomeInCents: true },
	});
	const incomeByMonth = new Map<string, number>(
		incomeRows.map((r) => [r.month, r.grossIncomeInCents]),
	);

	return Promise.all(
		years.map(async (taxYear) => {
			const bounds = getUkTaxYearBounds(taxYearSlugFromCanonical(taxYear));
			const yearInProgress = now <= bounds.end;

			const [actual, projected] = await Promise.all([
				getActualInterestBreakdown(userId, bounds.start, bounds.end),
				yearInProgress
					? getProjectedInterestBreakdown(userId, bounds.start, bounds.end, now)
					: Promise.resolve({ taxableTotal: 0 }),
			]);

			return computeFinderYear({
				taxYear,
				incomeByMonth,
				taxableInterestInCents: actual.taxableTotal + projected.taxableTotal,
				interestIncludesProjection: yearInProgress,
				now,
				projectionOverrideInCents: opts?.projectionOverrides?.[taxYear] ?? null,
			});
		}),
	);
}

/**
 * Apply a finder verdict as a band history row — the ONLY bridge from finder
 * to history, always user-initiated. Closes an open earlier row when needed.
 */
export async function applyBandVerdict(
	userId: number,
	taxYearInput: string,
	band: TaxBand,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
	const taxYear = toCanonicalTaxYear(taxYearInput);
	if (taxYear === null) {
		return { ok: false, error: `Invalid tax year "${taxYearInput}"` };
	}

	const rows = await getTaxBandHistory(userId);

	// Explicitly closed rows covering the year are real history — never rewrites
	const closedCovering = rows.filter(
		(r) =>
			compareTaxYears(r.fromTaxYear, taxYear) <= 0 &&
			r.toTaxYear !== null &&
			compareTaxYears(taxYear, r.toTaxYear) <= 0,
	);
	if (closedCovering.length > 0) {
		if (closedCovering.some((r) => r.band === band)) {
			return {
				ok: true,
				message: `${band} already in effect for ${taxYear} — nothing to change`,
			};
		}
		return {
			ok: false,
			error: `${taxYear} is already covered by ${closedCovering[0].band} (${describeRange(closedCovering[0])}) — edit the band history instead`,
		};
	}

	// An open-ended row starting exactly at this year: reband it in place
	const startingHere = rows.find(
		(r) => r.toTaxYear === null && r.fromTaxYear === taxYear,
	);
	if (startingHere) {
		if (startingHere.band === band) {
			return {
				ok: true,
				message: `${band} already in effect for ${taxYear} — nothing to change`,
			};
		}
		await db
			.update(taxBandHistory)
			.set({ band, updatedAt: new Date() })
			.where(
				and(
					withUserFilter(userId, taxBandHistory),
					eq(taxBandHistory.fromTaxYear, taxYear),
				),
			);
		await syncLegacyTaxBandCache(userId);
		return {
			ok: true,
			message: `${band} recorded from ${taxYear} (open row rebanded)`,
		};
	}

	// Close the latest open-ended earlier row just before this year
	const earlierOpen = rows
		.filter(
			(r) =>
				compareTaxYears(r.fromTaxYear, taxYear) < 0 && r.toTaxYear === null,
		)
		.sort((a, b) => compareTaxYears(b.fromTaxYear, a.fromTaxYear))[0];

	if (earlierOpen) {
		if (earlierOpen.band === band) {
			return {
				ok: true,
				message: `${band} already in effect for ${taxYear} (from ${earlierOpen.fromTaxYear}) — nothing to change`,
			};
		}
		await db
			.update(taxBandHistory)
			.set({ toTaxYear: previousTaxYear(taxYear), updatedAt: new Date() })
			.where(
				and(
					withUserFilter(userId, taxBandHistory),
					eq(taxBandHistory.fromTaxYear, earlierOpen.fromTaxYear),
				),
			);
	}

	const added = await addTaxBandRow(userId, {
		band,
		fromTaxYear: taxYear,
		toTaxYear: null,
	});
	if (!added.ok) return added;

	devLog("applyBandVerdict", "Verdict applied as band row", {
		userId,
		taxYear,
		band,
	});

	return {
		ok: true,
		message: `${band} recorded from ${taxYear}${earlierOpen ? ` (${earlierOpen.band} closed at ${previousTaxYear(taxYear)})` : ""}`,
	};
}
