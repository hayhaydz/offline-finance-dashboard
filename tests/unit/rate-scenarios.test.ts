import { describe, expect, it } from "vitest";
import {
	buildOverpaymentScenarios,
	buildRateStressScenarios,
	calculateBreakEvenMonth,
} from "$lib/server/rate-scenarios";

// Minimal TTZ result shape — only months and totalInterest
function mockTTZ(months: number | null, totalInterest: number) {
	return { months, totalInterest };
}

describe("buildOverpaymentScenarios", () => {
	const now = new Date("2026-01-15");

	it("gives each scenario its own ttzMonths from its own TTZ result", () => {
		const scenarios = buildOverpaymentScenarios(
			[
				{ multiplier: 1, ttzResult: mockTTZ(78, 280000) },
				{ multiplier: 1.25, ttzResult: mockTTZ(55, 187500) },
				{ multiplier: 1.5, ttzResult: mockTTZ(43, 145000) },
			],
			10000, // £100
		 now,
		);

		expect(scenarios).toHaveLength(3);
		// Core regression test: each scenario gets its own months
		expect(scenarios[0].ttzMonths).toBe(78);
		expect(scenarios[1].ttzMonths).toBe(55);
		expect(scenarios[2].ttzMonths).toBe(43);
		// Each gets its own total interest
		expect(scenarios[0].totalInterest).toBe(280000);
		expect(scenarios[1].totalInterest).toBe(187500);
		expect(scenarios[2].totalInterest).toBe(145000);
	});

	it("formats labels correctly", () => {
		const scenarios = buildOverpaymentScenarios(
			[
				{ multiplier: 1, ttzResult: mockTTZ(12, 1000) },
				{ multiplier: 1.25, ttzResult: mockTTZ(10, 800) },
				{ multiplier: 1.5, ttzResult: mockTTZ(8, 600) },
			],
			50000,
			now,
		);

		expect(scenarios[0].label).toBe("Minimum");
		expect(scenarios[1].label).toBe("+25%");
		expect(scenarios[2].label).toBe("+50%");
	});

	it("computes payment from currentPayment × multiplier", () => {
		const scenarios = buildOverpaymentScenarios(
			[
				{ multiplier: 1, ttzResult: mockTTZ(12, 1000) },
				{ multiplier: 1.25, ttzResult: mockTTZ(10, 800) },
				{ multiplier: 1.5, ttzResult: mockTTZ(8, 600) },
			],
			10000, // £100
			now,
		);

		expect(scenarios[0].payment).toBe(10000);
		expect(scenarios[1].payment).toBe(12500);
		expect(scenarios[2].payment).toBe(15000);
	});

	it("computes debtFreeDate from now + months", () => {
		const scenarios = buildOverpaymentScenarios(
			[{ multiplier: 1, ttzResult: mockTTZ(3, 1000) }],
			50000,
			new Date("2026-01-15"),
		);

		// Jan + 3 months = Apr 2026
		expect(scenarios[0].debtFreeDate).toBe("Apr 2026");
	});

	it("sets debtFreeDate to null when months is null", () => {
		const scenarios = buildOverpaymentScenarios(
			[{ multiplier: 1, ttzResult: mockTTZ(null, 0) }],
			50000,
			now,
		);

		expect(scenarios[0].debtFreeDate).toBeNull();
		expect(scenarios[0].ttzMonths).toBeNull();
	});
});

describe("buildRateStressScenarios", () => {
	const now = new Date("2026-01-15");

	it("gives each scenario its own ttzMonths from its own TTZ result", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(95, 450000),
				},
				{
					basisPointDelta: 500,
					scenarioRate: 2500,
					ttzResult: mockTTZ(130, 620000),
				},
			],
			78,
			now,
		);

		expect(scenarios).toHaveLength(2);
		expect(scenarios[0].ttzMonths).toBe(95);
		expect(scenarios[1].ttzMonths).toBe(130);
	});

	it("computes ttzDelta correctly against base months", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(95, 450000),
				},
				{
					basisPointDelta: 500,
					scenarioRate: 2500,
					ttzResult: mockTTZ(130, 620000),
				},
			],
			78,
			now,
		);

		expect(scenarios[0].ttzDelta).toBe(17);
		expect(scenarios[1].ttzDelta).toBe(52);
	});

	it("caps months at 300 and computes ttzDelta from capped value", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(400, 800000),
				},
			],
			78,
			now,
		);

		expect(scenarios[0].ttzMonths).toBe(300);
		expect(scenarios[0].ttzDelta).toBe(222); // 300 - 78
	});

	it("formats labels as +2% and +5%", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(95, 450000),
				},
				{
					basisPointDelta: 500,
					scenarioRate: 2500,
					ttzResult: mockTTZ(130, 620000),
				},
			],
			78,
			now,
		);

		expect(scenarios[0].label).toBe("+2%");
		expect(scenarios[1].label).toBe("+5%");
	});

	it("passes through scenarioRate as rate", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(95, 450000),
				},
			],
			78,
			now,
		);

		expect(scenarios[0].rate).toBe(2200);
	});

	it("computes debtFreeDate from now + cappedMonths", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(3, 1000),
				},
			],
			2,
			new Date("2026-01-15"),
		);

		expect(scenarios[0].debtFreeDate).toBe("Apr 2026");
	});

	it("handles null months with null debtFreeDate and null ttzDelta", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(null, 0),
				},
			],
			78,
			now,
		);

		expect(scenarios[0].ttzMonths).toBeNull();
		expect(scenarios[0].debtFreeDate).toBeNull();
		expect(scenarios[0].ttzDelta).toBeNull();
	});

	it("returns null ttzDelta when baseTTZMonths is null", () => {
		const scenarios = buildRateStressScenarios(
			[
				{
					basisPointDelta: 200,
					scenarioRate: 2200,
					ttzResult: mockTTZ(95, 450000),
				},
			],
			null,
			now,
		);

		expect(scenarios[0].ttzMonths).toBe(95);
		expect(scenarios[0].ttzDelta).toBeNull();
	});
});

describe("calculateBreakEvenMonth", () => {
	it("finds the month where cumulative interest exceeds original principal", () => {
		const projection = [
			{ month: 1, interest: 400, balance: 9600 },
			{ month: 2, interest: 380, balance: 9200 },
			{ month: 3, interest: 360, balance: 8800 },
			{ month: 4, interest: 340, balance: 8400 },
			{ month: 5, interest: 320, balance: 8000 },
		];

		// Cumulative: 400, 780, 1140, 1480, 1800
		// Original principal = 1000 → break even at month 3
		const result = calculateBreakEvenMonth(projection, 1000);
		expect(result).toBe(3);
	});

	it("returns null when projection never exceeds original principal", () => {
		const projection = [
			{ month: 1, interest: 50, balance: 950 },
			{ month: 2, interest: 45, balance: 900 },
		];

		const result = calculateBreakEvenMonth(projection, 10000);
		expect(result).toBeNull();
	});

	it("returns null for empty projection", () => {
		expect(calculateBreakEvenMonth([], 1000)).toBeNull();
	});
});
