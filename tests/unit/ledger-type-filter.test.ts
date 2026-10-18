import { describe, expect, it } from "vitest";
import {
	filterGroupsByType,
	groupTransactionsByMonth,
	resolveLedgerTypeFilter,
} from "$lib/utils/transaction-grouping";

type Tx = { date: Date; amount: number; type: string };

function tx(day: number, amount: number, type: string, month = 9): Tx {
	return { date: new Date(Date.UTC(2026, month - 1, day)), amount, type };
}

const getDate = (t: Tx) => t.date;
const getAmount = (t: Tx) => t.amount;

// A month with mixed types — the shape an alert deep link lands on
const september = (): Tx[] => [
	tx(3, 50000, "transfer_in"),
	tx(4, -50000, "transfer_out"),
	tx(10, 50000, "transfer_in"),
	tx(15, -2500, "withdrawal"),
	tx(20, 120, "interest"),
];

describe("ledger type prefilter: param resolution", () => {
	it("passes through valid TRANSACTION_TYPES values", () => {
		expect(resolveLedgerTypeFilter("transfer_in")).toBe("transfer_in");
		expect(resolveLedgerTypeFilter("interest_accrued")).toBe(
			"interest_accrued",
		);
		expect(resolveLedgerTypeFilter("payment")).toBe("payment");
	});

	it("ignores invalid values — the unfiltered month renders", () => {
		expect(resolveLedgerTypeFilter("not-a-type")).toBeNull();
		expect(resolveLedgerTypeFilter("Transfer_In")).toBeNull(); // case-sensitive
		expect(resolveLedgerTypeFilter("")).toBeNull();
	});

	it("treats an absent param as no filter", () => {
		expect(resolveLedgerTypeFilter(null)).toBeNull();
	});
});

describe("ledger type prefilter: prefiltered render", () => {
	it("narrows displayed rows to the prefILTERED type", () => {
		const groups = groupTransactionsByMonth(september(), getDate, getAmount);
		const filtered = filterGroupsByType(groups, "transfer_in");

		expect(filtered).toHaveLength(1);
		expect(filtered[0].transactions).toHaveLength(2);
		expect(
			filtered[0].transactions.every((t) => t.type === "transfer_in"),
		).toBe(true);
	});

	it("keeps month totals full-month while rows are filtered", () => {
		const rows = september();
		const groups = groupTransactionsByMonth(rows, getDate, getAmount);
		const filtered = filterGroupsByType(groups, "transfer_in");

		// Totals must match the unfiltered month (50000+50000-50000-2500+120)
		expect(filtered[0].inflow).toBe(groups[0].inflow);
		expect(filtered[0].outflow).toBe(groups[0].outflow);
		expect(filtered[0].net).toBe(groups[0].net);
		expect(filtered[0].net).toBe(100000 - 52500 + 120);
	});

	it("renders an empty-row placeholder month when no rows match", () => {
		const groups = groupTransactionsByMonth(september(), getDate, getAmount);
		const filtered = filterGroupsByType(groups, "mortgage_disbursement");

		expect(filtered[0].transactions).toHaveLength(0);
		// Totals still full-month
		expect(filtered[0].net).toBe(groups[0].net);
	});
});

describe("ledger type prefilter: invalid param + clear chip behaviour", () => {
	it("invalid param resolves to null which is the filter identity (unfiltered month)", () => {
		// Mirrors the server load: resolveLedgerTypeFilter output feeds
		// filterGroupsByType directly
		const groups = groupTransactionsByMonth(september(), getDate, getAmount);
		const resolved = resolveLedgerTypeFilter("not-a-type");
		const displayed = filterGroupsByType(groups, resolved);

		expect(displayed[0].transactions).toHaveLength(5);
		expect(displayed).toEqual(groups);
	});

	it("clearing ([Clear]) restores the full month view via the null identity", () => {
		const groups = groupTransactionsByMonth(september(), getDate, getAmount);
		const filtered = filterGroupsByType(groups, "transfer_in");
		expect(filtered[0].transactions).toHaveLength(2);

		// Clearing removes the param, so the component re-derives from the
		// same full-month source groups with a null filter
		const cleared = filterGroupsByType(groups, null);

		// Clearing returns every row of the month, totals unchanged
		expect(cleared[0].transactions).toHaveLength(5);
		expect(cleared).toEqual(groups);
	});
});
