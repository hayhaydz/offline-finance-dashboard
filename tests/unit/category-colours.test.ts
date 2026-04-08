import { describe, expect, it } from "vitest";
import {
	DEFAULT_CATEGORY_PALETTE,
	DEFAULT_CATEGORIES,
	isValidHexColour,
} from "$lib/utils/category-colours";

describe("category-colours", () => {
	describe("isValidHexColour", () => {
		it("accepts valid 6-digit hex", () => {
			expect(isValidHexColour("#3B82F6")).toBe(true);
			expect(isValidHexColour("#000000")).toBe(true);
			expect(isValidHexColour("#ffffff")).toBe(true);
		});

		it("rejects invalid formats", () => {
			expect(isValidHexColour("3B82F6")).toBe(false);
			expect(isValidHexColour("#123")).toBe(false);
			expect(isValidHexColour("#GGGGGG")).toBe(false);
			expect(isValidHexColour("")).toBe(false);
		});
	});

	describe("DEFAULT_CATEGORY_PALETTE", () => {
		it("contains 10 colours", () => {
			expect(DEFAULT_CATEGORY_PALETTE).toHaveLength(10);
		});

		it("all entries are valid hex", () => {
			for (const colour of DEFAULT_CATEGORY_PALETTE) {
				expect(isValidHexColour(colour)).toBe(true);
			}
		});
	});

	describe("DEFAULT_CATEGORIES", () => {
		it("has 10 entries matching Monzo set", () => {
			expect(DEFAULT_CATEGORIES).toHaveLength(10);
		});

		it("each entry has name, key, and valid colour", () => {
			for (const cat of DEFAULT_CATEGORIES) {
				expect(cat.name).toBeTruthy();
				expect(cat.key).toMatch(/^[a-z_]+$/);
				expect(isValidHexColour(cat.colour)).toBe(true);
			}
		});

		it("keys are unique", () => {
			const keys = DEFAULT_CATEGORIES.map((c) => c.key);
			expect(new Set(keys).size).toBe(keys.length);
		});
	});
});
