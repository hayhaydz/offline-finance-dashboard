/**
 * Currency formatting utilities for financial data
 *
 * All monetary values are stored as integers (pence) in the database
 * to avoid floating-point precision issues. These utilities convert between
 * integer storage and display format.
 *
 * References:
 * - MDN: Intl.NumberFormat for locale-aware formatting
 * - Honeybadger Blog: Currency Calculations in JavaScript (precision issues)
 */

/**
 * Module-level currency formatter (cached for performance)
 *
 * Uses en-GB locale with GBP currency (default going forward).
 * In the future, this could be made configurable per user for multi-currency support.
 */
const currencyFormatter = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/**
 * Format an amount in pence to a currency string for display
 *
 * @param amountInPence - The amount in pence (integer)
 * @returns Formatted currency string (e.g., "£123.45")
 *
 * @example
 * formatCurrency(12345)  // => "£123.45"
 * formatCurrency(0)      // => "£0.00"
 * formatCurrency(-5000)  // => "-£50.00" (for liabilities)
 */
export function formatCurrency(amountInPence: number): string {
	return currencyFormatter.format(amountInPence / 100);
}

/**
 * Parse a currency input string to pence for storage
 *
 * Accepts formats like "123.45", "123", "123.4" and converts to integer pence.
 * Throws an error for invalid formats.
 *
 * @param input - The currency string to parse (e.g., "123.45")
 * @returns The amount in pence (integer)
 * @throws Error if the input format is invalid
 *
 * @example
 * parseCurrency("123.45")  // => 12345
 * parseCurrency("123")     // => 12300
 * parseCurrency("123.4")   // => 12340
 * parseCurrency("")        // => throws Error
 * parseCurrency("abc")     // => throws Error
 */
export function parseCurrency(input: string): number {
	// Trim whitespace
	const trimmed = input.trim();

	// Handle empty string
	if (trimmed === "") {
		throw new Error("Currency amount cannot be empty");
	}

	// Match: digits with optional decimal and 0-2 pence digits
	// Allows: "123", "123.4", "123.45"
	// Rejects: "abc", "123.456", ".123", "123.", "-123"
	const match = trimmed.match(/^(\d+)\.?(\d{0,2})?$/);

	if (!match) {
		throw new Error("Invalid currency format. Enter amount like 123.45 or 123");
	}

	const pounds = parseInt(match[1], 10);
	const pence = match[2] ? parseInt(match[2].padEnd(2, "0"), 10) : 0;

	return pounds * 100 + pence;
}

/**
 * Format a single date for use in date ranges
 *
 * Uses en-GB locale formatting: "1 Jan 2026", "15 Feb 2026"
 *
 * @param date - The date to format
 * @returns Formatted date string (e.g., "1 Jan 2026")
 *
 * @example
 * formatDateForRange(new Date(2026, 0, 1))  // => "1 Jan 2026"
 * formatDateForRange(new Date(2026, 1, 15)) // => "15 Feb 2026"
 */
export function formatDateForRange(date: Date): string {
	return date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

/**
 * Format an account type for display
 *
 * @param type - The account type string from database (e.g., "credit-card")
 * @returns Human-readable label (e.g., "Credit Card")
 */
export function formatAccountType(type: string): string {
	const labels: Record<string, string> = {
		current: "Current",
		savings: "Savings",
		investment: "Investments",
		"credit-card": "Credit Card",
		loan: "Personal Loan",
		mortgage: "Mortgage",
	};
	return labels[type] || type;
}

/**
 * Format a date for general UI display (e.g., "9 Feb 2026")
 *
 * @param date - The date to format
 * @returns Formatted date string or "-" if null
 */
export function formatDate(date: Date | null | undefined): string {
	if (!date) return "-";
	return date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

/**
 * Format a date in compact ISO shorthand for table columns (e.g., "2026-02-09")
 *
 * Matches the snapshot date format for consistency across the UI.
 *
 * @param date - The date to format
 * @returns ISO date string (YYYY-MM-DD) or "-" if null
 *
 * @example
 * formatDateShorthand(new Date(2026, 1, 9))  // => "2026-02-09"
 * formatDateShorthand(new Date(2025, 11, 1))  // => "2025-12-01"
 */
export function formatDateShorthand(date: Date | null | undefined): string {
	if (!date) return "-";

	// Use UTC parts so date-only displays stay stable across user timezones.
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

/**
 * Format a date range for net worth display
 *
 * Produces "as of {date}" format with intelligent year handling:
 * - Same year: "as of 1 Jan - 15 Feb 2026"
 * - Different years: "as of 1 Jan 2025 - 15 Feb 2026"
 * - Single date: "as of 1 Jan 2026"
 *
 * @param oldest - The oldest date in the range
 * @param newest - The newest date in the range
 * @returns Formatted date range string
 *
 * @example
 * formatDateRange(new Date(2026, 0, 1), new Date(2026, 1, 15))
 * // => "as of 1 Jan - 15 Feb 2026"
 *
 * formatDateRange(new Date(2025, 11, 1), new Date(2026, 1, 15))
 * // => "as of 1 Dec 2025 - 15 Feb 2026"
 *
 * formatDateRange(new Date(2026, 0, 1), new Date(2026, 0, 1))
 * // => "as of 1 Jan 2026"
 */
export function formatDateRange(oldest: Date, newest: Date): string {
	const oldestFormatted = formatDateForRange(oldest);
	const newestFormatted = formatDateForRange(newest);

	// Single date case (both dates are the same)
	if (oldest.getTime() === newest.getTime()) {
		return `as of ${oldestFormatted}`;
	}

	// Same year: "as of 1 Jan - 15 Feb 2026"
	if (oldest.getFullYear() === newest.getFullYear()) {
		const oldestParts = oldestFormatted.split(" ");
		const newestParts = newestFormatted.split(" ");

		// oldestParts: ["1", "Jan", "2026"]
		// newestParts: ["15", "Feb", "2026"]
		// Result: "as of 1 Jan - 15 Feb 2026"
		return `as of ${oldestParts[0]} ${oldestParts[1]} - ${newestParts[0]} ${newestParts[1]} ${newestParts[2]}`;
	}

	// Different years: "as of 1 Jan 2025 - 15 Feb 2026"
	return `as of ${oldestFormatted} - ${newestFormatted}`;
}

/**
 * Format currency with shorthand notation for large round numbers
 *
 * Converts round thousands to shorthand format (£2k instead of £2,000.00)
 * Removes .00 when there are no pence
 *
 * @param amountInPence - The amount in pence (integer)
 * @returns Formatted currency string with shorthand (e.g., "£2k", "£1,500", "£123.45")
 *
 * @example
 * formatCurrencyShorthand(200000)  // => "£2k"
 * formatCurrencyShorthand(150000)  // => "£1,500"
 * formatCurrencyShorthand(12345)   // => "£123.45"
 * formatCurrencyShorthand(100000)  // => "£1k"
 * formatCurrencyShorthand(100)     // => "£1"
 */
export function formatCurrencyShorthand(amountInPence: number): string {
	const pounds = amountInPence / 100;

	// Round thousands without pence: 200000 pence (£2,000) -> "£2k"
	if (pounds >= 1000 && pounds % 1000 === 0) {
		return `£${Math.floor(pounds / 1000)}k`;
	}

	// No pence: remove .00 suffix (check if pounds is a whole number)
	if (pounds % 1 === 0) {
		const formatter = new Intl.NumberFormat("en-GB", {
			style: "currency",
			currency: "GBP",
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		});
		return formatter.format(pounds);
	}

	// Has pence: use standard format
	return formatCurrency(amountInPence);
}
