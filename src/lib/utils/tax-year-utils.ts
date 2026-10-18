/**
 * Tax Year Utilities (Pure — no DB access)
 *
 * UK tax year calculations, constants, and types.
 * These functions have no database dependencies and can be used anywhere.
 *
 * UK tax year: 6 April to 5 April (inclusive)
 * ISA allowance: £20,000 per tax year
 */

import { MS_PER_DAY } from "$lib/utils/time-constants";

export const ISA_ALLOWANCE_IN_CENTS = 20_000_00;

export type TaxBand = "basic" | "higher" | "additional";

export interface TaxYearBounds {
	start: Date;
	end: Date;
}

export interface TaxFreeStatus {
	allowance: number;
	used: number;
	remaining: number;
	overAllowance: boolean;
	taxableAmount: number;
}

/**
 * Per-tax-year band threshold config (in cents), keyed by tax year start year.
 * Defaults to HMRC values (£50,270 / £150,000); future years inherit the
 * latest known value until edited here.
 */
const HIGHER_RATE_THRESHOLD_BY_START_YEAR: Record<number, number> = {
	2018: 46_350_00,
	2019: 50_000_00,
	2020: 50_000_00,
	2021: 50_270_00, // Frozen at £50,270 through 2027/28
};

const ADDITIONAL_RATE_THRESHOLD_BY_START_YEAR: Record<number, number> = {
	2018: 150_000_00,
	2019: 150_000_00,
	2020: 150_000_00,
	2021: 150_000_00, // Frozen at £150,000 through 2027/28
};

function lookupByStartYear(
	map: Record<number, number>,
	startYear: number,
): number {
	const known = Object.keys(map)
		.map(Number)
		.filter((y) => y <= startYear)
		.sort((a, b) => b - a);
	// Future years inherit the latest known value
	return known.length > 0
		? map[known[0]]
		: map[Math.min(...Object.keys(map).map(Number))];
}

/** Higher-rate threshold (adjusted net income) for a tax year, in cents. */
export function getHigherRateThresholdInCents(taxYear: string): number {
	const startYear = taxYearStartYear(taxYear);
	if (startYear === null) return 50_270_00;
	return lookupByStartYear(HIGHER_RATE_THRESHOLD_BY_START_YEAR, startYear);
}

/** Additional-rate threshold (adjusted net income) for a tax year, in cents. */
export function getAdditionalRateThresholdInCents(taxYear: string): number {
	const startYear = taxYearStartYear(taxYear);
	if (startYear === null) return 150_000_00;
	return lookupByStartYear(ADDITIONAL_RATE_THRESHOLD_BY_START_YEAR, startYear);
}

/**
 * Canonical tax year strings are "YYYY/YY" (e.g. "2026/27").
 * URL slugs use "YYYY-YY" (e.g. "2026-27"); income months use "YYYY-MM".
 */

/** Parse a tax year start year from "YYYY/YY" or "YYYY-YY"; null if invalid. */
export function taxYearStartYear(taxYear: string): number | null {
	const match = taxYear.match(/^(\d{4})[/-](\d{2})$/);
	if (!match) return null;
	const startYear = parseInt(match[1], 10);
	if ((startYear + 1) % 100 !== parseInt(match[2], 10)) return null;
	return startYear;
}

