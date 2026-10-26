import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import { goals, users } from "$lib/db/schema";
import { actions } from "./+page.server";

describe("Debt goal archive — typed confirmation enforced server-side", () => {
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
				username: `debt-arch-${Date.now()}-${nanoid(6)}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
			})
			.returning({ id: users.id });
		createdUserIds.push(user.id);
		return user.id;
	}

	async function insertDebtGoal(userId: number, name: string) {
		const [goal] = await db
			.insert(goals)
			.values({
				slug: nanoid(21),
				userId,
				name,
				targetAmountInCents: 500000,
				goalType: "debt",
				sortOrder: 1,
			})
			.returning({ id: goals.id, slug: goals.slug, name: goals.name });
		createdGoalIds.push(goal.id);
		return goal;
	}

	async function callArchiveGoal(
		slug: string,
		confirmName: string,
		userId: number,
	) {
		const formData = new FormData();
		formData.set("confirmName", confirmName);
		return actions.archiveGoal({
			locals: { user: { id: userId } as User },
			params: { slug },
			request: new Request("http://localhost", {
				method: "POST",
				body: formData,
			}),
		} as unknown as Parameters<typeof actions.archiveGoal>[0]);
	}

	beforeEach(async () => {
		testUserId = await insertUser();
	});

	afterEach(async () => {
		for (const id of createdGoalIds) {
			await db.delete(goals).where(eq(goals.id, id));
		}
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		createdGoalIds.length = 0;
		createdUserIds.length = 0;
	});

	it("refuses archive when the typed name does not match", async () => {
		const name = uniqueName("Debt Typo");
		const goal = await insertDebtGoal(testUserId, name);

		const result = await callArchiveGoal(goal.slug, "wrong name", testUserId);

		expect(result).toMatchObject({ status: 400 });
		expect((result as { data?: { error?: string } }).data?.error).toContain(
			"does not match",
		);

		const unchanged = await db.query.goals.findFirst({
			where: eq(goals.id, goal.id),
		});
		expect(unchanged?.deletedAt).toBeNull();
	});

	it("archives and redirects when the typed name matches", async () => {
		const name = uniqueName("Debt Match");
		const goal = await insertDebtGoal(testUserId, name);

		// Redirect = success (the redirect exception must not be swallowed)
		await expect(
			callArchiveGoal(goal.slug, name, testUserId),
		).rejects.toMatchObject({ status: 303 });

		const archived = await db.query.goals.findFirst({
			where: eq(goals.id, goal.id),
		});
		expect(archived?.deletedAt).not.toBeNull();
	});
});
