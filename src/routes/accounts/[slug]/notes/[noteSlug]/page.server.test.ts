import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import { accountNotes, accounts, users } from "$lib/db/schema";
import { load } from "./+page.server";

describe("Note Detail Page Load", () => {
	let testUserId: number;
	let testAccountId: number;
	let testAccountSlug: string;
	let testNoteSlug: string;
	let createdUserIds: number[] = [];
	let createdAccountIds: number[] = [];
	type LoadInput = Parameters<typeof load>[0];

	beforeEach(async () => {
		const timestamp = Date.now();
		const [user] = await db
			.insert(users)
			.values({
				username: `test-note-detail-${timestamp}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);

		const [account] = await db
			.insert(accounts)
			.values({
				slug: `test-note-account-${timestamp}`,
				userId: testUserId,
				name: "Test Account",
				type: "savings",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		testAccountId = account.id;
		testAccountSlug = account.slug;
		createdAccountIds.push(account.id);

		const [note] = await db
			.insert(accountNotes)
			.values({
				slug: `testnoteslug21chars${timestamp}`,
				accountId: testAccountId,
				content: "This is a test note with substantial content",
			})
			.returning();
		testNoteSlug = note.slug;
	});

	afterEach(async () => {
		if (createdAccountIds.length > 0) {
			await db
				.delete(accountNotes)
				.where(inArray(accountNotes.accountId, createdAccountIds));
		}
		for (const accountId of createdAccountIds) {
			await db.delete(accounts).where(eq(accounts.id, accountId));
		}
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		createdUserIds = [];
		createdAccountIds = [];
	});

	it("should load note with account context for owner", async () => {
		const locals: LoadInput["locals"] = { user: { id: testUserId } as User };
		const params = { slug: testAccountSlug, noteSlug: testNoteSlug };
		const input = {
			locals,
			params,
			url: new URL("http://localhost"),
		} as unknown as LoadInput;

		const result = await load(input);
		if (!result) throw new Error("Expected load data");
		const data = result;

		expect(data.note).toBeDefined();
		expect(data.note.content).toBe(
			"This is a test note with substantial content",
		);
		expect(data.account.slug).toBe(testAccountSlug);
	});

	it("should return 404 for non-existent note", async () => {
		const locals: LoadInput["locals"] = { user: { id: testUserId } as User };
		const params = { slug: testAccountSlug, noteSlug: "nonexistent" };

		const input = {
			locals,
			params,
			url: new URL("http://localhost"),
		} as unknown as LoadInput;
		await expect(load(input)).rejects.toThrow();
	});

	it("should return 404 for note belonging to different user", async () => {
		const [otherUser] = await db
			.insert(users)
			.values({
				username: `other-user-${Date.now()}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		createdUserIds.push(otherUser.id);

		const locals: LoadInput["locals"] = { user: { id: otherUser.id } as User };
		const params = { slug: testAccountSlug, noteSlug: testNoteSlug };

		const input = {
			locals,
			params,
			url: new URL("http://localhost"),
		} as unknown as LoadInput;
		await expect(load(input)).rejects.toThrow();
	});
});
