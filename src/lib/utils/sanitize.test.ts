import { describe, it, expect } from "vitest";
import { sanitizeNoteContent } from "./sanitize";

describe("sanitizeNoteContent", () => {
	it("strips script tags", () => {
		expect(sanitizeNoteContent('<script>alert("xss")</script>')).toBe("");
	});

	it("strips img onerror payloads", () => {
		expect(sanitizeNoteContent('<img src=x onerror=alert(1)>')).toBe("");
	});

	it("strips javascript: protocol links but keeps text", () => {
		expect(sanitizeNoteContent('<a href="javascript:alert(1)">click</a>')).toBe(
			"click",
		);
	});

	it("strips HTML tags but preserves text content", () => {
		expect(sanitizeNoteContent("Hello <b>world</b>")).toBe("Hello world");
	});

	it("preserves plain text unchanged", () => {
		expect(sanitizeNoteContent("Normal text")).toBe("Normal text");
	});

	it("strips script tags while preserving surrounding text", () => {
		expect(
			sanitizeNoteContent('<script>steal()</script>safe text'),
		).toBe("safe text");
	});

	it("handles event handler attributes", () => {
		expect(
			sanitizeNoteContent('<div onmouseover="alert(1)">hover me</div>'),
		).toBe("hover me");
	});

	it("preserves special characters that are not HTML", () => {
		expect(sanitizeNoteContent("Price: £1,000 & 50% off < deal")).toBe(
			"Price: £1,000 & 50% off < deal",
		);
	});
});
