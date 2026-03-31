import { getUkTaxYearBounds, ISA_ALLOWANCE_IN_CENTS } from "$lib/server/calculations";
import { getISABreakdownReport } from "$lib/server/isaBreakdown";
import { devLog } from "$lib/utils/logger";

export type ISAPacingStatus = "full" | "on-track" | "behind" | "no-data";

export interface ISAPacingResult {
	status: ISAPacingStatus;
	/** Months elapsed since tax year start (minimum 1 to avoid divide-by-zero) */
	monthsElapsed: number;
	/** Months remaining until tax year end */
	monthsRemaining: number;
	/** Average actual deposit per month this tax year, in cents */
	actualMonthlyAvgInCents: number;
	/**
	 * When isLastMonth is false: required deposit per month to hit £20k by year end, in cents.
	 * When isLastMonth is true: total remaining lump sum needed (monthly framing is meaningless < 30 days).
	 */
	requiredMonthlyInCents: number;
	/** ISA allowance used so far, in cents */
	allowanceUsedInCents: number;
	/** ISA allowance remaining, in cents */
	allowanceRemainingInCents: number;
	/** Days remaining in tax year */
	daysRemainingInTaxYear: number;
	/** Tax year label e.g. "2025-26" */
	taxYearLabel: string;
	/** True when fewer than 30 days remain — monthly pacing figures are no longer meaningful */
	isLastMonth: boolean;
}

/**
 * Calculate ISA pacing for the current tax year.
 * Determines whether the user is on track to use their full £20k ISA allowance.
 */
export async function calculateISAPacing(
	userId: number,
): Promise<ISAPacingResult> {
	const now = new Date();
	const { start: taxYearStart, end: taxYearEnd } = getUkTaxYearBounds(now);

	const report = await getISABreakdownReport({
		userId,
		taxYearStart,
		taxYearEnd,
	});

	const { allowanceUsed, allowanceRemaining, daysRemainingInTaxYear, taxYearLabel } =
		report.meta;

	// If allowance fully used, status is "full"
	if (allowanceUsed >= ISA_ALLOWANCE_IN_CENTS) {
		return {
			status: "full",
			monthsElapsed: 0,
			monthsRemaining: 0,
			actualMonthlyAvgInCents: 0,
			requiredMonthlyInCents: 0,
			allowanceUsedInCents: allowanceUsed,
			allowanceRemainingInCents: 0,
			daysRemainingInTaxYear: 0,
			taxYearLabel,
			isLastMonth: false,
		};
	}

	// Calculate months elapsed in tax year (minimum 1)
	const msElapsed = now.getTime() - taxYearStart.getTime();
	const monthsElapsed = Math.max(1, msElapsed / (30 * 24 * 60 * 60 * 1000));

	// Months remaining (use days for precision, minimum 0)
	const monthsRemaining = Math.max(0, daysRemainingInTaxYear / 30);

	// When fewer than 30 days remain, per-month figures become absurdly large and misleading.
	// Instead, expose the total lump sum still needed so the UI can display it sensibly.
	const isLastMonth = daysRemainingInTaxYear <= 30;

	const actualMonthlyAvgInCents =
		allowanceUsed > 0 ? Math.round(allowanceUsed / monthsElapsed) : 0;

	const requiredMonthlyInCents = isLastMonth
		? allowanceRemaining
		: monthsRemaining > 0
			? Math.ceil(allowanceRemaining / monthsRemaining)
			: allowanceRemaining;

	// If no ISA deposits at all yet, return "no-data" so UI can show a nudge
	if (allowanceUsed === 0) {
		devLog("isaPacing", "No ISA deposits this tax year", { userId });
		return {
			status: "no-data",
			monthsElapsed: Math.round(monthsElapsed),
			monthsRemaining: Math.round(monthsRemaining),
			actualMonthlyAvgInCents: 0,
			requiredMonthlyInCents,
			allowanceUsedInCents: 0,
			allowanceRemainingInCents: allowanceRemaining,
			daysRemainingInTaxYear,
			taxYearLabel,
			isLastMonth,
		};
	}

	const status: ISAPacingStatus =
		actualMonthlyAvgInCents >= requiredMonthlyInCents ? "on-track" : "behind";

	devLog("isaPacing", "Calculated ISA pacing", {
		userId,
		status,
		actualMonthlyAvgInCents,
		requiredMonthlyInCents,
		monthsElapsed: Math.round(monthsElapsed),
		monthsRemaining: Math.round(monthsRemaining),
	});

	return {
		status,
		monthsElapsed: Math.round(monthsElapsed),
		monthsRemaining: Math.round(monthsRemaining),
		actualMonthlyAvgInCents,
		requiredMonthlyInCents,
		allowanceUsedInCents: allowanceUsed,
		allowanceRemainingInCents: allowanceRemaining,
		daysRemainingInTaxYear,
		taxYearLabel,
		isLastMonth,
	};
}
