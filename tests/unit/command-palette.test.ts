import { describe, expect, it } from "vitest";
import {
	PALETTE_COMMANDS,
	currentMonthSlug,
	dynamicPaletteCommands,
	filterCommands,
	PALETTE_ACTIONS,
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

describe("palette quick actions (#19 completion)", () => {
	it("ships the toggle-ascii and open-help actions in the Action section", () => {
		expect(PALETTE_ACTIONS.map((a) => a.action)).toEqual([
			"toggle-ascii",
			"open-help",
		]);
		expect(PALETTE_ACTIONS.every((a) => a.section === "Action")).toBe(true);
	});

	it("actions are discoverable by their keywords", () => {
		const ids = filterCommands(PALETTE_ACTIONS, "ascii").map((c) => c.id);
		expect(ids).toEqual(["action-ascii"]);
		expect(filterCommands(PALETTE_ACTIONS, "shortcuts").map((c) => c.id)).toContain(
			"action-help",
		);
	});

	it("actions carry no duplicate ids vs the navigation registry", () => {
		const all = [
			...dynamicPaletteCommands(),
			...PALETTE_COMMANDS,
			...PALETTE_ACTIONS,
		];
		expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
	});
});

describe("palette route coverage (Phase 9 drift guard)", () => {
	it("every key app route is reachable from the palette", () => {
		const hrefs = new Set(
			[...dynamicPaletteCommands(), ...PALETTE_COMMANDS].map((c) => c.href),
		);
		const expected = [
			"/",
			"/accounts",
			"/accounts/create",
			"/accounts/interest",
			"/accounts/isa",
			"/accounts/liabilities",
			"/accounts/balances",
			"/goals",
			"/goals/create",
			"/goals/archived",
			"/overview/snapshots",
			"/overview/reports",
			"/alerts",
			"/tools",
		];
		// all real routes present
		for (const href of expected) {
			if (href === "/overview/reoutine") continue;
			expect(hrefs.has(href), `palette missing ${href}`).toBe(true);
		}
		// dynamic month routes
		const month = currentMonthSlug();
		expect(hrefs.has(`/overview/budgets/${month}`)).toBe(true);
		expect(hrefs.has(`/overview/budgets/${month}/uncategorised`)).toBe(true);
	});

	it("no duplicate ids or hrefs in the combined registry", () => {
		const all = [...dynamicPaletteCommands(), ...PALETTE_COMMANDS];
		expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
		expect(new Set(all.map((c) => c.href)).size).toBe(all.length);
	});
});
