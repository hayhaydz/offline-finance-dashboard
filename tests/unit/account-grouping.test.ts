import { describe, expect, it } from "vitest";
import { groupAccountsByType } from "$lib/utils/account-grouping";

function account(
	type: string,
	closed: boolean,
	id: number,
): { id: number; type: string; closedAt: Date | null } {
	return {
		id,
		type,
		closedAt: closed ? new Date("2026-09-01T00:00:00.000Z") : null,
	};
}

describe("groupAccountsByType (accounts index placement)", () => {
	it("renders open accounts first within a type section, closed behind the toggle", () => {
		// 3 open + 2 closed savings accounts (spec scenario)
		const input = [
			account("savings", false, 1),
			account("savings", true, 2),
			account("savings", false, 3),
			account("savings", true, 4),
			account("savings", false, 5),
		];

		const sections = groupAccountsByType(input);

		expect(sections).toHaveLength(1);
		expect(sections[0].type).toBe("savings");
		expect(sections[0].open.map((a) => a.id)).toEqual([1, 3, 5]);
		expect(sections[0].closed.map((a) => a.id)).toEqual([2, 4]);
	});

	it("orders sections canonically regardless of input order", () => {
		const input = [
			account("mortgage", false, 1),
			account("current", false, 2),
			account("savings", false, 3),
			account("credit-card", false, 4),
			account("loan", false, 5),
			account("investment", false, 6),
		];

		const sections = groupAccountsByType(input);
		expect(sections.map((s) => s.type)).toEqual([
			"current",
			"savings",
			"investment",
			"credit-card",
			"loan",
			"mortgage",
		]);
	});

	it("keeps unknown types after canonical ones in first-appearance order", () => {
		const input = [
			account("custom-type", false, 1),
			account("current", false, 2),
			account("another-type", false, 3),
		];

		const sections = groupAccountsByType(input);
		expect(sections.map((s) => s.type)).toEqual([
			"current",
			"custom-type",
			"another-type",
		]);
	});

	it("preserves relative input order within open and closed groups", () => {
		const input = [
			account("savings", true, 1),
			account("savings", false, 2),
			account("current", true, 3),
			account("savings", false, 4),
		];

		const sections = groupAccountsByType(input);
		const savings = sections.find((s) => s.type === "savings");
		expect(savings?.open.map((a) => a.id)).toEqual([2, 4]);
		expect(savings?.closed.map((a) => a.id)).toEqual([1]);
		const current = sections.find((s) => s.type === "current");
		expect(current?.open).toHaveLength(0);
		expect(current?.closed.map((a) => a.id)).toEqual([3]);
	});

	it("returns no sections for empty input", () => {
		expect(groupAccountsByType([])).toEqual([]);
	});
});
