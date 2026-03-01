/**
 * Staleness indicator for data freshness
 *
 * Green:   Updated within 7 days
 * Amber:   Updated 8-30 days ago
 * Red:     Updated 30+ days ago
 */

export interface StalenessInfo {
	color: "green" | "amber" | "red";
	label: string; // e.g., "Updated today", "Updated 3 days ago"
	cssClass: string; // Tailwind class for the dot
}

/**
 * Calculate staleness based on the most recent update date
 */
export function getStaleness(lastUpdated: Date): StalenessInfo {
	const now = new Date();
	const diffMs = now.getTime() - lastUpdated.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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
 * Find the most recent date from an array of dates
 */
export function getMostRecentDate(dates: Date[]): Date {
	if (dates.length === 0) {
		return new Date(0); // Epoch if no dates
	}
	return new Date(Math.max(...dates.map((d) => d.getTime())));
}
