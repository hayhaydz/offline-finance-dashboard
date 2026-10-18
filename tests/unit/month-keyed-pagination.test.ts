import { describe, expect, it } from "vitest";
import {
	adjacentMonths,
	computeMonthTotals,
	groupTransactionsByMonth,
	monthLabelForKey,
	resolveLedgerMonth,
	utcMonthRange,
} from "$lib/utils/transaction-grouping";

type Tx = { date: Date; amount: number };

function tx(day: number, amount: number, month = 3, year = 2026): Tx {
	return { date: new Date(Date.UTC(year, month - 1, day)), amount };
}

const getDate = (t: Tx) => t.date;
const getAmount = (t: Tx) => t.amount;

describe("month-keyed pagination: totals completeness", () => {
	it("computes month totals from all 45 rows of a 45-row month", () => {
		const rows: Tx[] = [];
		// 45 transactions spread across March 2026 (max 31 days, some days doubled)
		for (let i = 0; i < 45; i++) {
			rows.push(tx((i % 31) + 1, i % 2 === 0 ? 1000 + i : -(500 + i)));
		}

		const totals = computeMonthTotals(rows, getAmount);
		const groups = groupTransactionsByMonth(rows, getDate, getAmount);

		expect(rows).toHaveLength(45);
		expect(groups).toHaveLength(1);
		expect(groups[0].transactions).toHaveLength(45);
		expect(groups[0].inflow).toBe(totals.inflow);
		expect(groups[0].outflow).toBe(totals.outflow);
		expect(groups[0].net).toBe(totals.net);
		expect(groups[0].net).toBe(totals.inflow - totals.outflow);
	});

	it("no longer disagrees with a 20-row slice (the old offset-pagination bug)", () => {
		const rows: Tx[] = [];
		for (let i = 0; i < 45; i++) {
			rows.push(tx((i % 31) + 1, i % 2 === 0 ? 1000 : -600));
		}
		const full = computeMonthTotals(rows, getAmount);
		const slice = computeMonthTotals(rows.slice(0, 20), getAmount);

		expect(slice.net).not.toBe(full.net);
		// Month-keyed load fetches the whole month, so the displayed totals
		// equal the full-range totals by construction.
		expect(full.inflow).toBe(23 * 1000); // 23 even-indexed rows of +1000
		expect(full.outflow).toBe(22 * 600);
	});

	it("treats zero amounts as outflow-neutral and net-neutral sign correctly", () => {
		const totals = computeMonthTotals(
			[tx(1, 500), tx(2, -200), tx(3, 0)],
			getAmount,
		);
		expect(totals).toEqual({ inflow: 500, outflow: 200, net: 300 });
	});
});

describe("month-keyed pagination: month resolution", () => {
	const keysOldestFirst = ["2026-01", "2026-03", "2026-06"]; // data-bearing

	it("default view: no month param renders the latest data-bearing month", () => {
		expect(resolveLedgerMonth(keysOldestFirst, null)).toBe("2026-06");
	});

	it("honours an explicit data-bearing month param", () => {
		expect(resolveLedgerMonth(keysOldestFirst, "2026-03")).toBe("2026-03");
	});

	it("legacy ?page=N param contributes nothing (ignored, default renders)", () => {
		// The server load only ever passes the `month` param to the resolver;
		// a URL like /accounts/x?page=3 yields month=null here.
		const monthParamFromLegacyUrl = null;
		expect(resolveLedgerMonth(keysOldestFirst, monthParamFromLegacyUrl)).toBe(
			"2026-06",
		);
	});

	it("falls back to latest for malformed, invalid, or empty-month params", () => {
		for (const bad of ["garbage", "2026-13", "2026-00", "2026-2", "2026-02"]) {
			expect(resolveLedgerMonth(keysOldestFirst, bad)).toBe("2026-06");
		}
	});

	it("returns null when the account has no transactions", () => {
		expect(resolveLedgerMonth([], null)).toBeNull();
		expect(resolveLedgerMonth([], "2026-06")).toBeNull();
	});
});

describe("month-keyed pagination: skip-empty navigation", () => {
	// April and May have no transactions — absent from the list by design
	const monthsNewestFirst = ["2026-06", "2026-03"];

	it("next from March lands on June (April/May skipped)", () => {
		expect(adjacentMonths(monthsNewestFirst, "2026-03")).toEqual({
			prev: null,
			next: "2026-06",
		});
	});

	it("prev from June lands on March (April/May skipped)", () => {
		expect(adjacentMonths(monthsNewestFirst, "2026-06")).toEqual({
			prev: "2026-03",
			next: null,
		});
	});

	it("walks both directions through a longer data-bearing list", () => {
		const months = ["2026-08", "2026-06", "2026-05", "2026-01"];
		expect(adjacentMonths(months, "2026-05")).toEqual({
			prev: "2026-01",
			next: "2026-06",
		});
		expect(adjacentMonths(months, "2026-08")).toEqual({
			prev: "2026-06",
			next: null,
		});
	});

	it("returns nulls for unknown current month", () => {
		expect(adjacentMonths(monthsNewestFirst, "2026-04")).toEqual({
			prev: null,
			next: null,
		});
		expect(adjacentMonths(monthsNewestFirst, null)).toEqual({
			prev: null,
			next: null,
		});
	});
});

describe("month-keyed pagination: UTC boundaries and labels", () => {
	it("produces a [start, end) UTC range for a month key", () => {
		const range = utcMonthRange("2026-03");
		expect(range?.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
		expect(range?.end.toISOString()).toBe("2026-04-01T00:00:00.000Z");
	});

	it("rolls December into January of the next year", () => {
		const range = utcMonthRange("2026-12");
		expect(range?.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
	});

	it("returns null for malformed keys", () => {
		expect(utcMonthRange("2026-3")).toBeNull();
		expect(utcMonthRange("banana")).toBeNull();
	});

	it("labels months en-GB long form", () => {
		expect(monthLabelForKey("2026-03")).toBe("March 2026");
	});
});
