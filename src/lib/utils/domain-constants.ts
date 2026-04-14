/**
 * Domain constants for the finance dashboard.
 *
 * Single source of truth for all enum arrays used across the codebase.
 * These values correspond to the database schema enum constraints.
 * When schema enums change, update this file and all consumers will follow.
 */

// ── Month Names ────────────────────────────────────────────────

/** Full month names (1-indexed: MONTH_NAMES[0] = "January") */
export const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
] as const;

/** Abbreviated month names (0-indexed: MONTH_NAMES_SHORT[0] = "Jan") */
export const MONTH_NAMES_SHORT = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// ── Account Enums ──────────────────────────────────────────────

/** Valid account type values — sourced from accounts.type enum in db/schema.ts */
export const ACCOUNT_TYPES = [
	"current",
	"savings",
	"investment",
	"credit-card",
	"loan",
	"mortgage",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Valid tax wrapper values — sourced from accounts.taxWrapper enum in db/schema.ts */
export const TAX_WRAPPERS = [
	"none",
	"isa",
	"lisa",
	"premium-bonds",
] as const;
export type TaxWrapper = (typeof TAX_WRAPPERS)[number];

/** Valid liquidity values — sourced from accounts.liquidity enum in db/schema.ts */
export const LIQUIDITY_OPTIONS = [
	"instant",
	"delayed",
	"locked",
] as const;
export type LiquidityOption = (typeof LIQUIDITY_OPTIONS)[number];

/** Tax-free wrappers — subset of TAX_WRAPPERS that receive tax-free treatment */
export const TAX_FREE_WRAPPERS: TaxWrapper[] = ["isa", "lisa", "premium-bonds"];

// ── Transaction Types ──────────────────────────────────────────

/** Valid transaction type values */
export const TRANSACTION_TYPES = [
	"deposit",
	"withdrawal",
	"interest",
	"interest_accrued",
	"dividend",
	"value_change",
	"transfer_in",
	"transfer_out",
	"charge",
	"payment",
	"loan_disbursement",
	"mortgage_disbursement",
	"interest_charge",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
