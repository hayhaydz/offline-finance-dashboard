/**
 * Reusable validation rule functions
 *
 * Provides factory functions for common validation patterns.
 * Each function returns a ValidationRule that can be used with FormField components.
 */

import type { ValidationRule } from './types';

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
