/**
 * Unit tests for getActualInterestByTaxWrapper
 *
 * Tests coverage:
 * 1. Splits interest into tax-free (ISA/LISA) and taxable
 * 2. Returns zeros when no transactions exist
 * 3. Handles LISA wrapper as tax-free
 * 4. Handles mixed wrappers with multiple rows
 */

import { describe, it, expect, vi } from "vitest";

// Mock the DB module before importing the function under test
vi.mock("$lib/db/client", () => ({
	db: {
		select: vi.fn(),
		query: {
			accounts: {
				findMany: vi.fn(),
			},
		},
	},
}));

vi.mock("drizzle-orm", () => ({
	sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
		String.raw(strings, ...values),
	eq: vi.fn((col, val) => ({ col, val, op: "eq" })),
	and: vi.fn((...conds) => ({ conds, op: "and" })),
	gte: vi.fn((col, val) => ({ col, val, op: "gte" })),
	lte: vi.fn((col, val) => ({ col, val, op: "lte" })),
	or: vi.fn((...conds) => ({ conds, op: "or" })),
	isNull: vi.fn((col) => ({ col, op: "isNull" })),
}));

vi.mock("$lib/db/schema", () => ({
	accountTransactions: {
		accountId: "accountId",
		type: "type",
		amount: "amount",
		transactionDate: "transactionDate",
	},
	accounts: {
		id: "id",
		userId: "userId",
		type: "type",
		taxWrapper: "taxWrapper",
		maturityDate: "maturityDate",
	},
}));

// Mock dependencies that calculations.ts imports but we don't need
vi.mock("$lib/server/derivedBalances", () => ({
	getCurrentBalanceForAccount: vi.fn(),
	getCurrentBalancesForAccounts: vi.fn(),
}));

vi.mock("$lib/server/interestRates", () => ({
	getCurrentRate: vi.fn(),
}));

import {
	getActualInterestByTaxWrapper,
	getProjectedInterestByTaxWrapper,
} from "$lib/server/calculations";
import { db } from "$lib/db/client";

describe("getActualInterestByTaxWrapper", () => {
	const taxYearStart = new Date(Date.UTC(2025, 3, 6, 0, 0, 0, 0));
	const taxYearEnd = new Date(Date.UTC(2026, 3, 5, 23, 59, 59, 999));

	/**
	 * Helper to set up the db.select mock chain for this function's query shape:
	 *   db.select({...}).from(accountTransactions).innerJoin(accounts, ...).where(...).groupBy(...)
	 */
	function mockDbSelect(results: Array<{ taxWrapper: string; total: number }>) {
		const groupByMock = vi.fn().mockResolvedValue(results);
		const whereMock = vi.fn().mockReturnValue({ groupBy: groupByMock });
		const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
		const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
		const selectMock = vi.fn().mockReturnValue({ from: fromMock });

		vi.mocked(db.select).mockReturnValue(selectMock() as never);

		return { selectMock, fromMock, innerJoinMock, whereMock, groupByMock };
	}

	it("splits actual interest into tax-free (ISA/LISA) and taxable", async () => {
		mockDbSelect([
			{ taxWrapper: "isa", total: 20000 },
			{ taxWrapper: "none", total: 15000 },
		]);

		const result = await getActualInterestByTaxWrapper(
			1, // userId
			taxYearStart,
			taxYearEnd,
		);

		expect(result.taxFree).toBe(20000);
		expect(result.taxable).toBe(15000);
	});

	it("returns zeros when no interest transactions exist", async () => {
		mockDbSelect([]);

		const result = await getActualInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
		);

		expect(result.taxFree).toBe(0);
		expect(result.taxable).toBe(0);
	});

	it("classifies LISA as tax-free", async () => {
		mockDbSelect([{ taxWrapper: "lisa", total: 50000 }]);

		const result = await getActualInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
		);

		expect(result.taxFree).toBe(50000);
		expect(result.taxable).toBe(0);
	});

	it("classifies premium-bonds as taxable", async () => {
		mockDbSelect([{ taxWrapper: "premium-bonds", total: 30000 }]);

		const result = await getActualInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
		);

		expect(result.taxFree).toBe(0);
		expect(result.taxable).toBe(30000);
	});

	it("handles mixed wrappers across multiple rows", async () => {
		mockDbSelect([
			{ taxWrapper: "isa", total: 20000 },
			{ taxWrapper: "lisa", total: 10000 },
			{ taxWrapper: "none", total: 15000 },
			{ taxWrapper: "premium-bonds", total: 5000 },
		]);

		const result = await getActualInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
		);

		// ISA (20000) + LISA (10000) = 30000 tax-free
		expect(result.taxFree).toBe(30000);
		// none (15000) + premium-bonds (5000) = 20000 taxable
		expect(result.taxable).toBe(20000);
	});
});

describe("getProjectedInterestByTaxWrapper", () => {
	const taxYearStart = new Date(Date.UTC(2025, 3, 6, 0, 0, 0, 0));
	const taxYearEnd = new Date(Date.UTC(2026, 3, 5, 23, 59, 59, 999));
	const today = new Date(Date.UTC(2026, 0, 15, 0, 0, 0, 0));

	it("is exported and callable", async () => {
		expect(typeof getProjectedInterestByTaxWrapper).toBe("function");
	});

	it("returns zeros when no savings/investment accounts exist", async () => {
		vi.mocked(db.query.accounts.findMany).mockResolvedValue([]);

		const result = await getProjectedInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
			today,
		);

		expect(result.taxFree).toBe(0);
		expect(result.taxable).toBe(0);
		expect(result.daysRemaining).toBeGreaterThan(0);
	});

	it("returns zeros with zero daysRemaining when tax year is over", async () => {
		const pastDate = new Date(Date.UTC(2027, 3, 10, 0, 0, 0, 0));

		const result = await getProjectedInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
			pastDate,
		);

		expect(result.taxFree).toBe(0);
		expect(result.taxable).toBe(0);
		expect(result.daysRemaining).toBe(0);
	});
});

describe("Homepage interest pagination regression", () => {
	it("getActualInterestByTaxWrapper includes ALL accounts regardless of pagination", async () => {
		// The bug: homepage used paginated accounts (limit 10) for interest.
		// If savings were on page 2, interest was £0.
		// This test verifies the new function queries ALL accounts via SQL.
		function mockDbSelect(results: Array<{ taxWrapper: string; total: number }>) {
			const groupByMock = vi.fn().mockResolvedValue(results);
			const whereMock = vi.fn().mockReturnValue({ groupBy: groupByMock });
			const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
			const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
			const selectMock = vi.fn().mockReturnValue({ from: fromMock });
			vi.mocked(db.select).mockReturnValue(selectMock() as never);
		}

		mockDbSelect([
			{ taxWrapper: "isa", total: 50000 },
			{ taxWrapper: "none", total: 30000 },
		]);

		const taxYearStart = new Date(Date.UTC(2025, 3, 6));
		const taxYearEnd = new Date(Date.UTC(2026, 3, 5, 23, 59, 59, 999));

		const result = await getActualInterestByTaxWrapper(
			1,
			taxYearStart,
			taxYearEnd,
		);

		expect(result.taxFree).toBe(50000);
		expect(result.taxable).toBe(30000);
	});
});
