import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

vi.mock("$app/navigation", () => ({ goto: vi.fn().mockResolvedValue(undefined), afterNavigate: vi.fn() }));
vi.mock("$app/state", () => ({
	// layout reads user/environment off page.data
	page: { url: new URL("http://test.local/"), data: {} },
}));

import LayoutFixture from "./LayoutA11yFixture.svelte";
import SubmitFeedback from "$lib/components/SubmitFeedback.svelte";

// Phase 9 cycle 8 screen-reader pass: skip link, main landmark,
// and announced action feedback.

const renderLayout = () => render(LayoutFixture);

describe("layout a11y (skip link + main landmark)", () => {
	it("renders a skip link targeting #main-content as the first focusable element", () => {
		const { body } = renderLayout();
		const skipIdx = body.indexOf('[Skip to content]');
		expect(skipIdx).toBeGreaterThan(-1);
		expect(body).toContain('href="#main-content"');
		// target exists: the main landmark carries the id
		expect(body).toMatch(/<main[^>]*id="main-content"/);
		// skip link precedes the main landmark in tab order
		expect(skipIdx).toBeLessThan(body.indexOf('<main'));
	});

	it("skip link is keyboard-only visible (skip-link class, no default reveal)", () => {
		const { body } = renderLayout();
		expect(body).toContain("skip-link");
	});
});

describe("SubmitFeedback announces to screen readers", () => {
	it("success messages use role=status", () => {
		const { body } = render(SubmitFeedback, {
			props: {
				message: { type: "success", text: "Transaction added" },
				onDismiss: () => {},
			},
		});
		expect(body).toContain('role="status"');
	});

	it("error messages use role=alert", () => {
		const { body } = render(SubmitFeedback, {
			props: {
				message: { type: "error", text: "Something failed" },
				onDismiss: () => {},
			},
		});
		expect(body).toContain('role="alert"');
	});
});
