import { describe, it, expect } from "vitest";
import { formatCents } from "./formatting";

describe("formatCents", () => {
	it("formats pence value to pounds string", () => {
		expect(formatCents(12345)).toBe("£123.45");
	});

	it("formats zero correctly", () => {
		expect(formatCents(0)).toBe("£0");
	});

	it("handles negative values", () => {
		expect(formatCents(-5000)).toBe("£-50");
	});

	it("inserts thousand separators for large numbers", () => {
		expect(formatCents(100000)).toBe("£1,000");
	});

	it("formats sub-pound values correctly", () => {
		expect(formatCents(99)).toBe("£0.99");
	});

	it("formats exact pound values without decimals", () => {
		expect(formatCents(100)).toBe("£1");
	});
});
