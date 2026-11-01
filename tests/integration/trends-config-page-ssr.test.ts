import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ConfigPage from "../../src/routes/overview/trends/[month]/config/+page.svelte";

// v3.2 V4 (2026-11-01): the trends month config lives on its own page —
// amendment options (note + applies) sit at the TOP as a permanent band,
// then target/scope, category targets (expanded), filters with [X]/[ ]
// bracket submits, and the amendment log. No accordions (the page IS the
// detail, D6) and no default HTML radio/select styling anywhere.

const data = {
	selectedMonth: "2026-10",
	isCurrentMonth: false,
	budget: {
		totalTargetInCents: 200_000,
		excludedCategoryIds: [],
		excludedAccountIds: [],
		excludedTypes: [],
	},
	totalSpent: 820_000,
	categoryBreakdown: [
		{ id: 1, name: "Groceries", colour: "#68D391", spent: 45_000, target: 60_000 },
		{ id: 2, name: "Eating out", colour: "#F6AD55", spent: 210_000, target: 80_000 },
		{ id: 3, name: "Travel", colour: "#F6E05E", spent: 0, target: null },
		{ id: -1, name: "Uncategorised", colour: "#A0AEC0", spent: 30_000, target: null },
	],
	categories: [
		{ id: 1, name: "Groceries", colour: "#68D391" },
		{ id: 2, name: "Eating out", colour: "#F6AD55" },
	],
	accounts: [{ id: 9, name: "Monzo", type: "current" }],
	amendments: [
		{
			id: 1,
			field: "categoryTarget:2",
			oldValue: 50_000,
			newValue: 80_000,
			note: "birthday month",
			createdAt: "2026-10-05T10:00:00.000Z",
		},
	],
} as never;

describe("Trend config page (v3.2 V4)", () => {
	const renderPage = () =>
		render(ConfigPage, { props: { data, form: undefined as never } });

	it("renders every config surface expanded, no accordions", () => {
		const { body } = renderPage();
		expect(body).toContain("AMENDMENT OPTIONS");
		expect(body).toContain("TARGET / MO");
		expect(body).toContain("CATEGORY TARGETS");
		expect(body).toContain("FILTERS");
		expect(body).toContain("AMENDMENTS");
		// no collapsible config chrome
		expect(body).not.toContain("aria-expanded");
	});

	it("amendment options are the permanent top band with terminal toggles", () => {
		const { body } = renderPage();
		// order: the band precedes the target section
		expect(body.indexOf("AMENDMENT OPTIONS")).toBeLessThan(body.indexOf("TARGET / MO"));
		expect(body).toContain('aria-pressed="true"'); // this-month-only toggle
		expect(body).toContain("this month only");
		expect(body).toContain("this + future months");
		// no default radio/select styling anywhere
		expect(body).not.toContain('type="radio"');
		expect(body).not.toContain("<select");
	});

	it("category targets render progress + inline-edit affordances", () => {
		const { body } = renderPage();
		expect(body).toContain("WITH TARGETS");
		expect(body).toContain("WITHOUT TARGETS");
		expect(body).toContain("NO SPEND THIS MONTH");
		expect(body).toContain("Eating out");
		expect(body).toContain("£2,100.00");
	});

	it("filters use bracket [X]/[ ] submits carrying note + applies", () => {
		const { body } = renderPage();
		expect(body).toContain("[X]");
		expect(body).not.toContain('type="checkbox"');
		expect(body).toContain('action="?/toggleCategory"');
		expect(body).toContain('action="?/toggleAccount"');
		expect(body).toContain('action="?/toggleType"');
		expect(body).toContain('name="applyForward"');
	});

	it("amendment log shows field, old → new and note", () => {
		const { body } = renderPage();
		expect(body).toContain("Eating out target");
		expect(body).toContain("birthday month");
		expect(body).toContain("→");
	});

	it("links back to the month and forward to insights", () => {
		const { body } = renderPage();
		expect(body).toContain('href="/overview/trends/2026-10"');
		expect(body).toContain('href="/overview/trends/2026-10/insights"');
	});
});
