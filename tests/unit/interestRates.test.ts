import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import { getCurrentRatesForAccounts } from "$lib/server/interestRates";

vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			interestRates: {
				findMany: vi.fn(),
			},
		},
	},
}));

describe("getCurrentRatesForAccounts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns empty map for empty account list", async () => {
		const result = await getCurrentRatesForAccounts([]);
		expect(result.size).toBe(0);
		expect(db.query.interestRates.findMany).not.toHaveBeenCalled();
	});

	it("returns latest rate per account and null for missing", async () => {
		(db.query.interestRates.findMany as any).mockResolvedValue([
			{ accountId: 1, rate: 500 },
			{ accountId: 1, rate: 450 },
			{ accountId: 2, rate: 300 },
		]);

		const result = await getCurrentRatesForAccounts([1, 2, 3]);
		expect(result.get(1)).toBe(500);
		expect(result.get(2)).toBe(300);
		expect(result.get(3)).toBeNull();
	});
});
