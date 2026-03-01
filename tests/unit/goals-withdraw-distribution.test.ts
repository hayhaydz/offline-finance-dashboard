import { describe, expect, it } from "vitest";
import { distributeWithdrawalAcrossAccounts } from "$lib/server/goals";

describe("distributeWithdrawalAcrossAccounts", () => {
	it("distributes withdrawal proportionally across contributing accounts", () => {
		const distribution = distributeWithdrawalAcrossAccounts({
			amountInCents: 600,
			contributions: [
				{ accountId: 1, netAllocated: 900 },
				{ accountId: 2, netAllocated: 300 },
			],
		});

		expect(distribution).toEqual([
			{ accountId: 1, amountInCents: 450 },
			{ accountId: 2, amountInCents: 150 },
		]);
	});

	it("throws when withdrawal exceeds account contributions", () => {
		expect(() =>
			distributeWithdrawalAcrossAccounts({
				amountInCents: 1000,
				contributions: [{ accountId: 1, netAllocated: 500 }],
			}),
		).toThrow("INSUFFICIENT_ACCOUNT_CONTRIBUTIONS");
	});
});
