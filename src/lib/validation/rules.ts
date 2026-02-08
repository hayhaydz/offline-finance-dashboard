/**
 * Reusable validation rule functions
 *
 * Provides factory functions for common validation patterns.
 * Each function returns a ValidationRule that can be used with FormField components.
 */

import type { ValidationRule } from './types';

/**
 * Valid account types enum values
 */
const ACCOUNT_TYPES = ['current', 'savings', 'credit', 'investment', 'ISA', 'LISA'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

/**
 * Valid liquidity options enum values
 */
const LIQUIDITY_OPTIONS = ['instant', 'delayed', 'locked'] as const;
export type Liquidity = typeof LIQUIDITY_OPTIONS[number];

/**
 * Creates a rule that requires a non-empty value
 *
 * @param message - Custom error message (default: "This field is required")
 * @returns Validation rule
 */
export function required(message?: string): ValidationRule {
	return {
		validate: (value: string) => value.trim().length > 0,
		message: message || 'This field is required'
	};
}

/**
 * Creates a rule that enforces minimum length
 *
 * @param min - Minimum required length
 * @param message - Custom error message (default includes min value)
 * @returns Validation rule
 */
export function minLength(min: number, message?: string): ValidationRule {
	return {
		validate: (value: string) => value.length >= min,
		message: message || `Must be at least ${min} characters`
	};
}

/**
 * Creates a rule that enforces maximum length
 *
 * @param max - Maximum allowed length
 * @param message - Custom error message (default includes max value)
 * @returns Validation rule
 */
export function maxLength(max: number, message?: string): ValidationRule {
	return {
		validate: (value: string) => value.length <= max,
		message: message || `Must be no more than ${max} characters`
	};
}

/**
 * Creates a rule that matches a regular expression pattern
 *
 * @param regex - Regular expression to test against
 * @param message - Custom error message
 * @returns Validation rule
 */
export function pattern(regex: RegExp, message: string): ValidationRule {
	return {
		validate: (value: string) => regex.test(value),
		message
	};
}

/**
 * Creates a rule that validates email format
 *
 * @param message - Custom error message (default: "Invalid email address")
 * @returns Validation rule
 */
export function email(message?: string): ValidationRule {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return {
		validate: (value: string) => !value || emailRegex.test(value),
		message: message || 'Invalid email address'
	};
}

/**
 * Creates a rule that validates against another field's value
 *
 * Useful for password confirmation fields.
 *
 * @param fieldName - Name of the field to match against
 * @param message - Custom error message (default: "Must match {fieldName}")
 * @returns Validation rule
 */
export function matches(fieldName: string, message?: string): ValidationRule {
	return {
		validate: (_value: string, formData?: Record<string, string>) => {
			if (!formData) return true;
			const otherValue = formData[fieldName];
			return _value === otherValue;
		},
		message: message || `Must match ${fieldName}`
	};
}

/**
 * Creates a rule that validates a numeric-only value
 *
 * @param message - Custom error message (default: "Must contain only numbers")
 * @returns Validation rule
 */
export function numeric(message?: string): ValidationRule {
	return {
		validate: (value: string) => /^\d*$/.test(value),
		message: message || 'Must contain only numbers'
	};
}

/**
 * Creates a rule for exact length validation
 *
 * @param length - Required exact length
 * @param message - Custom error message (default includes length value)
 * @returns Validation rule
 */
export function exactLength(length: number, message?: string): ValidationRule {
	return {
		validate: (value: string) => value.length === length,
		message: message || `Must be exactly ${length} characters`
	};
}

/**
 * Creates a rule for TOTP or backup code validation
 *
 * Accepts either:
 * - Exactly 6 numeric characters (TOTP code), OR
 * - Exactly 8 alphanumeric characters (backup code)
 *
 * @param message - Custom error message (default: explanation of both formats)
 * @returns Validation rule
 */
export function totpOrBackupCode(message?: string): ValidationRule {
	return {
		validate: (value: string) => {
			// TOTP: exactly 6 digits
			const isTOTP = /^\d{6}$/.test(value);
			// Backup code: exactly 8 alphanumeric characters (A-F, 0-9)
			const isBackupCode = /^[0-9A-Fa-f]{8}$/.test(value);
			return isTOTP || isBackupCode;
		},
		message: message || 'Enter a 6-digit authenticator code OR an 8-character backup code'
	};
}

/**
 * Creates a rule that requires at least one uppercase letter
 *
 * @param message - Custom error message (default: "Must contain at least one uppercase letter")
 * @returns Validation rule
 */
export function hasUppercase(message?: string): ValidationRule {
	return {
		validate: (value: string) => /[A-Z]/.test(value),
		message: message || 'Must contain at least one uppercase letter (A-Z)'
	};
}

/**
 * Creates a rule that requires at least one lowercase letter
 *
 * @param message - Custom error message (default: "Must contain at least one lowercase letter")
 * @returns Validation rule
 */
export function hasLowercase(message?: string): ValidationRule {
	return {
		validate: (value: string) => /[a-z]/.test(value),
		message: message || 'Must contain at least one lowercase letter (a-z)'
	};
}

/**
 * Creates a rule that requires at least one number
 *
 * @param message - Custom error message (default: "Must contain at least one number")
 * @returns Validation rule
 */
export function hasNumber(message?: string): ValidationRule {
	return {
		validate: (value: string) => /[0-9]/.test(value),
		message: message || 'Must contain at least one number (0-9)'
	};
}

/**
 * Creates a rule that requires at least one special character
 *
 * Special characters: !@#$%^&*()_+-=[]{}|;:',.<>?/`~
 *
 * @param message - Custom error message (default: "Must contain at least one special character")
 * @returns Validation rule
 */
export function hasSpecial(message?: string): ValidationRule {
	return {
		validate: (value: string) => /[!@#$%^&*()_+\-=\[\]{}|;:',.<>?\/`~]/.test(value),
		message: message || 'Must contain at least one special character (!@#$%^&* etc.)'
	};
}

/**
 * Creates a combined strong password rule (industry standard)
 *
 * Requires: minimum 12 characters, uppercase, lowercase, number, special character
 *
 * @param min - Minimum password length (default: 12)
 * @returns Validation rule array with all requirements
 */
export function strongPassword(min = 12): ValidationRule[] {
	return [
		minLength(min, `Password must be at least ${min} characters`),
		hasUppercase(),
		hasLowercase(),
		hasNumber(),
		hasSpecial()
	];
}

/**
 * Creates a rule that validates against a fixed set of allowed values
 *
 * Internal factory function for enum validation. Reduces code duplication
 * for accountType and liquidity validators.
 *
 * @param allowedValues - Array of valid values
 * @param message - Custom error message (default: "Select a valid option")
 * @returns Validation rule
 */
function oneOf<T extends string>(allowedValues: readonly T[], message?: string): ValidationRule {
	const allowedSet = new Set(allowedValues);
	return {
		validate: (value: string) => allowedSet.has(value as T),
		message: message || 'Select a valid option'
	};
}

/**
 * Account type validation rule
 *
 * Validates against the fixed account type enum:
 * 'current', 'savings', 'credit', 'investment', 'ISA', 'LISA'
 *
 * Case-sensitive exact match - use for select dropdowns only.
 *
 * @param message - Custom error message (default: "Select a valid account type")
 * @returns Validation rule for account type
 *
 * @example
 * const rule = accountType();
 * rule.validate('savings')  // => true
 * rule.validate('invalid')  // => false
 * rule.validate('Savings')  // => false (case-sensitive)
 */
export function accountType(message?: string): ValidationRule {
	return oneOf(ACCOUNT_TYPES, message || 'Select a valid account type');
}

/**
 * Liquidity validation rule (optional field)
 *
 * Validates against the fixed liquidity enum:
 * 'instant', 'delayed', 'locked'
 *
 * Allows empty string for optional fields. Use for select dropdowns.
 *
 * @param message - Custom error message (default: "Select a valid liquidity option")
 * @returns Validation rule for liquidity
 *
 * @example
 * const rule = liquidity();
 * rule.validate('')         // => true (optional)
 * rule.validate('instant')  // => true
 * rule.validate('invalid')  // => false
 */
export function liquidity(message?: string): ValidationRule {
	return {
		validate: (value: string) => {
			// Empty string is valid for optional field
			if (!value.trim()) {
				return true;
			}
			// Check against allowed values
			return LIQUIDITY_OPTIONS.includes(value as Liquidity);
		},
		message: message || 'Select a valid liquidity option'
	};
}

/**
 * Date validation rule - blocks future dates
 *
 * Accepts date string in YYYY-MM-DD format and validates that it is
 * not in the future. Uses UTC timestamps to avoid timezone confusion.
 *
 * This is used for balance entry "as-of dates" - users can only enter
 * balances for today or past dates, not future dates.
 *
 * @param message - Custom error message (default: "Date cannot be in the future")
 * @returns Validation rule for date input
 *
 * @example
 * const rule = notFutureDate();
 * rule.validate('2026-02-07')  // => true (if today or past)
 * rule.validate('2026-02-09')  // => false (if in future)
 */
export function notFutureDate(message?: string): ValidationRule {
	return {
		validate: (value: string) => {
			// Empty string is not valid (use with required() for optional)
			if (!value.trim()) {
				return false;
			}

			// Parse YYYY-MM-DD format to UTC timestamp
			const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
			if (!match) {
				return false;
			}

			// Create Date at midnight UTC to avoid timezone issues
			const inputDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);

			// Get today at midnight UTC
			const today = new Date();
			today.setUTCHours(0, 0, 0, 0);

			// Check if input date is in the future
			return inputDate <= today;
		},
		message: message || 'Date cannot be in the future'
	};
}

/**
 * Monetary amount validation rule (optional field)
 *
 * Validates currency input format like "123.45", "123", "123.4".
 * Allows empty string for optional fields.
 *
 * This validates the format - use parseCurrency() from $lib/utils/currency
 * to convert the string to integer cents for storage.
 *
 * @param message - Custom error message (default: "Enter amount like 123.45 or 123")
 * @returns Validation rule for monetary input
 *
 * @example
 * const rule = monetary();
 * rule.validate('')         // => true (optional)
 * rule.validate('123.45')   // => true
 * rule.validate('123')      // => true
 * rule.validate('123.4')    // => true
 * rule.validate('123.456')  // => false (too many decimals)
 * rule.validate('abc')      // => false
 */
export function monetary(message?: string): ValidationRule {
	return {
		validate: (value: string) => {
			// Empty string is valid for optional field
			if (!value.trim()) {
				return true;
			}

			// Match: digits with optional decimal and 0-2 cents digits
			// Allows: "123", "123.4", "123.45"
			// Rejects: "abc", "123.456", ".123", "123.", "-123"
			const match = /^\d+(\.\d{0,2})?$/.test(value.trim());
			return match;
		},
		message: message || 'Enter amount like 123.45 or 123'
	};
}
