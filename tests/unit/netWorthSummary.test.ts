import { describe, it, expect } from "vitest";
import { calculateAssetsAndLiabilities } from "$lib/server/finance";
import type { AccountWithLatestBalance } from "$lib/server/finance";

describe("calculateAssetsAndLiabilities", () => {
	it("calculates assets and liabilities from positive asset balances", () => {
		const accounts: AccountWithLatestBalance[] = [
			{ category: "asset", currentBalance: 50000 },
			{ category: "asset", currentBalance: 30000 },
		];
		const result = calculateAssetsAndLiabilities(accounts);
		expect(result.totalAssets).toBe(80000);
		expect(result.totalLiabilities).toBe(0);
		expect(result.netWorth).toBe(80000);
	});

	it("classifies negative asset balances as liabilities", () => {
		const accounts: AccountWithLatestBalance[] = [
			{ category: "asset", currentBalance: 50000 },
			{ category: "asset", currentBalance: -10000 },
		];
		const result = calculateAssetsAndLiabilities(accounts);
		expect(result.totalAssets).toBe(50000);
		expect(result.totalLiabilities).toBe(-10000);
		expect(result.netWorth).toBe(40000);
	});

	it("sums liability category accounts into liabilities", () => {
		const accounts: AccountWithLatestBalance[] = [
			{ category: "asset", currentBalance: 100000 },
			{ category: "liability", currentBalance: -250000 },
		];
		const result = calculateAssetsAndLiabilities(accounts);
		expect(result.totalAssets).toBe(100000);
		expect(result.totalLiabilities).toBe(-250000);
		expect(result.netWorth).toBe(-150000);
	});

	it("handles empty accounts array", () => {
		const result = calculateAssetsAndLiabilities([]);
		expect(result.totalAssets).toBe(0);
		expect(result.totalLiabilities).toBe(0);
		expect(result.netWorth).toBe(0);
	});

	it("uses balance from balances array when currentBalance is null", () => {
		const accounts: AccountWithLatestBalance[] = [
			{
				category: "asset",
				currentBalance: null,
				balances: [{ balanceInCents: 5000 }],
			},
		];
		const result = calculateAssetsAndLiabilities(accounts);
		expect(result.totalAssets).toBe(5000);
	});
});
