/**
 * Validation system types for form field validation
 *
 * Provides type definitions for validation rules and state management.
 * Works with Svelte 5 runes for reactive validation.
 */

/**
 * A single validation rule with a test function and error message
 */
export interface ValidationRule {
	/** Function that tests if a value is valid */
	validate: (value: string, formData?: Record<string, string>) => boolean;
	/** Error message to display when validation fails */
	message: string;
}

/**
 * Current validation state for a form field
 */
export interface ValidationState {
	/** Whether the field has passed all validation rules */
	isValid: boolean;
	/** The current error message (null if valid) */
	error: string | null;
	/** Whether the user has interacted with the field (blurred) */
	touched: boolean;
}

/**
 * Complete form field state including value and validation
 */
export interface FormField {
	/** Current field value */
	value: string;
	/** Validation state for this field */
	validation: ValidationState;
}
