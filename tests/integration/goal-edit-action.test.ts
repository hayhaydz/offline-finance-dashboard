import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "../../src/routes/goals/[slug]/+page.server";

const mocks = vi.hoisted(() => {
	const goalRow = { value: null as Record<string, unknown> | null };
	const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
	const update = vi.fn().mockReturnValue({ set });
	const findFirst = vi.fn().mockImplementation(async () => goalRow.value);
	const authUser = { value: null as { id: number; username: string } | null };
	return { goalRow, set, update, findFirst, authUser };
});

vi.mock("$lib/db/client", () => ({
	db: {
		update: mocks.update,
		query: {
			goals: {
				findFirst: mocks.findFirst,
			},
		},
	},
}));

vi.mock("$lib/server/utils/auth-guard", () => ({
	getAuthUser: vi.fn(() => mocks.authUser.value),
	requireAuth: vi.fn(() => mocks.authUser.value),
}));

vi.mock("$lib/server/logger", () => ({
	devLog: vi.fn(),
	logError: vi.fn(),
	logFormData: vi.fn(),
	isVerboseDebug: vi.fn(() => false),
}));

function makeRequest(fields: Record<string, string>) {
	return new Request("http://localhost/goals/test-goal?/editGoal", {
		method: "POST",
		body: new URLSearchParams(fields),
	});
}

const baseContext = {
	params: { slug: "test-goal" },
	locals: { user: { id: 1, username: "tester" } },
};

describe("editGoal action", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.authUser.value = { id: 1, username: "tester" };
	});

	it("updates name and target, then redirects", async () => {
		mocks.goalRow.value = {
			id: 7,
			slug: "test-goal",
			userId: 1,
			currentAllocation: 100000, // £1,000
			deletedAt: null,
		};

		await expect(
			actions.editGoal({
				...baseContext,
				request: makeRequest({ name: "New Name", target_amount: "2000" }),
			} as any),
		).rejects.toMatchObject({ status: 303, location: "/goals/test-goal" });

		expect(mocks.update).toHaveBeenCalledTimes(1);
		const setArg = mocks.set.mock.calls[0][0] as Record<string, unknown>;
		expect(setArg.name).toBe("New Name");
		expect(setArg.targetAmountInCents).toBe(200000);
	});

	it("rejects a target below the current allocation without writing", async () => {
		mocks.goalRow.value = {
			id: 7,
			slug: "test-goal",
			userId: 1,
			currentAllocation: 500000, // £5,000
			deletedAt: null,
		};

		const result = (await actions.editGoal({
			...baseContext,
			request: makeRequest({ name: "New Name", target_amount: "100" }),
		} as any)) as { status: number; data: { error: string } };

		expect(result.status).toBe(400);
		expect(result.data.error).toBe(
			"Target below current allocation £5000.00",
		);
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("fails closed when the goal belongs to another user", async () => {
		mocks.goalRow.value = {
			id: 7,
			slug: "test-goal",
			userId: 2,
			currentAllocation: 100000,
			deletedAt: null,
		};

		await expect(
			actions.editGoal({
				...baseContext,
				request: makeRequest({ name: "New Name", target_amount: "2000" }),
			} as any),
		).rejects.toThrow(/permission/i);

		expect(mocks.update).not.toHaveBeenCalled();
	});
});
