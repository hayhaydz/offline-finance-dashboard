// tests/integration/error-page-contextual-back.test.ts
//
// v3 sweep 9 (R-H12 follow-on): registry 404s offer a contextual way
// back ([All Tools] / [All Reports] / [All Snapshots]) in addition to
// the generic reload/home escapes.
//
// v3.2 sweep 29: status-aware copy — 404s render an honest
// "404 — NOT FOUND" headline instead of "unexpected error", and the
// page is a boxed panel (D9).

import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import ErrorPage from "../../src/routes/+error.svelte";

const mockPage = vi.hoisted(() => ({
	url: { pathname: "/tools/stooze-calculator", href: "http://localhost/tools/stooze-calculator" },
	error: { message: "No such tool" },
	status: 500 as number | undefined,
}));

vi.mock("$app/state", () => ({
	page: mockPage,
}));

describe("error page contextual back-links", () => {
	it("offers [All Tools] on a bad tool slug", () => {
		mockPage.status = 500;
		const { body } = render(ErrorPage);
		expect(body).toContain("ERROR");
		expect(body).toContain("No such tool");
		expect(body).toContain('href="/tools"');
		expect(body).toContain("All Tools");
		expect(body).toContain("Reload Page");
		expect(body).toContain("Go Home");
	});
});

describe("error page 404 branch (sweep 29)", () => {
	it("renders an honest 404 headline for missing pages", () => {
		mockPage.status = 404;
		mockPage.url = { pathname: "/accounts/nope", href: "http://localhost/accounts/nope" };
		const { body } = render(ErrorPage);
		expect(body).toContain("404");
		expect(body).toContain("NOT FOUND");
		expect(body).toContain("does not exist");
		// contextual back now covers accounts too
		expect(body).toContain('href="/accounts"');
		expect(body).toContain("All Accounts");
		// reload is an escape for transient errors only — hidden on 404
		expect(body).not.toContain("Reload Page");
	});

	it("defaults a missing status to the generic-error branch", () => {
		mockPage.status = undefined;
		mockPage.url = { pathname: "/tools/stooze-calculator", href: "http://localhost/tools/stooze-calculator" };
		const { body } = render(ErrorPage);
		expect(body).toContain("ERROR");
		expect(body).toContain("Reload Page");
	});
});
