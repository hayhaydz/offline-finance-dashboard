/**
 * Staleness indicator for data freshness
 *
 * Green:   Updated within 7 days
 * Amber:   Updated 8-30 days ago
 * Red:     Updated 30+ days ago
 * null:    No valid date (empty data or invalid timestamp)
 */

import { MS_PER_DAY } from "$lib/utils/time-constants";

export interface StalenessInfo {
	color: "green" | "amber" | "red";
	label: string; // e.g., "Updated today", "Updated 3 days ago"
	cssClass: string; // Tailwind class for the dot
}

/**
 * Coerce a value from the DB (or serialized through SvelteKit) into a Date.
 *
 * The better-sqlite3-multiple-ciphers driver does not invoke Drizzle's
 * mapFromDriverValue, so `integer("col", { mode: "timestamp" })` arrives as
 * a raw number (Unix seconds) or string, not a Date. This helper normalises
 * all three shapes.
 */
function toDate(value: Date | number | string): Date | null {
	if (value instanceof Date) return value;

	if (typeof value === "number") {
		// SQLite timestamps are in seconds; JS expects milliseconds.
		// Heuristic: values < 10^12 are in seconds (before ~2001 in ms).
		const ms = value < 1e12 ? value * 1000 : value;
		const d = new Date(ms);
		return isNaN(d.getTime()) ? null : d;
	}

	if (typeof value === "string") {
		const d = new Date(value);
		return isNaN(d.getTime()) ? null : d;
	}

	return null;
}

/**
 * Calculate staleness based on the most recent update date.
 * Returns null when the input is invalid or missing.
 */
export function getStaleness(
	lastUpdated: Date | number | string | null | undefined,
): StalenessInfo | null {
	if (lastUpdated == null) return null;

	const date = toDate(lastUpdated);
	if (!date) return null;

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / MS_PER_DAY);

	if (diffDays === 0) {
		return {
			color: "green",
			label: "Updated today",
			cssClass: "text-green-700",
		};
	}

	if (diffDays === 1) {
		return {
			color: "green",
			label: "Updated yesterday",
			cssClass: "text-green-700",
		};
	}

	if (diffDays <= 7) {
		return {
			color: "green",
			label: `Updated ${diffDays} days ago`,
			cssClass: "text-green-700",
		};
	}

	if (diffDays <= 30) {
		return {
			color: "amber",
			label: `Updated ${diffDays} days ago`,
			cssClass: "text-amber-600",
		};
	}

	// 30+ days
	return {
		color: "red",
		label: `Updated ${diffDays} days ago`,
		cssClass: "text-red-700",
	};
}

/**
 * Find the most recent date from an array of dates.
 * Returns null if the array is empty or all values are invalid.
 */
export function getMostRecentDate(
	dates: (Date | number | string)[],
): Date | null {
	if (dates.length === 0) return null;

	const validDates = dates
		.map((d) => toDate(d))
		.filter((d): d is Date => d !== null);

	if (validDates.length === 0) return null;

	return new Date(Math.max(...validDates.map((d) => d.getTime())));
}
