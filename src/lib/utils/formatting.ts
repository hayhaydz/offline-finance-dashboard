/**
 * Shared formatting utilities for display across routes and server modules.
 *
 * Consolidates duplicated formatting functions from route files and server
 * modules into a single source of truth. Each function has a single correct
 * implementation — route files should import rather than redefining locally.
 */

// ── Tax Wrapper Formatting ─────────────────────────────────────

/**
 * Format a tax wrapper string for display.
 *
 * Uses a lookup map for correct display names (handles hyphenated values
 * like "premium-bonds" → "Premium Bonds" rather than "PREMIUM-BONDS").
 */
export function formatTaxWrapper(wrapper: string): string {
	const displayNames: Record<string, string> = {
		none: "None",
		isa: "ISA",
		lisa: "LISA",
		"premium-bonds": "Premium Bonds",
	};
	return displayNames[wrapper] ?? wrapper.toUpperCase();
}

// ── Rate Formatting ────────────────────────────────────────────

/**
 * Format basis points as a percentage string.
 *
 * @param basisPoints - Rate in basis points (450 = 4.50%), or null
 * @returns Formatted string like "4.50%" or "-" if null
 */
export function formatRate(basisPoints: number | null): string {
	if (basisPoints === null) return "-";
	return `${(basisPoints / 100).toFixed(2)}%`;
}

// ── Month / Date Helpers ───────────────────────────────────────

/**
 * Get month name from month number (1-12).
 */
import { MONTH_NAMES } from "$lib/utils/domain-constants";

export function getMonthName(month: number): string {
	return MONTH_NAMES[month - 1] || "Unknown";
}

/**
 * Format a number of days into a human-readable relative string.
 */
export function formatDays(days: number | null): string {
	if (days === null) return "-";
	if (days === 0) return "Today";
	if (days === 1) return "1 day";
	if (days < 7) return `${days} days`;
	if (days < 30) return `${Math.round(days / 7)} weeks`;
	if (days < 365) return `${Math.round(days / 30)} months`;
	return `${Math.round(days / 365)} years`;
}

// ── Exclusion / Status Helpers ─────────────────────────────────

/**
 * Get human-readable exclusion reason for interest projection accounts.
 */
export function getExclusionReason(reason: string | null): string {
	const reasons: Record<string, string> = {
		no_balance: "No balance",
		no_rate: "No rate set",
		already_matured: "Already matured",
		matures_after_tax_year: "Matures after tax year end",
		closed_account: "Account closed",
		non_interest_bearing: "Not interest-bearing",
	};
	return reasons[reason || ""] || reason || "Included";
}

/**
 * Get progress color classes based on percentage threshold.
 */
export function getProgressColor(progress: number): { text: string; bg: string } {
	if (progress >= 70) return { text: "text-green-700", bg: "bg-green-700" };
	if (progress >= 30) return { text: "text-amber-600", bg: "bg-amber-600" };
	return { text: "text-red-600", bg: "bg-red-600" };
}

/**
 * Get CSS class for on-track status indicator.
 */
export function getOnTrackClass(onTrack: boolean | null): string {
	if (onTrack === null) return "text-gray-500";
	return onTrack ? "text-green-700" : "text-amber-600";
}

// ── ASCII Progress Bar ─────────────────────────────────────────

/**
 * Render an ASCII progress bar for terminal-style UI.
 *
 * @param used - Current usage value
 * @param limit - Maximum value (defines 100%)
 * @param width - Character width of the bar (default: 10)
 * @returns String like "[###.......] 30%"
 */
export function renderProgressBar(used: number, limit: number, width = 10): string {
	const ratio = Math.min(1, used / limit);
	const filled = Math.round(ratio * width);
	const empty = width - filled;
	return `[${"#".repeat(filled)}${".".repeat(empty)}] ${Math.round(ratio * 100)}%`;
}
