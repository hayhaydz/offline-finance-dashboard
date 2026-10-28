import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

// goto is client-only — stub the kit runtime for SSR rendering
vi.mock("$app/navigation", () => ({
	goto: vi.fn().mockResolvedValue(undefined),
}));

import CommandPalette from "$lib/components/CommandPalette.svelte";

// Proposal #19 (2026-10-27 audit): ⌘K command palette — jump-to navigation
// with type-to-filter. SSR proof of the list + a11y wiring (keyboard
// behaviour is declarative on svelte:window; live click-through blocked by
// the client session-timer bug — see ULTIMATE-PROGRESS notes 2026-10-28).

const renderPalette = (open = true) =>
	render(CommandPalette, { props: { open } });

describe("CommandPalette (#19)", () => {
	it("renders the search input, listbox, and key hints when open", () => {
		const { body } = renderPalette();
		expect(body).toContain('aria-label="Command palette search"');
		expect(body).toContain('role="listbox"');
		expect(body).toContain("[⌘K] toggle");
		expect(body).toContain("[enter] open");
	});

	it("lists navigate commands plus dynamic current-month jumps", () => {
		const { body } = renderPalette();
		expect(body).toContain("Budget —");
		expect(body).toContain("Uncategorised —");
		expect(body).toContain("Accounts");
		expect(body).toContain("Liabilities");
	});

	it("renders nothing when closed", () => {
		const { body } = renderPalette(false);
		expect(body).not.toContain('role="listbox"');
		expect(body).not.toContain("Command palette search");
	});
});
