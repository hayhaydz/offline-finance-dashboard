import { describe, expect, it } from "vitest";
import {
	requireString,
	optionalString,
	requirePositiveCurrency,
	requireCurrency,
	requireDateISO,
	requireEnum,
	VALID_ACCOUNT_TYPES,
	VALID_TAX_WRAPPERS,
	VALID_LIQUIDITY,
} from "$lib/server/validation";

describe("server validation helpers", () => {
	describe("requireString", () => {
		it("rejects null", () => {
			const r = requireString(null, "Name");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toBe("Name is required");
		});
		it("rejects undefined", () => {
			const r = requireString(undefined, "Name");
			expect(r.ok).toBe(false);
		});
		it("rejects empty string", () => {
			const r = requireString("", "Name");
			expect(r.ok).toBe(false);
		});
		it("rejects whitespace-only", () => {
			const r = requireString("   ", "Name");
			expect(r.ok).toBe(false);
		});
		it("trims and returns valid string", () => {
			const r = requireString("  hello  ", "Name");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("hello");
		});
		it("passes when within max length", () => {
			const r = requireString("short", "Name", 100);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("short");
		});
		it("enforces max length", () => {
			const r = requireString("a".repeat(101), "Name", 100);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("100");
		});
		it("passes at exact max length", () => {
			const r = requireString("a".repeat(100), "Name", 100);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("a".repeat(100));
		});
		it("works without max length", () => {
			const r = requireString("anything goes", "Name");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("anything goes");
		});
	});

	describe("optionalString", () => {
		it("returns empty for null", () => {
			const r = optionalString(null, "Institution", 100);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("");
		});
		it("returns empty for empty string", () => {
			const r = optionalString("", "Institution", 100);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("");
		});
		it("returns empty for whitespace-only", () => {
			const r = optionalString("   ", "Institution", 100);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("");
		});
		it("trims and returns valid string", () => {
			const r = optionalString("  Bank  ", "Institution", 100);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("Bank");
		});
		it("enforces max length", () => {
			const r = optionalString("a".repeat(101), "Institution", 100);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("100");
		});
	});

	describe("requirePositiveCurrency", () => {
		it("rejects null", () => {
			const r = requirePositiveCurrency(null, "Amount");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toBe("Amount is required");
		});
		it("rejects empty string", () => {
			const r = requirePositiveCurrency("", "Amount");
			expect(r.ok).toBe(false);
		});
		it("rejects zero", () => {
			const r = requirePositiveCurrency("0", "Amount");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("greater than zero");
		});
		it("parses valid currency with decimals", () => {
			const r = requirePositiveCurrency("100.50", "Amount");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.valueInCents).toBe(10050);
		});
		it("parses valid currency as integer", () => {
			const r = requirePositiveCurrency("10000", "Amount");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.valueInCents).toBe(1000000);
		});
		it("rejects invalid format", () => {
			const r = requirePositiveCurrency("abc", "Amount");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("10000.00");
		});
		it("rejects negative values", () => {
			// parseCurrency itself rejects negatives, but just in case
			const r = requirePositiveCurrency("-50", "Amount");
			expect(r.ok).toBe(false);
		});
	});

	describe("requireCurrency", () => {
		it("rejects null", () => {
			const r = requireCurrency(null, "Balance");
			expect(r.ok).toBe(false);
		});
		it("allows zero", () => {
			const r = requireCurrency("0", "Balance");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.valueInCents).toBe(0);
		});
		it("parses valid currency", () => {
			const r = requireCurrency("123.45", "Balance");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.valueInCents).toBe(12345);
		});
		it("rejects invalid format", () => {
			const r = requireCurrency("not-money", "Balance");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("123.45");
		});
	});

	describe("requireDateISO", () => {
		it("rejects null", () => {
			const r = requireDateISO(null);
			expect(r.ok).toBe(false);
		});
		it("rejects bad format (DD-MM-YYYY)", () => {
			const r = requireDateISO("13-01-2024", "Date");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("YYYY-MM-DD");
		});
		it("rejects bad format (MM/DD/YYYY)", () => {
			const r = requireDateISO("01/15/2024", "Date");
			expect(r.ok).toBe(false);
		});
		it("rejects empty string", () => {
			const r = requireDateISO("", "Date");
			expect(r.ok).toBe(false);
		});
		it("parses valid date", () => {
			const r = requireDateISO("2024-01-15");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.date.toISOString()).toContain("2024-01-15");
		});
		it("uses custom field name in error", () => {
			const r = requireDateISO("bad", "Transaction date");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("transaction date");
		});
	});

	describe("requireEnum", () => {
		it("rejects null", () => {
			const r = requireEnum(null, VALID_ACCOUNT_TYPES, "Account type");
			expect(r.ok).toBe(false);
		});
		it("rejects invalid value", () => {
			const r = requireEnum("invalid", VALID_ACCOUNT_TYPES, "Account type");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toContain("account type");
		});
		it("accepts valid value", () => {
			const r = requireEnum("savings", VALID_ACCOUNT_TYPES, "Account type");
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe("savings");
		});
		it("accepts all valid account types", () => {
			for (const t of VALID_ACCOUNT_TYPES) {
				const r = requireEnum(t, VALID_ACCOUNT_TYPES, "Account type");
				expect(r.ok).toBe(true);
			}
		});
		it("accepts all valid tax wrappers", () => {
			for (const t of VALID_TAX_WRAPPERS) {
				const r = requireEnum(t, VALID_TAX_WRAPPERS, "Tax wrapper");
				expect(r.ok).toBe(true);
			}
		});
		it("accepts all valid liquidity options", () => {
			for (const l of VALID_LIQUIDITY) {
				const r = requireEnum(l, VALID_LIQUIDITY, "Liquidity");
				expect(r.ok).toBe(true);
			}
		});
		it("is case-sensitive", () => {
			const r = requireEnum("Savings", VALID_ACCOUNT_TYPES, "Account type");
			expect(r.ok).toBe(false);
		});
	});
});
