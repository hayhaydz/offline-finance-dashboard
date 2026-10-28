import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

// The modal reads $app/state page.url (filter hydration) — stub kit runtime
vi.mock("$app/state", () => ({
	page: {
		url: new URL("http://localhost/accounts"),
	},
}));

import AccountFiltersModal from "$lib/components/AccountFiltersModal.svelte";

// Proposal #13 (2026-10-27 audit): the institution filter list gets a
// type-to-search box + per-institution account counts. SSR proof (live
// browser verification blocked by the client session-timer killing
// CDP-driven sessions — see ULTIMATE-PROGRESS notes 2026-10-28).

const institutions = ["HSBC", "Santander", "Tesco Bank", "Monzo"];
const counts = { HSBC: 3, Santander: 2, "Tesco Bank": 1, Monzo: 1 };

const renderModal = () =>
	render(AccountFiltersModal, {
		props: {
			open: true,
			onClose: () => {},
			institutions,
			institutionCounts: counts,
		},
	});

describe("AccountFiltersModal (#13)", () => {
	it("renders the type-to-search box with an accessible label", () => {
		const { body } = renderModal();
		expect(body).toContain("type to filter institutions");
		expect(body).toContain('aria-label="Filter institutions"');
	});

	it("lists every institution with its account count chip", () => {
		const { body } = renderModal();
		for (const inst of institutions) {
			expect(body).toContain(inst);
		}
		// count chips: bordered spans with just the number
		expect(body.match(/>3</g)?.length).toBeGreaterThanOrEqual(1); // HSBC
		expect(body.match(/>2</g)?.length).toBeGreaterThanOrEqual(1); // Santander
		expect(body).toContain(">1<"); // Tesco/Monzo
	});
});