/** Normalise "2026-27" (slug) or "2026/27" to canonical "2026/27"; null if invalid. */
export function toCanonicalTaxYear(input: string): string | null {
	const startYear = taxYearStartYear(input.trim());
	if (startYear === null) return null;
	return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

/** Canonical "YYYY/YY" from a URL slug "YYYY-YY"; null if invalid. */
export function canonicalTaxYearFromSlug(slug: string): string | null {
	return toCanonicalTaxYear(slug);
}

/** URL slug "YYYY-YY" from canonical "YYYY/YY". */
export function taxYearSlugFromCanonical(canonical: string): string {
	return canonical.replace("/", "-");
}

/** Canonical tax year containing a date, e.g. July 2026 → "2026/27". */
export function taxYearLabelFromDate(date: Date): string {
	const { start } = getUkTaxYearBounds(date);
	const startYear = start.getUTCFullYear();
	return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

/** Compare two canonical tax years: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareTaxYears(a: string, b: string): number {
	const yearA = taxYearStartYear(a);
	const yearB = taxYearStartYear(b);
	if (yearA === null || yearB === null) return a.localeCompare(b);
	return yearA - yearB;
}

/** The 12 "YYYY-MM" months of a canonical tax year, Apr → Mar chronological. */
export function taxYearMonths(canonical: string): string[] {
	const startYear = taxYearStartYear(canonical);
	if (startYear === null) return [];
	const months: string[] = [];
	for (let i = 0; i < 12; i++) {
		const year = startYear + Math.floor((3 + i) / 12); // Apr(3) → Mar(2)
		const month = ((3 + i) % 12) + 1;
		months.push(`${year}-${String(month).padStart(2, "0")}`);
	}
	return months;
}

/** Next canonical tax year ("2026/27" → "2027/28"). */
export function nextTaxYear(canonical: string): string {
	const startYear = taxYearStartYear(canonical);
	if (startYear === null) return canonical;
	return `${startYear + 1}/${String(startYear + 2).slice(-2)}`;
}

/** Previous canonical tax year ("2026/27" → "2025/26"). */
export function previousTaxYear(canonical: string): string {
	const startYear = taxYearStartYear(canonical);
	if (startYear === null) return canonical;
	return `${startYear - 1}/${String(startYear).slice(-2)}`;
}

/** PSA (Personal Savings Allowance) in cents for a band: £1,000 / £500 / £0. */
export function getPsaAllowanceInCents(band: TaxBand): number {
	const allowanceByBand: Record<TaxBand, number> = {
		basic: 1_000_00,
		higher: 500_00,
		additional: 0,
	};
	return allowanceByBand[band];
}

/** Display label for a band, e.g. "basic" → "BASIC". */
export function formatTaxBand(band: TaxBand): string {
	return band.toUpperCase();
}

/**
 * UK tax year runs from 6 April to 5 April (inclusive).
 * Supports passing a Date or a year string like "2024-25".
 */
export function getUkTaxYearBounds(
	input: Date | string = new Date(),
): TaxYearBounds {
	if (typeof input === "string") {
		// Parse "2024-25" or similar
		const match = input.match(/^(\d{4})-(\d{2})$/);
		if (match) {
			const startYear = parseInt(match[1], 10);
			const endYear = startYear + 1;
			// Verify end year match (e.g., 2024-25 -> 2025)
			if (endYear % 100 === parseInt(match[2], 10)) {
				return {
					start: new Date(Date.UTC(startYear, 3, 6, 0, 0, 0, 0)),
					end: new Date(Date.UTC(endYear, 3, 5, 23, 59, 59, 999)),
				};
			}
		}
		// Fallback to Date parsing if string doesn't match format
		return getUkTaxYearBounds(new Date(input));
	}

	const referenceDate = input;
	const year = referenceDate.getUTCFullYear();
	const startThisYear = new Date(Date.UTC(year, 3, 6, 0, 0, 0, 0));

	if (referenceDate >= startThisYear) {
		return {
			start: startThisYear,
			end: new Date(Date.UTC(year + 1, 3, 5, 23, 59, 59, 999)),
		};
	}

	return {
		start: new Date(Date.UTC(year - 1, 3, 6, 0, 0, 0, 0)),
		end: new Date(Date.UTC(year, 3, 5, 23, 59, 59, 999)),
	};
}

/**
 * Projects interest for a period using simple daily pro-rating.
 */
export function calculateProjectedInterestInCents(params: {
	balanceInCents: number;
	rateBasisPoints: number;
	fromDate?: Date;
	toDate: Date;
}): number {
	const { balanceInCents, rateBasisPoints, toDate } = params;
	const fromDate = params.fromDate ?? new Date();

	if (balanceInCents <= 0 || rateBasisPoints <= 0 || toDate <= fromDate) {
		return 0;
	}

	const msPerDay = MS_PER_DAY;
	const daysRemaining = (toDate.getTime() - fromDate.getTime()) / msPerDay;
	const annualInterestInCents = balanceInCents * (rateBasisPoints / 10_000);

	return Math.round(annualInterestInCents * (daysRemaining / 365));
}

/**
 * Calculates PSA (Personal Savings Allowance) tax-free status.
 * Basic rate: £1,000, Higher rate: £500, Additional rate: £0.
 */
export function getTaxFreeStatus(
	actualInterest: number,
	taxBand: TaxBand,
): TaxFreeStatus {
	const allowance = getPsaAllowanceInCents(taxBand);
	const used = Math.max(0, actualInterest);
	const remaining = Math.max(0, allowance - used);
	const taxableAmount = Math.max(0, used - allowance);

	return {
		allowance,
		used,
		remaining,
		overAllowance: used > allowance,
		taxableAmount,
	};
}
