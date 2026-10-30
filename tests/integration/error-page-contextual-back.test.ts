// tests/integration/error-page-contextual-back.test.ts
//
// v3 sweep 9 (R-H12 follow-on): registry 404s offer a contextual way
// back ([All Tools] / [All Reports] / [All Snapshots]) in addition to
// the generic reload/home escapes.

import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import ErrorPage from "../../src/routes/+error.svelte";

vi.mock("$app/state", () => ({
	page: {
		url: { pathname: "/tools/stooze-calculator", href: "http://localhost/tools/stooze-calculator" },
		error: { message: "No such tool" },
	},
}));

describe("error page contextual back-links", () => {
	it("offers [All Tools] on a bad tool slug", () => {
		const { body } = render(ErrorPage);
		expect(body).toContain("ERROR");
		expect(body).toContain("No such tool");
		expect(body).toContain('href="/tools"');
		expect(body).toContain("All Tools");
		expect(body).toContain("Reload Page");
		expect(body).toContain("Go Home");
	});
});
