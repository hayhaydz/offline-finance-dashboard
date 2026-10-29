import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ExportPanel from "$lib/components/export-panel/export-panel.svelte";

// v3 R18: the export panel lists every open account WITH its own context
// (type, row count, coverage window) so export selection is informed, and
// composes the /api/transactions/export query URL from the selection.

const accounts = [
	{
		id: 1,
		slug: "slugCurrent01",
		name: "Monzo Current",
		type: "current",
		txCount: 412,
		firstDate: "2024-11-02",
		lastDate: "2026-10-28",
	},
	{
		id: 2,
		slug: "slugVisa0000001",
		name: "Visa Gold",
		type: "credit_card",
		txCount: 87,
		firstDate: "2025-06-01",
		lastDate: "2026-10-27",
	},
	{
		id: 3,
		slug: "slugEmpty00001",
		name: "Empty Saver",
		type: "savings",
		txCount: 0,
		firstDate: null,
		lastDate: null,
	},
];

describe("ExportPanel (R18 selection + context)", () => {
	it("renders every account with per-account context (type, rows, coverage)", () => {
		const { body } = render(ExportPanel, { props: { accounts } });
		expect(body).toContain("Monzo Current");
		expect(body).toContain("current");
		expect(body).toContain("412");
		expect(body).toContain("2024-11-02 → 2026-10-28");
		expect(body).toContain("no transactions"); // Empty Saver
		expect(body).toContain("Select all accounts");
	});

	it("defaults to the all-accounts export URL with no query params", () => {
		const { body } = render(ExportPanel, { props: { accounts } });
		const href = body.match(/href="(\/api\/transactions\/export[^"]*)"/);
		expect(href?.[1]).toBe("/api/transactions/export");
		expect(body).toContain("all open accounts · 499 rows");
	});

	it("offers every transaction type in the filter", () => {
		const { body } = render(ExportPanel, { props: { accounts } });
		for (const t of ["deposit", "charge", "interest_charge", "refund"]) {
			expect(body).toContain(`<option value="${t}">${t}</option>`);
		}
	});
});
