import { describe, expect, it } from "vitest";
import { suggestSpendingType } from "./type-suggest";
import { TRANSACTION_TYPES } from "./domain-constants";

// Phase 9 polish: spending-like descriptions suggest a budget-visible
// spending type so txns never silently miss budget tracking.

const categories = [
	{ id: 1, name: "Groceries" },
	{ id: 2, name: "Eating Out" },
	{ id: 3, name: "Transport" },
];

const currentAccount = [
	"deposit",
	"withdrawal",
	"refund",
	"interest",
	"transfer_in",
	"transfer_out",
] as const;

describe("suggestSpendingType", () => {
	it("suggests withdrawal for a spending-like description on a current account", () => {
		expect(
			suggestSpendingType("Tesco weekly shop", categories, currentAccount),
		).toBe("withdrawal");
	});

	it("suggests charge when withdrawal is not creatable but charge is", () => {
		const cardTypes = ["deposit", "charge", "payment", "refund"] as const;
		expect(
			suggestSpendingType("Uber Eats order", categories, cardTypes),
		).toBe("charge");
	});

	it("returns null when the description matches no spending rule", () => {
		expect(
			suggestSpendingType("nothing recognisable here", categories, currentAccount),
		).toBeNull();
	});

	it("returns null when the account offers no budget-visible spending type", () => {
		const incomeOnly = ["deposit", "interest", "dividend"] as const;
		expect(
			suggestSpendingType("Tesco weekly shop", categories, incomeOnly),
		).toBeNull();
	});

	it("returns null for an empty description", () => {
		expect(suggestSpendingType("", categories, currentAccount)).toBeNull();
	});

	it("suggests for every spending keyword family (groceries / eating out / transport)", () => {
		for (const desc of ["Sainsburys", "Nandos", "TFL top-up"]) {
			expect(suggestSpendingType(desc, categories, TRANSACTION_TYPES)).toBe(
				"withdrawal",
			);
		}
	});
});
