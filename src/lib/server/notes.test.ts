import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accountNotes, accounts, users } from "$lib/db/schema";
import {
	createNote,
	deleteNote,
	getNoteBySlug,
	getNotesByAccountId,
} from "./notes";

describe("Account Notes CRUD", () => {
	let testUserId: number;
	let testAccountId: number;
	let createdUserIds: number[] = [];
	let createdAccountIds: number[] = [];

	beforeEach(async () => {
		// Create test user
		const [user] = await db
			.insert(users)
			.values({
				username: `test-user-notes-${Date.now()}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);

		// Create test account
		const [account] = await db
			.insert(accounts)
			.values({
				slug: `test-account-notes-${Date.now()}`,
				userId: testUserId,
				name: "Test Account",
				type: "savings",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		testAccountId = account.id;
		createdAccountIds.push(account.id);
	});

	// Cleanup after each test
	afterEach(async () => {
		// Delete notes first (foreign key constraint)
		if (createdAccountIds.length > 0) {
			await db
				.delete(accountNotes)
				.where(inArray(accountNotes.accountId, createdAccountIds));
		}
		// Delete accounts
		for (const accountId of createdAccountIds) {
			await db.delete(accounts).where(eq(accounts.id, accountId));
		}
		// Delete users
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		// Reset arrays
		createdUserIds = [];
		createdAccountIds = [];
	});

	it("should create a note with unique slug", async () => {
		const result = await createNote({
			accountId: testAccountId,
			content: "Test note content",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return; // type narrowing
		expect(result.data).toBeDefined();
		expect(result.data).toHaveLength(21);
	});

	it("should retrieve notes for account ordered by date desc", async () => {
		await createNote({ accountId: testAccountId, content: "First note" });
		await createNote({ accountId: testAccountId, content: "Second note" });

		const notes = await getNotesByAccountId(testAccountId);
		expect(notes).toHaveLength(2);
		expect(notes[0].content).toBe("Second note"); // Most recent first
	});

	it("should retrieve note by slug", async () => {
		const created = await createNote({
			accountId: testAccountId,
			content: "Find me by slug",
		});
		if (!created.ok) throw new Error("setup failed");

		const found = await getNoteBySlug(created.data);
		expect(found).toBeDefined();
		expect(found?.content).toBe("Find me by slug");
	});

	it("should delete note by slug", async () => {
		const created = await createNote({
			accountId: testAccountId,
			content: "Delete me",
		});
		if (!created.ok) throw new Error("setup failed");

		await deleteNote(created.data);

		const found = await getNoteBySlug(created.data);
		expect(found).toBeNull();
	});

	it("should return error when content exceeds max length", async () => {
		const result = await createNote({
			accountId: testAccountId,
			content: "x".repeat(5001), // exceeds limit
		});
		expect(result.ok).toBe(false);
		if (result.ok) return; // type narrowing
		expect(result.error).toContain("exceeds maximum length");
	});

	it("should return error when content is empty", async () => {
		const result = await createNote({
			accountId: testAccountId,
			content: "   ",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return; // type narrowing
		expect(result.error).toContain("cannot be empty");
	});
});
