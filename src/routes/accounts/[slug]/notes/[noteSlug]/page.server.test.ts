import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { load } from './+page.server';
import { db } from '$lib/db/client';
import { users, accounts, accountNotes } from '$lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

describe('Note Detail Page Load', () => {
	let testUserId: number;
	let testAccountId: number;
	let testAccountSlug: string;
	let testNoteSlug: string;
	let createdUserIds: number[] = [];
	let createdAccountIds: number[] = [];

	beforeEach(async () => {
		const timestamp = Date.now();
		const [user] = await db.insert(users).values({
			username: `test-note-detail-${timestamp}`,
			passwordHash: 'hash',
			totpSecret: 'secret',
			totpSecretIV: 'iv',
			passwordSalt: 'salt',
			taxBand: 'basic'
		}).returning();
		testUserId = user.id;
		createdUserIds.push(user.id);

		const [account] = await db.insert(accounts).values({
			slug: `test-note-account-${timestamp}`,
			userId: testUserId,
			name: 'Test Account',
			type: 'savings',
			taxWrapper: 'none',
			category: 'asset'
		}).returning();
		testAccountId = account.id;
		testAccountSlug = account.slug;
		createdAccountIds.push(account.id);

		const [note] = await db.insert(accountNotes).values({
			slug: `testnoteslug21chars${timestamp}`,
			accountId: testAccountId,
			content: 'This is a test note with substantial content'
		}).returning();
		testNoteSlug = note.slug;
	});

	afterEach(async () => {
		if (createdAccountIds.length > 0) {
			await db.delete(accountNotes).where(inArray(accountNotes.accountId, createdAccountIds));
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

	it('should load note with account context for owner', async () => {
		const locals = { user: { id: testUserId } };
		const params = { slug: testAccountSlug, noteSlug: testNoteSlug };

		const result = await load({ locals, params } as any);

		expect(result.note).toBeDefined();
		expect(result.note.content).toBe('This is a test note with substantial content');
		expect(result.account.slug).toBe(testAccountSlug);
	});

	it('should return 404 for non-existent note', async () => {
		const locals = { user: { id: testUserId } };
		const params = { slug: testAccountSlug, noteSlug: 'nonexistent' };

		await expect(load({ locals, params } as any)).rejects.toThrow();
	});

	it('should return 404 for note belonging to different user', async () => {
		const [otherUser] = await db.insert(users).values({
			username: `other-user-${Date.now()}`,
			passwordHash: 'hash',
			totpSecret: 'secret',
			totpSecretIV: 'iv',
			passwordSalt: 'salt',
			taxBand: 'basic'
		}).returning();
		createdUserIds.push(otherUser.id);

		const locals = { user: { id: otherUser.id } };
		const params = { slug: testAccountSlug, noteSlug: testNoteSlug };

		await expect(load({ locals, params } as any)).rejects.toThrow();
	});
});
