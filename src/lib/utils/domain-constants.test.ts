import { describe, expect, it } from "vitest";
import { VALID_TRANSACTION_TYPES } from "./csv-parser";
import {
	ACCOUNT_TYPE_ALLOWED_TRANSACTIONS,
	ACCOUNT_TYPES,
	getTransactionTypesForAccountType,
	NEGATIVE_AMOUNT_TYPES,
	SIGNED_AMOUNT_TYPES,
	TRANSACTION_TYPE_HELP,
	TRANSACTION_TYPE_LABELS,
	TRANSACTION_TYPES,
	type TransactionType,
} from "./domain-constants";

describe("transaction type single source of truth", () => {
	it("includes refund in TRANSACTION_TYPES", () => {
		expect(TRANSACTION_TYPES).toContain("refund");
	});

	it("csv importer accepts the full TRANSACTION_TYPES set", () => {
		expect([...VALID_TRANSACTION_TYPES]).toEqual([...TRANSACTION_TYPES]);
	});

	it("labels and helper text cover every type", () => {
		for (const type of TRANSACTION_TYPES) {
			expect(TRANSACTION_TYPE_LABELS[type], `label for ${type}`).toBeTruthy();
			expect(TRANSACTION_TYPE_HELP[type], `help for ${type}`).toBeTruthy();
		}
	});

	it("sign normalisation sets are disjoint and exclude refund from negatives", () => {
		expect(NEGATIVE_AMOUNT_TYPES).not.toContain("refund");
		expect(SIGNED_AMOUNT_TYPES).not.toContain("refund");
		for (const t of NEGATIVE_AMOUNT_TYPES) {
			expect(SIGNED_AMOUNT_TYPES).not.toContain(t);
		}
	});
});

describe("creator/importer type parity", () => {
	it("every importer-valid type is selectable on a compatible account type", () => {
		const offered = new Set<TransactionType>();
		for (const accountType of ACCOUNT_TYPES) {
			for (const t of getTransactionTypesForAccountType(accountType)) {
				offered.add(t);
			}
		}
		for (const type of TRANSACTION_TYPES) {
			expect(
				offered.has(type),
				`${type} not creatable on any account type`,
			).toBe(true);
		}
	});

	it("every account type offers a non-empty list drawn from TRANSACTION_TYPES", () => {
		for (const accountType of ACCOUNT_TYPES) {
			const list = getTransactionTypesForAccountType(accountType);
			expect(list.length).toBeGreaterThan(0);
			for (const t of list) {
				expect(TRANSACTION_TYPES).toContain(t);
			}
		}
	});

	it("glossary rulings: value_change only on investment accounts", () => {
		for (const accountType of ACCOUNT_TYPES) {
			const list = getTransactionTypesForAccountType(accountType);
			if (accountType === "investment") {
				expect(list).toContain("value_change");
			} else {
				expect(list).not.toContain("value_change");
			}
		}
	});

	it("glossary rulings: loan_disbursement only on loans, mortgage_disbursement only on mortgages", () => {
		for (const accountType of ACCOUNT_TYPES) {
			const list = getTransactionTypesForAccountType(accountType);
			expect(list.includes("loan_disbursement")).toBe(accountType === "loan");
			expect(list.includes("mortgage_disbursement")).toBe(
				accountType === "mortgage",
			);
		}
	});

	it("refund is offered on every account type", () => {
		for (const accountType of ACCOUNT_TYPES) {
			expect(getTransactionTypesForAccountType(accountType)).toContain(
				"refund",
			);
		}
	});

	it("unknown account types are permissive — full type list", () => {
		expect(getTransactionTypesForAccountType("some-new-type")).toEqual(
			TRANSACTION_TYPES,
		);
	});

	it("map covers every account type exactly once", () => {
		expect(Object.keys(ACCOUNT_TYPE_ALLOWED_TRANSACTIONS).sort()).toEqual(
			[...ACCOUNT_TYPES].sort(),
		);
	});
});
