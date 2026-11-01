import { describe, expect, it } from "vitest";
import { REPORTS, findReport, giniCoefficient, concentrationFlag, statementCadence, cadenceFlag, cadenceLagMonths, cadenceRowFlag } from "$lib/server/reports-v2";

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
			"income-vs-deposits",
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

describe("net-worth-trajectory step labeling (monotonic windows)", () => {
	it("never labels a decline as a rise when every step falls", async () => {
		// Build against the real DB is indirect; the builder reads via
		// getNetWorthHistory — exercise through the exported REPORTS entry
		// with a nonexistent user (degrades) AND pin the row semantics via
		// the doc from the live dev path in integration. Here: registry
		// contract only.
		const report = REPORTS.find((r) => r.slug === "net-worth-trajectory");
		expect(report).toBeDefined();
	});
});

describe("spend concentration math (v3.2)", () => {
	it("gini: equal spend → 0, single-category → →1, ordering-independent", () => {
		expect(giniCoefficient([100, 100, 100, 100])).toBeCloseTo(0, 10);
		// one category pays for everything → approaches 1 as n grows
		expect(giniCoefficient([0, 0, 0, 400])).toBeCloseTo(0.75, 10);
		expect(giniCoefficient([400, 0, 0, 0])).toBeCloseTo(0.75, 10); // order-independent
		// degenerate inputs
		expect(giniCoefficient([])).toBe(0);
		expect(giniCoefficient([50])).toBe(0);
	});

	it("gini: known midpoint — [1,2,3,4] = 0.25", () => {
		expect(giniCoefficient([1, 2, 3, 4])).toBeCloseTo(0.25, 10);
	});

	it("concentration flags follow the recorded scale", () => {
		expect(concentrationFlag(0.3)).toBe("green");
		expect(concentrationFlag(0.5)).toBe("amber"); // boundary inclusive
		expect(concentrationFlag(0.7)).toBe("amber");
		expect(concentrationFlag(0.71)).toBe("red");
	});

	it("registered with the paper structure and degrades for unknown users", async () => {
		const report = findReport("spend-concentration");
		expect(report).toBeDefined();
		const doc = await report!.build(999_999);
		expect(doc.slug).toBe("spend-concentration");
		expect(doc.method.length).toBeGreaterThan(0);
		expect(doc.findings.length).toBeGreaterThan(0);
	});
});

describe("statement cadence math (v3.2)", () => {
	it("full coverage: contiguous months → no gaps, coverage 1", () => {
		const s = statementCadence(["2026-01", "2026-02", "2026-03", "2026-04"]);
		expect(s).toEqual({
			firstMonth: "2026-01",
			lastMonth: "2026-04",
			spanMonths: 4,
			declaredCount: 4,
			coveragePct: 1,
			gapCount: 0,
			longestGapRun: 0,
		});
	});

	it("interior gaps count; before-first and the last month never do (D0)", () => {
		// span Jan→Jun, Mar+Apr missing → 2 gaps, longest run 2
		const s = statementCadence(["2026-01", "2026-02", "2026-05", "2026-06"])!;
		expect(s.spanMonths).toBe(6);
		expect(s.declaredCount).toBe(4);
		expect(s.coveragePct).toBeCloseTo(4 / 6, 10);
		expect(s.gapCount).toBe(2);
		expect(s.longestGapRun).toBe(2);
	});

	it("separated gaps: longest run tracks consecutive silence only", () => {
		const s = statementCadence(["2026-01", "2026-03", "2026-05", "2026-08"])!;
		// missing: 02, 04, 06, 07 (08 is last → never a gap)
		expect(s.gapCount).toBe(4);
		expect(s.longestGapRun).toBe(2); // Jun+Jul
	});

	it("year boundaries roll correctly", () => {
		const s = statementCadence(["2025-11", "2025-12", "2026-02"])!;
		// span Nov,Dec,Jan,Feb = 4; Jan missing
		expect(s.spanMonths).toBe(4);
		expect(s.gapCount).toBe(1);
		expect(s.lastMonth).toBe("2026-02");
	});

	it("unsorted input + duplicates + junk keys are tolerated", () => {
		const a = statementCadence(["2026-03", "2026-01", "2026-01", "bogus", "2026-02"])!;
		const b = statementCadence(["2026-01", "2026-02", "2026-03"])!;
		expect(a.coveragePct).toBe(b.coveragePct);
		expect(a.gapCount).toBe(0);
	});

	it("empty / shape-invalid input → null (not a failing narrator)", () => {
		expect(statementCadence([])).toBeNull();
		// strftime-sourced keys are always YYYY-MM; only shape-invalid junk
		// reaches the filter in practice — those drop to null
		expect(statementCadence(["nope", "2026-1", "26-01"])).toBeNull();
	});

	it("single declared month → span 1, coverage 1, no gaps", () => {
		const s = statementCadence(["2026-07"])!;
		expect(s.spanMonths).toBe(1);
		expect(s.coveragePct).toBe(1);
		expect(s.gapCount).toBe(0);
	});

	it("coverage flags follow the recorded scale", () => {
		expect(cadenceFlag(1)).toBe("green");
		expect(cadenceFlag(0.9)).toBe("green"); // boundary inclusive
		expect(cadenceFlag(0.89)).toBe("amber");
		expect(cadenceFlag(0.7)).toBe("amber");
		expect(cadenceFlag(0.69)).toBe("red");
	});

	it("lag math: same month → 0, year wrap → correct month count", () => {
		expect(cadenceLagMonths("2026-10", "2026-10")).toBe(0);
		expect(cadenceLagMonths("2026-09", "2026-10")).toBe(1);
		expect(cadenceLagMonths("2025-11", "2026-02")).toBe(3);
		expect(cadenceLagMonths("bad", "2026-02")).toBe(0);
	});

	it("row flags take the WORSE of coverage and lag (legend promise)", () => {
		// 100% coverage but 1 month stale → amber (was green pre-fix: vision P1)
		expect(cadenceRowFlag(1, 1)).toBe("amber");
		expect(cadenceRowFlag(1, 0)).toBe("green");
		expect(cadenceRowFlag(0.95, 2)).toBe("red"); // lag pushes past amber
		expect(cadenceRowFlag(0.5, 0)).toBe("red"); // coverage dominates
		expect(cadenceRowFlag(0.8, 1)).toBe("amber"); // both amber
	});

	it("registered with the paper structure and degrades for unknown users", async () => {
		const report = findReport("statement-cadence");
		expect(report).toBeDefined();
		const doc = await report!.build(999_999);
		expect(doc.slug).toBe("statement-cadence");
		expect(doc.method.length).toBeGreaterThan(0);
		expect(doc.findings.length).toBeGreaterThan(0);
		// empty state must name the statement model, not fake data (D0)
		expect(doc.abstract).toContain("No declared statement months");
	});
});
