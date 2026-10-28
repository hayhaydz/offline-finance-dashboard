import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import {
	resolveListNav,
	shouldHandleListNav,
} from "$lib/utils/list-nav";
import HelpOverlay from "$lib/components/HelpOverlay.svelte";

// Phase 7: j/k list navigation + `?` help overlay — pure decision logic
// (the DOM action is a thin wrapper) + overlay render.

const ke = (key: string, overrides: Partial<KeyboardEvent> = {}) =>
	({ key, ...overrides }) as unknown as KeyboardEvent;

describe("shouldHandleListNav", () => {
	it("accepts plain keys on plain elements", () => {
		expect(shouldHandleListNav(ke("j", { target: { tagName: "TD" } as HTMLElement }))).toBe(
			true,
		);
	});

	it("rejects modifier combos", () => {
		for (const mod of ["metaKey", "ctrlKey", "altKey"] as const) {
			expect(shouldHandleListNav(ke("j", { [mod]: true }))).toBe(false);
		}
	});

	it("rejects typing contexts (inputs, textareas, selects, contenteditable)", () => {
		for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
			expect(
				shouldHandleListNav(ke("j", { target: { tagName: tag } as HTMLElement })),
			).toBe(false);
		}
		expect(
			shouldHandleListNav(
				ke("j", { target: { isContentEditable: true } as HTMLElement }),
			),
		).toBe(false);
	});
});

describe("resolveListNav", () => {
	it("j from no selection selects the first row; ArrowDown matches", () => {
		expect(resolveListNav(ke("j"), null, 5)).toEqual({ type: "move", index: 0 });
		expect(resolveListNav(ke("ArrowDown"), null, 5)).toEqual({ type: "move", index: 0 });
	});

	it("k from no selection selects the last row (bottom of long ledgers)", () => {
		expect(resolveListNav(ke("k"), null, 5)).toEqual({ type: "move", index: 4 });
	});

	it("moves clamp at both ends — no wrap", () => {
		expect(resolveListNav(ke("j"), 4, 5)).toEqual({ type: "move", index: 4 });
		expect(resolveListNav(ke("k"), 0, 5)).toEqual({ type: "move", index: 0 });
	});

	it("j/k step by one", () => {
		expect(resolveListNav(ke("j"), 1, 5)).toEqual({ type: "move", index: 2 });
		expect(resolveListNav(ke("k"), 3, 5)).toEqual({ type: "move", index: 2 });
	});

	it("Enter opens only when a row is selected; Escape clears", () => {
		expect(resolveListNav(ke("Enter"), null, 5).type).toBe("none");
		expect(resolveListNav(ke("Enter"), 2, 5)).toEqual({ type: "open" });
		expect(resolveListNav(ke("Escape"), 2, 5)).toEqual({ type: "clear" });
		expect(resolveListNav(ke("Escape"), null, 5).type).toBe("none");
	});

	it("ignores unrelated keys and empty lists", () => {
		expect(resolveListNav(ke("x"), 1, 5).type).toBe("none");
		expect(resolveListNav(ke("j"), null, 0).type).toBe("none");
	});

	it("ignores keys typed in a form field", () => {
		expect(
			resolveListNav(ke("j", { target: { tagName: "INPUT" } as HTMLElement }), null, 5).type,
		).toBe("none");
	});
});

describe("HelpOverlay (Phase 7)", () => {
	it("renders the shortcut table when open", () => {
		const { body } = render(HelpOverlay, { props: { open: true } });
		expect(body).toContain("Keyboard shortcuts");
		expect(body).toContain("j / ↓");
		expect(body).toContain("next row in the focused list");
		expect(body).toContain("⌘K");
		expect(body).toContain("[Close]");
		expect(body).toContain('role="dialog"');
	});

	it("renders nothing when closed", () => {
		const { body } = render(HelpOverlay, { props: { open: false } });
		expect(body).not.toContain("Keyboard shortcuts");
	});
});
