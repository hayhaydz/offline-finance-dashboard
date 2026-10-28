import { describe, expect, it } from "vitest";
import {
	PALETTE_COMMANDS,
	currentMonthSlug,
	dynamicPaletteCommands,
	filterCommands,
} from "$lib/utils/command-palette";

describe("command palette registry (#19)", () => {
	it("every command has a unique id and non-empty label/href/section", () => {
		const ids = PALETTE_COMMANDS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const c of PALETTE_COMMANDS) {
			expect(c.label.trim()).toBeTruthy();
			expect(c.href.startsWith("/")).toBe(true);
			expect(c.section.trim()).toBeTruthy();
		}
	});

	it("dynamic commands target the current and provided month", () => {
		expect(currentMonthSlug(new Date("2026-10-15T10:00:00Z"))).toBe("2026-10");
		expect(currentMonthSlug(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
		const dyn = dynamicPaletteCommands(new Date("2026-10-15T10:00:00Z"));
		expect(dyn.map((c) => c.href)).toContain("/overview/budgets/2026-10");
		expect(dyn.map((c) => c.href)).toContain(
			"/overview/budgets/2026-10/uncategorised",
		);
	});
});

describe("filterCommands", () => {
	const all = [...dynamicPaletteCommands(new Date("2026-10-15T10:00:00Z")), ...PALETTE_COMMANDS];

	it("blank query returns everything in registry order", () => {
		const out = filterCommands(all, "   ");
		expect(out.length).toBe(all.length);
		expect(out[0].id).toBe("budget-current");
	});

	it("matches labels case-insensitively", () => {
		expect(filterCommands(all, "isa").map((c) => c.id)).toContain("accounts-isa");
		expect(filterCommands(all, "GOALS").map((c) => c.id)).toContain("goals");
	});

	it("matches keywords, not just labels", () => {
		const ids = filterCommands(all, "triage").map((c) => c.id);
		expect(ids).toContain("budget-triage");
	});

	it("no matches yields an empty list", () => {
		expect(filterCommands(all, "zzz-unknown")).toEqual([]);
	});
});
