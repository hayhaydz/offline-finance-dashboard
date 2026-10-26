import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import { goalAllocations, goals, users } from "$lib/db/schema";
import { actions } from "./+page.server";

describe("Savings goal archive — typed confirmation enforced server-side", () => {
	let testUserId: number;
	const createdUserIds: number[] = [];
	const createdGoalIds: number[] = [];

	function uniqueName(prefix: string): string {
		return `${prefix} ${nanoid(6)}`;
	}

	async function insertUser(): Promise<number> {
		const [user] = await db
			.insert(users)
			.values({
				username: `sav-arch-${Date.now()}-${nanoid(6)}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
			})
			.returning({ id: users.id });
		createdUserIds.push(user.id);
		return user.id;
	}

	async function insertSavingsGoal(userId: number, name: string) {
		const [goal] = await db
			.insert(goals)
			.values({
				slug: nanoid(21),
				userId,
				name,
				targetAmountInCents: 100000,
				currentAllocation: 25000,
				goalType: "savings",
				sortOrder: 1,
			})
			.returning({ id: goals.id, slug: goals.slug, name: goals.name });
		createdGoalIds.push(goal.id);
		return goal;
	}

	async function callDefaultAction(
		slug: string,
		confirmName: string,
		userId: number,
	) {
		const formData = new FormData();
		formData.set("confirmName", confirmName);
		return actions.default({
			locals: { user: { id: userId } as User },
			params: { slug },
			request: new Request("http://localhost", {
				method: "POST",
				body: formData,
			}),
		} as unknown as Parameters<typeof actions.default>[0]);
	}

	beforeEach(async () => {
		testUserId = await insertUser();
	});

	afterEach(async () => {
		for (const id of createdGoalIds) {
			await db.delete(goalAllocations).where(eq(goalAllocations.goalId, id));
			await db.delete(goals).where(eq(goals.id, id));
		}
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		createdGoalIds.length = 0;
		createdUserIds.length = 0;
	});

	it("refuses archive when the typed name does not match", async () => {
		const name = uniqueName("Savings Typo");
		const goal = await insertSavingsGoal(testUserId, name);

		const result = await callDefaultAction(goal.slug, "wrong name", testUserId);

		expect(result).toMatchObject({ status: 400 });
		expect((result as { data?: { error?: string } }).data?.error).toContain(
			"does not match",
		);

		const unchanged = await db.query.goals.findFirst({
			where: eq(goals.id, goal.id),
		});
		expect(unchanged?.deletedAt).toBeNull();
		// No funds were returned to Ready to Assign
		expect(
			await db.query.goalAllocations.findMany({
				where: eq(goalAllocations.goalId, goal.id),
			}),
		).toHaveLength(0);
	});

	it("archives, returns funds, and redirects when the typed name matches", async () => {
		const name = uniqueName("Savings Match");
		const goal = await insertSavingsGoal(testUserId, name);

		await expect(
			callDefaultAction(goal.slug, name, testUserId),
		).rejects.toMatchObject({ status: 303 });

		const archived = await db.query.goals.findFirst({
			where: eq(goals.id, goal.id),
		});
		expect(archived?.deletedAt).not.toBeNull();

		const allocations = await db.query.goalAllocations.findMany({
			where: eq(goalAllocations.goalId, goal.id),
		});
		expect(allocations).toHaveLength(1);
		expect(allocations[0].type).toBe("GOAL_DELETED");
		expect(allocations[0].amount).toBe(-25000);
	});
});
