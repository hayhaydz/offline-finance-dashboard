import { describe, expect, it } from "vitest";
import {
  buildAvailableTaxYears,
  deriveSelectedTaxYear,
} from "$lib/server/account-tax-year";

describe("buildAvailableTaxYears", () => {
  it("builds a map of tax year slugs from transaction dates", () => {
    const transactions = [
      { transactionDate: new Date("2025-06-15") }, // TY 2025/26
      { transactionDate: new Date("2026-01-10") }, // TY 2025/26
      { transactionDate: new Date("2026-05-01") }, // TY 2026/27
      { transactionDate: new Date("2026-04-08") }, // TY 2026/27
    ];

    const years = buildAvailableTaxYears(transactions);

    expect(years.size).toBe(2);
    // Slug format matches existing route file: `${startYear}-${endYear(2-digit)}`
    expect(years.has("2025-26")).toBe(true);
    expect(years.has("2026-27")).toBe(true);
  });

  it("returns empty map for empty transactions", () => {
    const years = buildAvailableTaxYears([]);
    expect(years.size).toBe(0);
  });
});

describe("deriveSelectedTaxYear", () => {
  it("returns current tax year when no param provided", () => {
    // On 2026-04-14, current TY is 2026/27 (starts April 6, 2026)
    const result = deriveSelectedTaxYear(undefined, new Map([
      ["2025-26", { slug: "2025-26", start: new Date("2025-04-06"), end: new Date("2026-04-05") }],
      ["2026-27", { slug: "2026-27", start: new Date("2026-04-06"), end: new Date("2027-04-05") }],
    ]));

    expect(result).toBeDefined();
    expect(result?.slug).toBe("2026-27");
  });

  it("returns the requested tax year when param is valid", () => {
    const years = new Map([
      ["2025-26", { slug: "2025-26", start: new Date("2025-04-06"), end: new Date("2026-04-05") }],
    ]);

    const result = deriveSelectedTaxYear("2025-26", years);
    expect(result?.slug).toBe("2025-26");
  });

  it("returns undefined when param is not in available years", () => {
    const result = deriveSelectedTaxYear("2020-21", new Map());
    expect(result).toBeUndefined();
  });
});
