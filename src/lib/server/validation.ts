import { FIELD_LIMITS } from "$lib/utils/fieldLimits";
import { parseCurrency } from "$lib/utils/currency";

// ── Result types ──────────────────────────────────────────────

export type ValidationResult =
	| { ok: true; value: string }
	| { ok: false; error: string };

export type CurrencyResult =
	| { ok: true; valueInCents: number }
	| { ok: false; error: string };

export type DateResult =
	| { ok: true; date: Date }
	| { ok: false; error: string };

// ── String validators ─────────────────────────────────────────

/** Validate a required, non-empty trimmed string with optional max length */
export function requireString(
	value: string | null | undefined,
	field: string,
	maxLen?: number,
): ValidationResult {
	if (!value?.trim()) {
		return { ok: false, error: `${field} is required` };
	}
	const trimmed = value.trim();
	if (maxLen !== undefined && trimmed.length > maxLen) {
		return { ok: false, error: `${field} must be ${maxLen} characters or less` };
	}
	return { ok: true, value: trimmed };
}

/** Validate an optional string (allow null/empty) with max length */
export function optionalString(
	value: string | null | undefined,
	field: string,
	maxLen: number,
): ValidationResult {
	if (!value?.trim()) {
		return { ok: true, value: "" };
	}
	const trimmed = value.trim();
	if (trimmed.length > maxLen) {
		return { ok: false, error: `${field} must be ${maxLen} characters or less` };
	}
	return { ok: true, value: trimmed };
}

// ── Currency validators ───────────────────────────────────────

/** Parse a currency string and require a positive value */
export function requirePositiveCurrency(
	value: string | null | undefined,
	field: string,
): CurrencyResult {
	if (!value?.trim()) {
		return { ok: false, error: `${field} is required` };
	}
	try {
		const valueInCents = parseCurrency(value);
		if (valueInCents <= 0) {
			return { ok: false, error: `${field} must be greater than zero` };
		}
		return { ok: true, valueInCents };
	} catch {
		return {
			ok: false,
			error: `Enter ${field.toLowerCase()} like 10000.00 or 10000`,
		};
	}
}

/** Parse a currency string (allows zero, for balances) */
export function requireCurrency(
	value: string | null | undefined,
	field: string,
): CurrencyResult {
	if (!value?.trim()) {
		return { ok: false, error: `${field} is required` };
	}
	try {
		const valueInCents = parseCurrency(value);
		return { ok: true, valueInCents };
	} catch {
		return {
			ok: false,
			error: `Enter ${field.toLowerCase()} like 123.45 or 123`,
		};
	}
}

// ── Date validators ───────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a YYYY-MM-DD date string */
export function requireDateISO(
	value: string | null | undefined,
	field = "Date",
): DateResult {
	if (!value?.trim() || !DATE_REGEX.test(value.trim())) {
		return {
			ok: false,
			error: `Invalid ${field.toLowerCase()} format. Use YYYY-MM-DD.`,
		};
	}
	const date = new Date(`${value.trim()}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) {
		return { ok: false, error: `Invalid ${field.toLowerCase()}` };
	}
	return { ok: true, date };
}

// ── Enum validators ───────────────────────────────────────────

/** Validate that a value is in a set of allowed values */
export function requireEnum<T extends string>(
	value: string | null | undefined,
	allowed: readonly T[],
	field: string,
): ValidationResult {
	if (!value || !allowed.includes(value as T)) {
		return { ok: false, error: `Select a valid ${field.toLowerCase()}` };
	}
	return { ok: true, value };
}

// ── Re-exported constants for server-side use ─────────────────

/** Valid account type values */
export const VALID_ACCOUNT_TYPES = [
	"current",
	"savings",
	"investment",
	"credit-card",
	"loan",
	"mortgage",
] as const;

/** Valid tax wrapper values */
export const VALID_TAX_WRAPPERS = [
	"none",
	"isa",
	"lisa",
	"premium-bonds",
] as const;

/** Valid liquidity values */
export const VALID_LIQUIDITY = ["instant", "delayed", "locked"] as const;

/** Field limit constants (re-export from fieldLimits for convenience) */
export { FIELD_LIMITS };
