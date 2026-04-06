import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import { calculateReadyToAssign } from "$lib/server/goals";
import { load } from "../../src/routes/goals/+page.server";

vi.mock("$lib/db/client", () => {
	const where = vi.fn().mockResolvedValue([{ total: 0 }]);
	const from = vi.fn().mockReturnValue({ where });
	const select = vi.fn().mockReturnValue({ from });

	return {
		db: {
			select,
			query: {
				goals: {
					findMany: vi.fn().mockResolvedValue([]),
				},
				accounts: {
					findMany: vi.fn().mockResolvedValue([]),
				},
			},
		},
	};
});

vi.mock("$lib/server/goals", () => ({
	calculateReadyToAssign: vi.fn().mockResolvedValue({
		readyToAssign: 0,
		totalAssets: 0,
		totalSavingsAllocated: 0,
		totalDebtTracked: 0,
		totalDebtUntracked: 0,
		totalLiabilities: 0,
	}),
}));

vi.mock("$lib/server/finance", () => ({
	getNetWorthSummary: vi.fn().mockResolvedValue({
		netWorth: 0,
		totalAssets: 0,
		totalLiabilities: 0,
		excludedAssets: 0,
		excludedLiabilities: 0,
		exclusionCount: 0,
		excludedTypeNames: [],
		hasStaleData: false,
		dateRange: { oldest: new Date(), newest: new Date() },
	}),
}));

vi.mock("$lib/utils/staleness", () => ({
	getMostRecentDate: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
	getStaleness: vi.fn(() => ({ level: "fresh", text: "fresh" })),
}));

describe("Goals Page Load Pagination Guards", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defaults to first page when page query is invalid", async () => {
		const locals = {
			user: {
				id: 1,
				username: "tester",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			},
		};
		const url = new URL("http://localhost/goals?page=abc");

		const result = await (load as any)({ locals, url });

		expect(result.page).toBe(0);
		expect(result.totalPages).toBe(0);
		expect(db.query.goals.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				offset: 0,
				limit: 10,
			}),
		);
		expect(calculateReadyToAssign).toHaveBeenCalledWith({ userId: 1 });
	});
});
