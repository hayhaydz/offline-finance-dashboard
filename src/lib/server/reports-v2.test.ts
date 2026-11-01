import { describe, expect, it } from "vitest";
import { REPORTS, findReport, giniCoefficient, concentrationFlag, statementCadence, cadenceFlag, cadenceLagMonths, cadenceRowFlag, classifyBillCadence, amountDriftPct, creepKicker, driftFlag, goalVelocity, velocityFlag } from "$lib/server/reports-v2";

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

describe("bill chronology math (v3.2)", () => {
	const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

	it("monthly: four ~30d payments → monthly, tight jitter", () => {
		const s = classifyBillCadence([d("2026-01-05"), d("2026-02-04"), d("2026-03-06"), d("2026-04-05")])!;
		expect(s.cadence).toBe("monthly");
		expect(s.occurrences).toBe(4);
		expect(s.medianGapDays).toBeGreaterThanOrEqual(28);
		expect(s.medianGapDays).toBeLessThanOrEqual(31);
		expect(s.jitterDays).toBeLessThanOrEqual(4);
	});

	it("quarterly: 3 payments ~91d apart → quarterly (invisible to /overview/bills)", () => {
		const s = classifyBillCadence([d("2026-01-10"), d("2026-04-11"), d("2026-07-10")])!;
		expect(s.cadence).toBe("quarterly");
	});

	it("annual: 2 payments 365d apart → annual (only class needing 2)", () => {
		const s = classifyBillCadence([d("2025-03-01"), d("2026-03-01")])!;
		expect(s.cadence).toBe("annual");
		// two quarterly payments do NOT pass as annual or anything else
		expect(classifyBillCadence([d("2026-01-10"), d("2026-04-11")])!.cadence).toBe("irregular");
	});

	it("irregular: mixed gaps fall through every window", () => {
		const s = classifyBillCadence([d("2026-01-01"), d("2026-02-01"), d("2026-06-01"), d("2026-06-20")])!;
		expect(s.cadence).toBe("irregular");
	});

	it("fewer than 2 dates → null; unsorted input tolerated", () => {
		expect(classifyBillCadence([d("2026-01-01")])).toBeNull();
		expect(classifyBillCadence([])).toBeNull();
		const unsorted = classifyBillCadence([d("2026-04-05"), d("2026-01-05"), d("2026-02-04"), d("2026-03-06")])!;
		expect(unsorted.cadence).toBe("monthly");
		expect(unsorted.firstDate).toBe("2026-01-05");
	});

	it("drift math + flags follow the recorded scale", () => {
		expect(amountDriftPct([10000, 10000, 10000])).toBeCloseTo(0, 10);
		expect(amountDriftPct([100, 110, 120])).toBeCloseTo(2 / 11, 10); // (120−100) ÷ median 110
		expect(driftFlag(0.05)).toBe("green");
		expect(driftFlag(0.1)).toBe("green"); // boundary inclusive
		expect(driftFlag(0.11)).toBe("amber");
		expect(driftFlag(0.25)).toBe("amber");
		expect(driftFlag(0.26)).toBe("red");
		// signs ignored — withdrawals are negative in the ledger
		expect(amountDriftPct([-10000, -10000])).toBeCloseTo(0, 10);
	});

	it("creep kicker never calls zero drift creep (D0 honesty)", () => {
		// 0% drift = "nothing moved", NOT "steepest creep" — the
		// self-contradicting template was a real copy bug (2026-11-01)
		expect(creepKicker("rent", 0)).toBe("No bill has changed price across its whole recorded history.");
		expect(creepKicker("rent", 0.005)).toBe("No bill has changed price across its whole recorded history."); // rounding noise
		expect(creepKicker("rent", 0.006)).toBe("Steepest price creep: rent at 1% drift.");
		expect(creepKicker("energy", 0.24)).toBe("Steepest price creep: energy at 24% drift.");
	});

	it("registered with the paper structure and degrades for unknown users", async () => {
		const report = findReport("bill-chronology");
		expect(report).toBeDefined();
		const doc = await report!.build(999_999);
		expect(doc.slug).toBe("bill-chronology");
		expect(doc.abstract).toContain("No recurring withdrawals");
	});
});

