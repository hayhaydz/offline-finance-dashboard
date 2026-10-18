/**
 * Calendar month-key helpers for month-keyed history grids
 * ("YYYY-MM" strings). Shared by income and expenses history pages.
 */

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function isValidMonth(month: string): boolean {
	const match = month.match(MONTH_PATTERN);
	if (!match) return false;
	const m = Number(match[2]);
	return m >= 1 && m <= 12;
}

export function monthToIndex(month: string): number | null {
	const match = month.match(MONTH_PATTERN);
	if (!match) return null;
	return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

export function indexToMonth(index: number): string {
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;
	return `${year}-${String(month).padStart(2, "0")}`;
}

/** Current calendar month as "YYYY-MM" (local time). */
export function currentMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
