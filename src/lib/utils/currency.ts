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
const currencyFormatter = new Intl.NumberFormat('en-GB', {
	style: 'currency',
	currency: 'GBP',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
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
	if (trimmed === '') {
		throw new Error('Currency amount cannot be empty');
	}

	// Match: digits with optional decimal and 0-2 pence digits
	// Allows: "123", "123.4", "123.45"
	// Rejects: "abc", "123.456", ".123", "123.", "-123"
	const match = trimmed.match(/^(\d+)\.?(\d{0,2})?$/);

	if (!match) {
		throw new Error('Invalid currency format. Enter amount like 123.45 or 123');
	}

	const pounds = parseInt(match[1], 10);
	const pence = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0;

	return (pounds * 100) + pence;
}
