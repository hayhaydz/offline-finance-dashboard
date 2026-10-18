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
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

/** Abbreviated month names (0-indexed: MONTH_NAMES_SHORT[0] = "Jan") */
export const MONTH_NAMES_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
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
export const TAX_WRAPPERS = ["none", "isa", "lisa", "premium-bonds"] as const;
export type TaxWrapper = (typeof TAX_WRAPPERS)[number];

/** Valid liquidity values — sourced from accounts.liquidity enum in db/schema.ts */
export const LIQUIDITY_OPTIONS = ["instant", "delayed", "locked"] as const;
export type LiquidityOption = (typeof LIQUIDITY_OPTIONS)[number];

/** Tax-free wrappers — subset of TAX_WRAPPERS that receive tax-free treatment */
export const TAX_FREE_WRAPPERS: TaxWrapper[] = ["isa", "lisa", "premium-bonds"];

// ── Transaction Types ──────────────────────────────────────────

/** Valid transaction type values */
export const TRANSACTION_TYPES = [
	"deposit",
	"withdrawal",
	"refund",
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

/**
 * Human-readable labels — single source of truth for every surface
 * (creator form, ledger badges, import tooling).
 * Semantics are documented in docs/transactions/type-glossary.md.
 */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
	deposit: "Deposit",
	withdrawal: "Withdrawal",
	refund: "Refund",
	interest: "Interest",
	interest_accrued: "Interest (Accrued)",
	dividend: "Dividend",
	value_change: "Value Change",
	transfer_in: "Transfer In",
	transfer_out: "Transfer Out",
	charge: "Charge",
	payment: "Payment",
	loan_disbursement: "Loan Disbursement",
	mortgage_disbursement: "Mortgage Disbursement",
	interest_charge: "Interest Charge",
};

/** One-line glossary helper text per type (creator form hint text) */
export const TRANSACTION_TYPE_HELP: Record<TransactionType, string> = {
	deposit: "External money in (salary, cash in)",
	withdrawal: "External money out — spending",
	refund: "Reversal of a prior purchase — nets against spending",
	interest: "Interest credited/paid by the institution",
	interest_accrued:
		"Unrealised accrual — excluded from cash balance and tax totals",
	dividend: "Dividend paid by an investment holding",
	value_change: "Market value movement of investments only",
	transfer_in: "Money arriving from your own account",
	transfer_out: "Money leaving to your own account",
	charge: "Card/fee spending added to a liability balance",
	payment: "Repayment of a liability — reduces debt, not spending",
	loan_disbursement: "Initial loan amount received",
	mortgage_disbursement: "Initial mortgage amount received",
	interest_charge: "Interest added to a liability balance",
};

/**
 * Types offered in the transaction creator per account type.
 * Permissive by default: unknown account types show all types.
 * Glossary rulings: docs/transactions/type-glossary.md
 */
export const ACCOUNT_TYPE_ALLOWED_TRANSACTIONS: Record<
	AccountType,
	readonly TransactionType[]
> = {
	current: [
		"deposit",
		"withdrawal",
		"refund",
		"interest",
		"interest_accrued",
		"dividend",
		"transfer_in",
		"transfer_out",
	],
	savings: [
		"deposit",
		"withdrawal",
		"refund",
		"interest",
		"interest_accrued",
		"dividend",
		"transfer_in",
		"transfer_out",
	],
	investment: [
		"deposit",
		"withdrawal",
		"refund",
		"interest",
		"interest_accrued",
		"dividend",
		"value_change",
		"transfer_in",
		"transfer_out",
	],
	"credit-card": [
		"charge",
		"refund",
		"payment",
		"interest_charge",
		"transfer_in",
		"transfer_out",
	],
	loan: ["loan_disbursement", "payment", "refund", "interest_charge"],
	mortgage: ["mortgage_disbursement", "payment", "refund", "interest_charge"],
};

/** Types whose amounts are normalised to negative by the creator (money out / debt up) */
export const NEGATIVE_AMOUNT_TYPES: readonly TransactionType[] = [
	"withdrawal",
	"transfer_out",
	"charge",
	"interest_charge",
	"loan_disbursement",
	"mortgage_disbursement",
];

/** Types whose amount sign is kept exactly as entered */
export const SIGNED_AMOUNT_TYPES: readonly TransactionType[] = ["value_change"];

/**
 * Creator type list for an account type. Permissive-by-default:
 * unknown/unrecognised account types get the full type list.
 */
export function getTransactionTypesForAccountType(
	accountType: string,
): readonly TransactionType[] {
	return (
		ACCOUNT_TYPE_ALLOWED_TRANSACTIONS[accountType as AccountType] ??
		TRANSACTION_TYPES
	);
}

// ── Budget Spending Definition ─────────────────────────────────

/**
 * Budget spending = |withdrawal| + |charge| − |refund|.
 * Transfers between owned accounts and liability repayments (payment)
 * are excluded. Enforced identically in every budget query.
 */
export const BUDGET_SPENDING_TYPES: readonly TransactionType[] = [
	"withdrawal",
	"charge",
	"refund",
];
export const BUDGET_SPENDING_REFUND_TYPES: readonly TransactionType[] = [
	"refund",
];
