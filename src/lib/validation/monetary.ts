/**
 * Monetary input validation rules
 *
 * Provides validation for monetary amounts in decimal format (e.g., "123.45").
 * All monetary values are stored as integers representing cents/pence to avoid
 * floating-point precision errors in financial calculations.
 *
 * Validates format: digits with optional decimal point and 0-2 decimal digits
 * - Valid: "123", "123.45", "123.4", "0.99"
 * - Invalid: "abc", "12.345", "123.", ".45"
 */

import type { ValidationRule } from './types';

/**
 * Regular expression for monetary format validation
 * Matches: optional whitespace, digits, optional decimal with 1-2 digits, optional whitespace
 * Examples: "123" -> true, "123.45" -> true, "123.4" -> true, "12.345" -> false
 *
 * Note: Rejects trailing decimal point - decimal must be followed by at least 1 digit
 */
const MONETARY_REGEX = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/;

/**
 * Parse monetary input string to cents value
 *
 * Converts a decimal string like "123.45" to integer cents (12345).
 * This is the core helper for converting user input to storage format.
 *
 * @param input - Monetary string (e.g., "123.45")
 * @returns Integer value in cents (e.g., 12345)
 * @throws Error if format is invalid
 *
 * @example
 * parseMonetary("123.45") // => 12345
 * parseMonetary("100")    // => 10000
 * parseMonetary("0.99")   // => 99
 */
export function parseMonetary(input: string): number {
	// Trim whitespace
	const trimmed = input.trim();

	// Empty string is not valid for parseMonetary (use monetaryOptional for that)
	if (!trimmed) {
		throw new Error('Empty value cannot be parsed as monetary');
	}

	// Match against regex
	const match = MONETARY_REGEX.exec(trimmed);
	if (!match) {
		throw new Error(`Invalid monetary format: "${input}"`);
	}

	// Extract dollars and cents
	const dollars = parseInt(match[1], 10);
	const centsStr = match[2];

	// Handle cents: pad to 2 digits if present, otherwise 0
	let cents = 0;
	if (centsStr) {
		// Pad to 2 digits: "4" -> "40", "45" -> "45"
		cents = parseInt(centsStr.padEnd(2, '0'), 10);
	}

	// Calculate total cents
	return (dollars * 100) + cents;
}

/**
 * Monetary validation rule (required field)
 *
 * Validates that the input is a valid monetary amount in decimal format.
 * Does NOT allow empty values - use monetaryOptional for optional fields.
 *
 * Stores the parsed cents value for the form action to use directly.
 * Access via the rule's value property after validation.
 *
 * @param message - Custom error message
 * @returns Validation rule for required monetary input
 *
 * @example
 * const rule = monetary();
 * rule.validate("123.45") // => true
 * rule.validate("abc")    // => false
 * rule.value              // => 12345 (after successful validation)
 */
export function monetary(message?: string): ValidationRule & { value?: number } {
	const rule: ValidationRule & { value?: number } = {
		validate: (value: string) => {
			try {
				// Try to parse - will throw if invalid
				rule.value = parseMonetary(value);
				return true;
			} catch {
				return false;
			}
		},
		message: message || 'Enter a valid amount (e.g., 123.45)'
	};

	return rule;
}

/**
 * Monetary validation rule (optional field)
 *
 * Validates that the input is either empty OR a valid monetary amount.
 * Use this for optional monetary fields where the user may leave it blank.
 *
 * Stores the parsed cents value (or undefined if empty) for the form action.
 *
 * @param message - Custom error message
 * @returns Validation rule for optional monetary input
 *
 * @example
 * const rule = monetaryOptional();
 * rule.validate("")       // => true
 * rule.validate("123.45") // => true
 * rule.validate("abc")    // => false
 * rule.value              // => undefined (if empty) or 12345 (if valid)
 */
export function monetaryOptional(message?: string): ValidationRule & { value?: number | undefined } {
	const rule: ValidationRule & { value?: number | undefined } = {
		validate: (value: string) => {
			// Empty string is valid for optional field
			const trimmed = value.trim();
			if (!trimmed) {
				rule.value = undefined;
				return true;
			}

			try {
				// Try to parse non-empty value
				rule.value = parseMonetary(value);
				return true;
			} catch {
				return false;
			}
		},
		message: message || 'Must be empty or a valid amount (e.g., 123.45)'
	};

	return rule;
}
