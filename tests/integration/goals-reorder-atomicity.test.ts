import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "../../src/routes/goals/+page.server";

type GoalRow = {
	id: number;
	slug: string;
	name: string;
	sortOrder: number;
	userId: number;
	deletedAt: null;
};
let goalState: GoalRow[] = [];
let failOnSecondUpdate = false;

vi.mock("$lib/db/client", () => {
	const db = {
		transaction: vi.fn(async (fn: any) => {
			const snapshot = goalState.map((g) => ({ ...g }));
			let updateCalls = 0;
			const tx = {
				query: {
					goals: {
						findMany: vi.fn(async () =>
							goalState
								.map((g) => ({ ...g }))
								.sort((a, b) => a.sortOrder - b.sortOrder),
						),
						findFirst: vi.fn(async () =>
							goalState[0] ? { ...goalState[0] } : undefined,
						),
					},
				},
				update: vi.fn(() => ({
					set: vi.fn((values: any) => ({
						where: vi.fn(async () => {
							updateCalls++;
							goalState[0].sortOrder = values.sortOrder;
							if (failOnSecondUpdate && updateCalls === 2) {
								throw new Error("forced update failure");
							}
							return true;
						}),
					})),
				})),
			};

			try {
				return await fn(tx);
			} catch (error) {
				goalState = snapshot;
				throw error;
			}
		}),
	};

	return { db };
});

vi.mock("$lib/server/goals", () => ({
	calculateReadyToAssign: vi
		.fn()
		.mockResolvedValue({ readyToAssign: 0, totalAssets: 0, totalSavingsAllocated: 0, totalDebtTracked: 0, totalDebtUntracked: 0, totalLiabilities: 0 }),
}));

vi.mock("$lib/utils/staleness", () => ({
	getMostRecentDate: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
	getStaleness: vi.fn(() => ({ level: "fresh", text: "fresh" })),
}));

describe("Goals reorder transaction atomicity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failOnSecondUpdate = false;
		goalState = [
			{
				id: 1,
				slug: "g1",
				name: "Goal 1",
				sortOrder: 1,
				userId: 1,
				deletedAt: null,
			},
			{
				id: 2,
				slug: "g2",
				name: "Goal 2",
				sortOrder: 2,
				userId: 1,
				deletedAt: null,
			},
			{
				id: 3,
				slug: "g3",
				name: "Goal 3",
				sortOrder: 3,
				userId: 1,
				deletedAt: null,
			},
		];
	});

	it("rolls back all changes when a reorder update fails", async () => {
		failOnSecondUpdate = true;

		const formData = new FormData();
		formData.append("slug", "g3");
		formData.append("targetIndex", "0");

		const request = new Request("http://localhost/goals?/moveTo", {
			method: "POST",
			body: formData,
		});

		const result = await (actions.moveTo as any)({
			request,
			locals: { user: { id: 1, username: "tester", createdAt: new Date() } },
		});

		expect(result.status).toBe(500);
		expect(result.data.error).toBe("Failed to reorder goal");
		expect(goalState.map((g) => g.sortOrder)).toEqual([1, 2, 3]);
	});
});
