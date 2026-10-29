import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

// client-only kit runtime — stubbed for SSR rendering of the route component
vi.mock("$app/navigation", () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock("$app/state", () => ({
	page: { url: new URL("http://test.local/overview/snapshots") },
}));

import SnapshotsPage from "../../src/routes/overview/snapshots/+page.svelte";

// Phase 9 cycle 7: snapshots list carries the j/k list-nav wiring
// (use:listnav tbody + data-nav-row rows + data-nav-primary detail
// links). use:listnav and the keyboard behaviour are client-only —
// covered by list-nav unit tests + the live browser verification in
// ULTIMATE-PROGRESS.md; SSR pins the markup markers the action queries.

const data = {
	environment: { mode: "development", isProduction: false, hasEncryption: true },
	user: { id: 1, username: "admin", createdAt: new Date("2026-01-01"), inactivityTimeout: 240 },
	snapshots: [
		{
			slug: "aaa",
			snapshotDate: "2026-10-01",
			netWorthInCents: -704075,
			totalAssetsInCents: 0,
			totalLiabilitiesInCents: 704075,
		},
		{
			slug: "bbb",
			snapshotDate: "2026-09-01",
			netWorthInCents: -600000,
			totalAssetsInCents: 0,
			totalLiabilitiesInCents: 600000,
		},
	],
	page: 1,
	totalPages: 1,
	staleness: null,
};

describe("snapshots list-nav wiring", () => {
	it("renders rows as data-nav-row with data-nav-primary detail links", () => {
		const { body } = render(SnapshotsPage, { props: { data } });
		expect((body.match(/data-nav-row/g) ?? []).length).toBe(2);
		expect((body.match(/data-nav-primary/g) ?? []).length).toBe(2);
		expect(body).toContain('href="/overview/snapshots/aaa"');
		expect(body).toContain('href="/overview/snapshots/bbb"');
	});
});
