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
	const allowanceByBand: Record<TaxBand, number> = {
		basic: 1_000_00,
		higher: 500_00,
		additional: 0,
	};

	const allowance = allowanceByBand[taxBand];
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