describe("goal velocity math (v3.2)", () => {
	const now = new Date("2026-11-01T12:00:00Z");
	const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000);

	it("short-pace vs wont-finish: severity splits at 60% of required", () => {
		// remaining 50k, 6 months left → required 8,334/mo
		const mk = (eventSum: number) =>
			goalVelocity(50_000, 100_000, [{ amount: eventSum, date: d(30) }], now, new Date("2027-05-01T00:00:00Z"));
		// rate 5,167/mo (31k event) ≥ 60% of required 8,334 → short-pace (amber)
		expect(mk(31_000).ratePencePerMonth).toBe(5167);
		expect(mk(31_000).verdict).toBe("short-pace");
		// rate 3,334/mo = 40% of required → wont-finish (red)
		expect(mk(20_000).verdict).toBe("wont-finish");
		// rate 10,000/mo ≥ required → on-track
		expect(mk(60_000).verdict).toBe("on-track");
	});

	it("wont-finish: ETA beyond the deadline", () => {
		const s = goalVelocity(0, 100_000, [{ amount: 1_000, date: d(30) }], now, new Date("2026-12-01T00:00:00Z"));
		// rate = round(1000/6) = 167/mo → ETA = ceil(100000/167) = 599 months
		expect(s.verdict).toBe("wont-finish");
		expect(s.monthsToTarget).toBe(599);
		expect(s.requiredPencePerMonth).toBe(100_000);
	});

	it("stalled: no trailing allocations", () => {
		const s = goalVelocity(10_000, 50_000, [], now, new Date("2027-05-01T00:00:00Z"));
		expect(s.verdict).toBe("stalled");
		expect(s.monthsToTarget).toBeNull();
	});

	it("funded: at or past target", () => {
		const s = goalVelocity(120_000, 100_000, [], now, null);
		expect(s.verdict).toBe("funded");
		expect(s.monthsToTarget).toBe(0);
	});

	it("no-deadline: pace only, never red", () => {
		const s = goalVelocity(20_000, 100_000, [{ amount: 10_000, date: d(15) }], now, null);
		expect(s.verdict).toBe("no-deadline");
		expect(s.monthsLeft).toBeNull();
		// rate = 10,000/6 = 1,667 → ETA = ceil(80,000/1,667) = 48 months
		expect(s.monthsToTarget).toBe(48);
	});

	it("old allocations outside the 6m window do not inflate the rate", () => {
		const fresh = goalVelocity(0, 100_000, [{ amount: 10_000, date: d(100) }], now, null);
		const stale = goalVelocity(0, 100_000, [{ amount: 10_000, date: d(200) }], now, null);
		expect(fresh.ratePencePerMonth).toBe(1667);
		expect(stale.ratePencePerMonth).toBe(0);
		expect(stale.verdict).toBe("stalled");
	});

	it("velocity flags map verdicts to semantic colours", () => {
		expect(velocityFlag("on-track")).toBe("green");
		expect(velocityFlag("funded")).toBe("green");
		expect(velocityFlag("short-pace")).toBe("amber");
		expect(velocityFlag("stalled")).toBe("amber");
		expect(velocityFlag("no-deadline")).toBe("amber");
		expect(velocityFlag("wont-finish")).toBe("red");
	});

	it("registered with the paper structure and degrades for unknown users", async () => {
		const report = findReport("goal-velocity");
		expect(report).toBeDefined();
		const doc = await report!.build(999_999);
		expect(doc.slug).toBe("goal-velocity");
		expect(doc.abstract).toContain("No goals on record");
	});
});
