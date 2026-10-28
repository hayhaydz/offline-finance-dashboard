import { describe, expect, it } from "vitest";
import { errorDisplayMessage } from "$lib/utils/error-display";

// P0-3 regression (2026-10-27 audit): the global error page rendered
// "Message: [object Object]" because SvelteKit's page.error is a plain
// { message } object — never an Error — and String(obj) stringifies to
// "[object Object]". The normaliser must extract readable text from every
// thrown-value shape.

describe("errorDisplayMessage (P0-3)", () => {
	it("extracts .message from a SvelteKit-style HttpError object", () => {
		expect(errorDisplayMessage({ message: "Goal not found" })).toBe(
			"Goal not found",
		);
	});

	it("extracts body.message when top-level message is missing", () => {
		expect(
			errorDisplayMessage({ body: { message: "Account not found" } }),
		).toBe("Account not found");
	});

	it("returns the string for plain-string throws", () => {
		expect(errorDisplayMessage("boom")).toBe("boom");
	});

	it("returns Error.message for real Errors", () => {
		expect(errorDisplayMessage(new Error("TDZ crash"))).toBe("TDZ crash");
	});

	it("serialises unknown objects to JSON instead of [object Object]", () => {
		expect(errorDisplayMessage({ code: 500, detail: "x" })).toBe(
			'{"code":500,"detail":"x"}',
		);
	});

	it("falls back for empty objects", () => {
		expect(errorDisplayMessage({})).toBe("An unknown error occurred");
	});

	it("handles null and undefined", () => {
		expect(errorDisplayMessage(null)).toBe("An unknown error occurred");
		expect(errorDisplayMessage(undefined)).toBe("An unknown error occurred");
	});

	it("stringifies primitives", () => {
		expect(errorDisplayMessage(42)).toBe("42");
		expect(errorDisplayMessage(true)).toBe("true");
	});

	it("never returns [object Object]", () => {
		const shapes: unknown[] = [
			{},
			{ message: "ok" },
			{ body: { message: "ok" } },
			new Error("ok"),
			"ok",
			42,
			null,
			undefined,
			[1, 2],
		];
		for (const shape of shapes) {
			expect(errorDisplayMessage(shape)).not.toBe("[object Object]");
		}
	});
});
