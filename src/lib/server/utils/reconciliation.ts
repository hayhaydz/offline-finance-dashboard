/**
 * Shared reconciliation framework for breakdown reports.
 *
 * Verifies that breakdown dimension sums match the headline total,
 * generating error/warning flags for any discrepancies.
 *
 * Used by both interestBreakdown and isaBreakdown modules.
 */

import type {
	ReconciliationFlag,
	ReconciliationCategory,
} from "$lib/types/breakdown";

export type { ReconciliationFlag };

export interface ReconciliationCheck {
	/** Display name for error messages */
	label: string;
	/** Category identifier */
	category: ReconciliationCategory;
	/** The sum to validate against the headline total */
	sum: number;
}

export interface ReconciliationResult {
	flags: ReconciliationFlag[];
	deltas: Record<string, number>;
}

/**
 * Reconcile breakdown dimensions against a headline total.
 *
 * For each check, compares the sum against the headline total.
 * If they differ, generates an error flag with the delta.
 *
 * @param headlineTotal - The authoritative total to check against
 * @param checks - Array of dimensions to verify
 * @param formatValue - Optional formatter for error messages (defaults to raw cents)
 */
export function reconcileBreakdowns(
	headlineTotal: number,
	checks: ReconciliationCheck[],
	formatValue?: (value: number) => string,
): ReconciliationResult {
	const fmt = formatValue ?? ((v) => `${v} cents`);
	const flags: ReconciliationFlag[] = [];
	const deltas: Record<string, number> = {};

	for (const check of checks) {
		const delta = headlineTotal - check.sum;
		deltas[check.category] = delta;

		if (delta !== 0) {
			flags.push({
				type: "error",
				category: check.category,
				message: `${check.label} sum (${fmt(check.sum)}) does not match headline total (${fmt(headlineTotal)})`,
				delta,
			});
		}
	}

	return { flags, deltas };
}

/**
 * Add a warning flag for a specific condition.
 *
 * Used for domain-specific warnings like ISA allowance exceeded
 * or interest approaching PSA limit.
 */
export function addWarningFlag(
	flags: ReconciliationFlag[],
	category: ReconciliationCategory,
	message: string,
): void {
	flags.push({ type: "warning", category, message });
}
