import { describe, expect, it } from "vitest";
import { REPORTS, findReport } from "$lib/server/reports-v2";

// v3 B07 (R10): the report registry is well-formed — unique slugs, real
// blurbs and builders — and every report builds against a throwaway user
// id without touching anything (pure reads).

describe("reports-v2 registry", () => {
	it("has unique slugs with titles and blurbs", () => {
		const slugs = REPORTS.map((r) => r.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const report of REPORTS) {
			expect(report.slug).toMatch(/^[a-z-]+$/);
			expect(report.title.length).toBeGreaterThan(4);
			expect(report.blurb.length).toBeGreaterThan(8);
			expect(typeof report.build).toBe("function");
		}
	});

	it("covers the core questions", () => {
		for (const slug of [
			"net-worth-trajectory",
			"savings-rate",
			"interest-vs-allowance",
			"credit-strategy",
			"spending-profile",
			"debt-horizon",
		]) {
			expect(REPORTS.some((r) => r.slug === slug)).toBe(true);
		}
		expect(findReport("nope")).toBeUndefined();
	});

	it("every report builds a document with abstract, method and findings", async () => {
		// User 999999 does not exist — builders must degrade to their
		// empty-data paths, not throw.
		for (const report of REPORTS) {
			const doc = await report.build(999_999);
			expect(doc.slug).toBe(report.slug);
			expect(doc.abstract.length).toBeGreaterThan(10);
			expect(doc.method.length).toBeGreaterThan(0);
			expect(doc.findings.length).toBeGreaterThan(0);
			expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});
});
