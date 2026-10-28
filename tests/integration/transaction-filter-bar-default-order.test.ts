import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

// useUrlPagination reads $app/state page.url — unavailable outside a real
// kit request; stub it to page 0 so the sort pipeline is exercised directly.
vi.mock("$lib/utils/use-url-pagination.svelte", () => ({
	useUrlPagination: () => ({ page: 0, totalPages: 1 }),
}));

import TransactionFilterBar from "$lib/components/TransactionFilterBar.svelte";

// P1-6 regression (2026-10-27 audit): ISA subscription + interest record
// tables opened OLDEST-first while the toggle read "[Newest First]".
// Default is now newest-first; the label names the action clicking performs.

const mkTx = (date: string, id: number) => ({
	id,
	accountId: id,
	type: "deposit",
	amount: 50000,
	transactionDate: new Date(`${date}T00:00:00Z`),
});

// oldest → newest
const transactions = [
	mkTx("2026-04-30", 1),
	mkTx("2026-07-29", 2),
	mkTx("2026-10-01", 3),
];

describe("TransactionFilterBar default order (P1-6)", () => {
	// NOTE: row order itself is verified live (see ULTIMATE-PROGRESS ev line)
	// — Svelte 5 SSR `render()` doesn't invoke raw test functions passed as
	// snippet props, so the capture approach can't work here. The label
	// below is deterministic on the default: transactionsSortDesc=true ⇒
	// "[Oldest First]" (the switch action); the old default (false) rendered
	// "[Newest First]" and fails this test.
	it("labels the toggle with the switch action ([Oldest First] when desc)", () => {
		const { body } = render(TransactionFilterBar, {
			props: {
				transactions,
				typeFilter: (tx: { type: string }) => tx.type === "deposit",
				perPage: 25,
				byAccount: [{ accountId: 1, accountName: "ISA Saver" }],
				title: "Tax Year Subscription Record",
				emptyMessage: "none",
				technicalNote: "note",
				children: ((renderer: { push: (s: string) => void }) => {
					renderer.push("");
				}) as never,
			},
		});
		expect(body).toContain("Oldest First");
		expect(body).not.toContain("[Newest First]");
	});
});
