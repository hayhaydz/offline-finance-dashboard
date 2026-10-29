// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { captureFocus } from "./overlay-focus";

// Phase 9 a11y: overlays must return focus to their trigger on close.

describe("captureFocus", () => {
	it("restores focus to the captured element when it is still connected", () => {
		const btn = document.createElement("button");
		document.body.appendChild(btn);
		btn.focus();
		expect(document.activeElement).toBe(btn);

		const restore = captureFocus();
		// focus moves elsewhere while the overlay is open
		document.body.focus();
		restore();

		expect(document.activeElement).toBe(btn);
		btn.remove();
	});

	it("is a no-op when the captured element left the DOM", () => {
		const btn = document.createElement("button");
		document.body.appendChild(btn);
		btn.focus();
		const restore = captureFocus();
		btn.remove();
		expect(() => restore()).not.toThrow();
	});

	it("captures document.body safely (no HTMLElement activeElement edge)", () => {
		const restore = captureFocus();
		expect(() => restore()).not.toThrow();
	});
});
