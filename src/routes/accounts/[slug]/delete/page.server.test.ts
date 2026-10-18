import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import {
	accountNotes,
	accounts,
	accountTransactions,
	interestRates,
	users,
} from "$lib/db/schema";
import { actions, load } from "./+page.server";

describe("Account delete/close page — empty-accounts-only destructive delete", () => {
	let testUserId: number;
	let otherUserId: number;
	const createdUserIds: number[] = [];
	const createdAccountIds: number[] = [];

	function uniqueName(prefix: string): string {
		return `${prefix} ${nanoid(6)}`;
	}

	async function insertUser(): Promise<number> {
		const [user] = await db
			.insert(users)
			.values({
				username: `del-page-${Date.now()}-${nanoid(6)}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
			})
			.returning({ id: users.id });
		createdUserIds.push(user.id);
		return user.id;
	}

	async function insertAccount(
		userId: number,
		name: string,
	): Promise<{
		id: number;
		slug: string;
		name: string;
	}> {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(16),
				userId,
				name,
				type: "savings",
				taxWrapper: "none",
				category: "asset",
				excludedFromNetWorth: false,
			})
			.returning({ id: accounts.id, slug: accounts.slug, name: accounts.name });
		createdAccountIds.push(account.id);
		return account;
	}

	async function insertTx(
		accountId: number,
		amountCents: number,
	): Promise<void> {
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId,
			type: "deposit",
			amount: amountCents,
			description: "gate test",
			categoryId: null,
			transactionDate: new Date("2026-01-15T00:00:00.000Z"),
		});
	}

	async function insertNote(accountId: number): Promise<void> {
		await db.insert(accountNotes).values({
			slug: nanoid(21),
			accountId,
			content: "note attached to mistaken account",
		});
	}

	async function insertRate(accountId: number): Promise<void> {
		await db.insert(interestRates).values({
			accountId,
			rate: 425,
			effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
		});
	}

	async function callDeleteAccount(
		slug: string,
		confirmName: string,
		userId: number,
	) {
		const formData = new FormData();
		formData.set("confirmName", confirmName);
		return actions.deleteAccount({
			locals: { user: { id: userId } as User },
			params: { slug },
			request: new Request("http://localhost", {
				method: "POST",
				body: formData,
			}),
		} as unknown as Parameters<typeof actions.deleteAccount>[0]);
	}

	beforeEach(async () => {
		testUserId = await insertUser();
		otherUserId = await insertUser();
	});

	afterEach(async () => {
		const remaining = createdAccountIds.filter((id) => id !== undefined);
		if (remaining.length > 0) {
			await db
				.delete(accountNotes)
				.where(inArray(accountNotes.accountId, remaining));
			await db
				.delete(interestRates)
				.where(inArray(interestRates.accountId, remaining));
			await db
				.delete(accountTransactions)
				.where(inArray(accountTransactions.accountId, remaining));
			await db.delete(accounts).where(inArray(accounts.id, remaining));
		}
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		createdUserIds.length = 0;
		createdAccountIds.length = 0;
	});

	describe("deleteAccount — server-side empty-only gate", () => {
		it("refuses deletion for an account with transaction history and keeps everything", async () => {
			const name = uniqueName("Has History");
			const account = await insertAccount(testUserId, name);
			await insertTx(account.id, 10000);

			const result = await callDeleteAccount(account.slug, name, testUserId);

			expect(result).toMatchObject({ status: 400 });
			expect((result as { data?: { error?: string } }).data?.error).toContain(
				"close the account instead",
			);

			// Nothing was deleted
			const stillThere = await db.query.accounts.findFirst({
				where: eq(accounts.id, account.id),
			});
			expect(stillThere).toBeDefined();
		});

		it("refuses deletion when the typed confirmation does not match", async () => {
			const name = uniqueName("Typo Target");
			const account = await insertAccount(testUserId, name);

			const result = await callDeleteAccount(
				account.slug,
				"wrong name",
				testUserId,
			);

			expect(result).toMatchObject({ status: 400 });
			expect((result as { data?: { error?: string } }).data?.error).toContain(
				"does not match",
			);

			const stillThere = await db.query.accounts.findFirst({
				where: eq(accounts.id, account.id),
			});
			expect(stillThere).toBeDefined();
		});

		it("rejects cross-user deletion via access validation", async () => {
			const name = uniqueName("Other Users");
			const account = await insertAccount(testUserId, name);

			await expect(
				callDeleteAccount(account.slug, name, otherUserId),
			).rejects.toThrow(/permission/i);

			const stillThere = await db.query.accounts.findFirst({
				where: eq(accounts.id, account.id),
			});
			expect(stillThere).toBeDefined();
		});

		it("atomically removes account + notes + rate history for an empty account", async () => {
			const name = uniqueName("Mistake");
			const account = await insertAccount(testUserId, name);
			await insertNote(account.id);
			await insertNote(account.id);
			await insertRate(account.id);

			await expect(
				callDeleteAccount(account.slug, name, testUserId),
			).rejects.toMatchObject({ status: 303 }); // redirect = success

			// All rows gone — atomicity
			expect(
				await db.query.accounts.findFirst({
					where: eq(accounts.id, account.id),
				}),
			).toBeUndefined();
			expect(
				await db.query.accountNotes.findMany({
					where: eq(accountNotes.accountId, account.id),
				}),
			).toHaveLength(0);
			expect(
				await db.query.interestRates.findMany({
					where: eq(interestRates.accountId, account.id),
				}),
			).toHaveLength(0);
		});

		it("refuses deletion of a closed account", async () => {
			const name = uniqueName("Already Closed");
			const account = await insertAccount(testUserId, name);
			await db
				.update(accounts)
				.set({ closedAt: new Date("2026-09-01T00:00:00.000Z") })
				.where(eq(accounts.id, account.id));

			const result = await callDeleteAccount(account.slug, name, testUserId);

			expect(result).toMatchObject({ status: 400 });
			expect((result as { data?: { error?: string } }).data?.error).toContain(
				"Closed accounts cannot be deleted",
			);
		});
	});

	describe("closeAccount — visible feedback (audit #10)", () => {
		it("closes an open account and redirects with a success flag", async () => {
			const account = await insertAccount(testUserId, uniqueName("Closer"));

			await expect(
				actions.closeAccount({
					locals: { user: { id: testUserId } as User },
					params: { slug: account.slug },
				} as unknown as Parameters<typeof actions.closeAccount>[0]),
			).rejects.toMatchObject({ status: 303 });

			const closed = await db.query.accounts.findFirst({
				where: eq(accounts.id, account.id),
			});
			expect(closed?.closedAt).not.toBeNull();
			expect(closed?.deletedAt).toBeNull(); // close is NOT delete
		});

		it("returns a renderable failure for an already-closed account", async () => {
			const account = await insertAccount(testUserId, uniqueName("Twice"));
			await db
				.update(accounts)
				.set({ closedAt: new Date("2026-09-01T00:00:00.000Z") })
				.where(eq(accounts.id, account.id));

			const result = await actions.closeAccount({
				locals: { user: { id: testUserId } as User },
				params: { slug: account.slug },
			} as unknown as Parameters<typeof actions.closeAccount>[0]);

			expect(result).toMatchObject({ status: 400 });
			expect((result as { data?: { error?: string } }).data?.error).toContain(
				"already closed",
			);
		});
	});

	describe("load — typed disclosure", () => {
		async function loadPage(slug: string) {
			const result = await load({
				locals: { user: { id: testUserId } as User },
				params: { slug },
			} as Parameters<typeof load>[0]);
			if (!result) throw new Error("Expected load data");
			return result;
		}

		it("discloses note and rate-history counts for an empty account", async () => {
			const account = await insertAccount(testUserId, uniqueName("Disclose"));
			await insertNote(account.id);
			await insertRate(account.id);

			const result = await loadPage(account.slug);

			expect(result.transactionCount).toBe(0);
			expect(result.noteCount).toBe(1);
			expect(result.rateCount).toBe(1);
		});

		it("reports transaction count for accounts with history (no delete affordance)", async () => {
			const account = await insertAccount(testUserId, uniqueName("History"));
			await insertTx(account.id, 10000);

			const result = await loadPage(account.slug);

			expect(result.transactionCount).toBe(1);
		});

		it("redirects closed accounts away from the close/delete page", async () => {
			const account = await insertAccount(testUserId, uniqueName("Redirect"));
			await db
				.update(accounts)
				.set({ closedAt: new Date("2026-09-01T00:00:00.000Z") })
				.where(eq(accounts.id, account.id));

			await expect(loadPage(account.slug)).rejects.toMatchObject({
				status: 303,
			});
		});
	});
});
