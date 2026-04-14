import { calculateTTZ } from "$lib/utils/debt-calculator";

// ── Tax year date helpers ──────────────────────────────────────

export function formatTaxYearStartParam(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function getTaxYearEndFromStart(taxYearStart: Date): Date {
	return new Date(
		Date.UTC(taxYearStart.getUTCFullYear() + 1, 3, 5, 23, 59, 59, 999),
	);
}

export function parseTaxYearStart(value: string | null): Date | null {
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	if (parsed.getUTCMonth() !== 3 || parsed.getUTCDate() !== 6) return null;
	return parsed;
}

// ── Debt health status ─────────────────────────────────────────

/**
 * Calculate debt health status badge
 * HEALTHY: Pays off in < 5 years
 * WARNING: Pays off in 5+ years
 * CRITICAL: Never pays off
 */
export function getDebtHealthStatus(ttz: {
	months: number | null;
	years: number | null;
}): { label: string; class: string } {
	if (ttz.months === null) {
		return { label: "[CRITICAL]", class: "text-red-700" };
	}
	if (ttz.years !== null && ttz.years >= 5) {
		return { label: "[WARNING]", class: "text-amber-700" };
	}
	return { label: "[HEALTHY]", class: "text-green-700" };
}

// ── Minimum payment calculation ────────────────────────────────

/**
 * Calculate minimum payment from account rule.
 * Note: percentage is stored in basis points in the database (100 = 1%)
 */
export function calculateMinimumPayment(
	balance: number,
	_rate: number,
	rule: { type: string; flat: number | null; percentage: number | null },
): number {
	if (rule.type === "flat" && rule.flat !== null) {
		return rule.flat;
	}
	if (rule.type === "percentage" && rule.percentage !== null) {
		// percentage is in basis points: 100 = 1%, so divide by 10000
		return Math.round((balance * rule.percentage) / 10000);
	}
	// Default to 1% of balance
	return Math.round(balance * 0.01);
}

// ── Payment suggestion ─────────────────────────────────────────

/**
 * Calculate payment suggestion.
 * Returns optimal payment and time/interest savings if significant improvement found.
 */
export function calculatePaymentSuggestion(
	balance: number,
	rate: number,
	currentPayment: number,
	ttz: { months: number | null; totalInterest: number | null },
): {
	suggestedPayment: number;
	monthsSaved: number;
	interestSaved: number;
} | null {
	// No suggestion if never pays off or already fast (< 6 months)
	if (ttz.months === null || ttz.months < 6) {
		return null;
	}

	// Try +25%, +50%, +100% payment increments
	const increments = [1.25, 1.5, 2.0];

	for (const mult of increments) {
		const newPayment = Math.round(currentPayment * mult);
		const newTtz = calculateTTZ(balance, rate, {
			type: "flat",
			flat: newPayment,
		});

		if (
			newTtz.months !== null &&
			newTtz.totalInterest !== null &&
			ttz.totalInterest !== null
		) {
			const monthsSaved = ttz.months - newTtz.months;
			const interestSaved = ttz.totalInterest - newTtz.totalInterest;

			// Only suggest if saves 3+ months
			if (monthsSaved > 3) {
				return {
					suggestedPayment: newPayment,
					monthsSaved,
					interestSaved,
				};
			}
		}
	}

	return null;
}
