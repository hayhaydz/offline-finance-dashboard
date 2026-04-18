import { getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import { devLog, isVerboseDebug } from "$lib/server/logger";

interface TaxYearInfo {
	slug: string;
	start: Date;
	end: Date;
}

/**
 * Build a map of available tax year slugs from an array of transaction dates.
 * Each transaction date is mapped to its UK tax year (6 Apr – 5 Apr).
 * Pure computation — no DB access.
 */
export function buildAvailableTaxYears(
	transactions: Array<{ transactionDate: Date }>,
): Map<string, TaxYearInfo> {
	if (isVerboseDebug()) devLog("buildAvailableTaxYears", "Building available tax years", { txCount: transactions.length });
	const years = new Map<string, TaxYearInfo>();

	for (const tx of transactions) {
		const bounds = getUkTaxYearBounds(tx.transactionDate);
		const startYear = bounds.start.getUTCFullYear();
		const slug = `${startYear}-${String(startYear + 1).slice(-2)}`;

		if (!years.has(slug)) {
			years.set(slug, { slug, start: bounds.start, end: bounds.end });
		}
	}

	return years;
}

/**
 * Derive the selected tax year from a query parameter, falling back to
 * the current tax year if not specified or invalid.
 * Pure computation — no DB access.
 */
export function deriveSelectedTaxYear(
	taxYearStartParam: string | undefined,
	availableYears: Map<string, TaxYearInfo>,
): TaxYearInfo | undefined {
	if (isVerboseDebug()) devLog("deriveSelectedTaxYear", "Deriving selected tax year", { param: taxYearStartParam });
	if (taxYearStartParam) {
		return availableYears.get(taxYearStartParam);
	}

	// Fall back to current tax year
	const now = new Date();
	const bounds = getUkTaxYearBounds(now);
	const currentSlug = `${bounds.start.getUTCFullYear()}-${String(bounds.start.getUTCFullYear() + 1).slice(-2)}`;
	return availableYears.get(currentSlug);
}
