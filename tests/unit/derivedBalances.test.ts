import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";

vi.mock("$lib/db/client", () => ({
	db: {
		select: vi.fn(),
	},
}));

function setupSelectMock<T>(rows: T[]) {
	const selectMock = vi.fn();
	const fromMock = vi.fn();
	const whereMock = vi.fn();
	const groupByMock = vi.fn();

	selectMock.mockReturnValue({ from: fromMock });
	fromMock.mockReturnValue({ where: whereMock });
	whereMock.mockReturnValue({ groupBy: groupByMock });
	groupByMock.mockResolvedValue(rows);

	(db.select as any).mockImplementation((columns: any) => selectMock(columns));

	return { selectMock, fromMock, whereMock, groupByMock };
}

describe("derivedBalances aggregations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns empty map for empty account list (balances)", async () => {
		const result = await getCurrentBalancesForAccounts([]);
		expect(result.size).toBe(0);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("aggregates balances by account id and includes zeros for missing", async () => {
		setupSelectMock([
			{ accountId: 1, total: 1500 },
			{ accountId: 3, total: -200 },
		]);

		const result = await getCurrentBalancesForAccounts([1, 2, 3]);
		expect(result.get(1)).toBe(1500);
		expect(result.get(2)).toBe(0);
		expect(result.get(3)).toBe(-200);
	});

	it("returns empty map for empty account list (latest dates)", async () => {
		const result = await getLatestTransactionDateForAccounts([]);
		expect(result.size).toBe(0);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("aggregates latest transaction date per account", async () => {
		const dateA = new Date("2025-01-02T00:00:00.000Z");
		const dateB = new Date("2025-02-05T00:00:00.000Z");
		setupSelectMock([
			{ accountId: 1, latest: dateA },
			{ accountId: 2, latest: dateB },
		]);

		const result = await getLatestTransactionDateForAccounts([1, 2, 3]);
		expect(result.get(1)).toEqual(dateA);
		expect(result.get(2)).toEqual(dateB);
		expect(result.get(3)).toBeNull();
	});
});
