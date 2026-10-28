import { describe, expect, it } from "vitest";
import {
	CATEGORY_SUGGEST_RULES,
	categoryKeyFromName,
	suggestCategoryForDescription,
} from "$lib/utils/category-suggest";

const categories = [
	{ id: 1, name: "Bills" },
	{ id: 2, name: "Eating Out" },
	{ id: 3, name: "Groceries" },
	{ id: 4, name: "Transport" },
	{ id: 5, name: "Holidays" },
	{ id: 6, name: "Entertainment" },
	{ id: 7, name: "Shopping" },
	{ id: 8, name: "Cash" },
];

describe("suggestCategoryForDescription", () => {
	it("matches grocery keywords", () => {
		for (const desc of ["Tesco", "SAINSBURYS BANK ST", "aldi shop", "Co-op milk"]) {
			expect(suggestCategoryForDescription(desc, categories)?.id).toBe(3);
		}
	});

	it("matches eating out keywords", () => {
		for (const desc of ["Starbucks coffee", "Nandos", "Uber Eats order", "pub lunch"]) {
			expect(suggestCategoryForDescription(desc, categories)?.id).toBe(2);
		}
	});

	it("matches transport keywords", () => {
		for (const desc of ["TFL travel", "Uber to airport", "Shell petrol", "train ticket"]) {
			expect(suggestCategoryForDescription(desc, categories)?.id).toBe(4);
		}
	});

	it("matches bills keywords", () => {
		for (const desc of ["Council tax", "Virgin Media broadband", "Sky TV subscription"]) {
			expect(suggestCategoryForDescription(desc, categories)?.id).toBe(1);
		}
	});

	it("prefers the first (most specific) rule when several match", () => {
		// "Uber Eats" is food, not transport — eating out is listed before transport.
		expect(suggestCategoryForDescription("Uber Eats", categories)?.id).toBe(2);
		// Grocery beats eating out ("Tesco meal deal" is groceries first).
		expect(suggestCategoryForDescription("Tesco meal deal", categories)?.id).toBe(3);
	});

	it("returns null for unmatched descriptions", () => {
		for (const desc of ["mystery charge 4432", "bank transfer", ""]) {
			expect(suggestCategoryForDescription(desc, categories)).toBeNull();
		}
	});

	it("returns null when the matched category does not exist for the user", () => {
		expect(suggestCategoryForDescription("Tesco", [{ id: 9, name: "Other" }])).toBeNull();
	});

	it("matches user-created categories by name (case-insensitive)", () => {
		expect(
			suggestCategoryForDescription("Odeon tickets", [{ id: 12, name: "entertainment" }])?.id,
		).toBe(12);
	});

	it("every rule name is unique", () => {
		const names = CATEGORY_SUGGEST_RULES.map((r) => r.name.toLowerCase());
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("categoryKeyFromName", () => {
	it("slugifies display names", () => {
		expect(categoryKeyFromName("Eating Out")).toBe("eating_out");
		expect(categoryKeyFromName("  Groceries  ")).toBe("groceries");
		expect(categoryKeyFromName("Home & Garden")).toBe("home_garden");
		expect(categoryKeyFromName("Café treats")).toBe("caf_treats");
	});

	it("never returns an empty string for non-empty input", () => {
		expect(categoryKeyFromName("!!!")).not.toBe("___");
		expect(categoryKeyFromName("!!!")).toBe("");
	});
});
