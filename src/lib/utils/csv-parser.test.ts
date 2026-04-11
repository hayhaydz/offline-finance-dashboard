import { describe, expect, it } from "vitest";
import { parseCSV, VALID_TRANSACTION_TYPES } from "./csv-parser";

const MINIMAL_CSV = `date,type,amount,description
2026-01-15,deposit,150.00,Salary payment
2026-01-20,withdrawal,-45.60,Coffee shop`;

const FULL_CSV = `date,type,amount,description,category
2026-01-15,deposit,150.00,Salary payment,income
2026-01-20,withdrawal,-45.60,Coffee shop,food
2026-02-01,interest,2.50,Monthly interest,income`;

describe("parseCSV", () => {
	it("should parse a valid minimal CSV with 4 columns", () => {
		const result = parseCSV(MINIMAL_CSV);

		expect(result.errors).toHaveLength(0);
		expect(result.valid).toHaveLength(2);
		expect(result.totalRows).toBe(2);

		expect(result.valid[0]).toEqual({
			date: "2026-01-15",
			type: "deposit",
			amount: 150,
			description: "Salary payment",
			rowIndex: 1,
		});
		expect(result.valid[1]).toEqual({
			date: "2026-01-20",
			type: "withdrawal",
			amount: -45.6,
			description: "Coffee shop",
			rowIndex: 2,
		});
	});

	it("should parse a valid CSV with category column", () => {
		const result = parseCSV(FULL_CSV);

		expect(result.errors).toHaveLength(0);
		expect(result.valid).toHaveLength(3);
		expect(result.totalRows).toBe(3);

		expect(result.valid[0].category).toBe("income");
		expect(result.valid[1].category).toBe("food");
		// Minimal CSV rows should NOT have category
		expect(parseCSV(MINIMAL_CSV).valid[0].category).toBeUndefined();
	});

	it("should accept all 13 valid transaction types", () => {
		const dataRows = VALID_TRANSACTION_TYPES.map(
			(t) => `2026-01-15,${t},100.00,Test entry`,
		);
		const csv = `date,type,amount,description\n${dataRows.join("\n")}`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(0);
		expect(result.valid).toHaveLength(13);
		expect(result.valid.map((r) => r.type)).toEqual([
			...VALID_TRANSACTION_TYPES,
		]);
	});

	it("should reject an invalid transaction type", () => {
		const csv = `date,type,amount,description
2026-01-15,credit,100.00,Bad type`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].column).toBe("type");
		expect(result.errors[0].message).toContain("credit");
	});

	it("should reject a non-ISO date format", () => {
		const csv = `date,type,amount,description
04/01/2026,deposit,100.00,Bad date`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].column).toBe("date");
		expect(result.errors[0].message).toContain("YYYY-MM-DD");
	});

	it("should reject a non-numeric amount", () => {
		const csv = `date,type,amount,description
2026-01-15,deposit,abc,Bad amount`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].column).toBe("amount");
	});

	it("should reject CSV with no data rows (header only)", () => {
		const csv = `date,type,amount,description`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message.toLowerCase()).toContain("no data");
	});

	it("should reject CSV with incorrect header", () => {
		const csv = `date,amount,type,description
2026-01-15,deposit,100.00,Test`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].column).toBe("header");
	});

	it("should handle mixed valid and invalid rows", () => {
		const csv = `date,type,amount,description
2026-01-15,deposit,100.00,Valid row
2026-01-20,credit,abc,Bad type and amount
2026-02-01,withdrawal,-50.00,Another valid`;
		const result = parseCSV(csv);

		expect(result.valid).toHaveLength(2);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].row).toBe(2);
		expect(result.totalRows).toBe(3);
	});

	it("should handle quoted fields with commas", () => {
		const csv = `date,type,amount,description
2026-01-15,deposit,100.00,"Salary, monthly payment"`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(0);
		expect(result.valid[0].description).toBe("Salary, monthly payment");
	});

	it("should reject description over 500 characters", () => {
		const longDesc = "x".repeat(501);
		const csv = `date,type,amount,description
2026-01-15,deposit,100.00,${longDesc}`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].column).toBe("description");
		expect(result.errors[0].message).toContain("500");
	});

	it("should allow future dates", () => {
		const csv = `date,type,amount,description
2099-12-31,deposit,100.00,Future transaction`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(0);
		expect(result.valid[0].date).toBe("2099-12-31");
	});

	it("should skip comment lines starting with #", () => {
		const csv = `# This is a comment line
# Template version 1.0
date,type,amount,description
2026-01-15,deposit,100.00,First entry
# Another comment in between rows
2026-02-01,withdrawal,-50.00,Second entry`;
		const result = parseCSV(csv);

		expect(result.errors).toHaveLength(0);
		expect(result.valid).toHaveLength(2);
		expect(result.totalRows).toBe(2);
		expect(result.valid[0].rowIndex).toBe(1);
	});
});
