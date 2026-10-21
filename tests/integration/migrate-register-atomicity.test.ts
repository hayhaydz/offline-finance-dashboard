import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	credentialSlots,
	users,
} from "$lib/db/schema";
import { getActiveSlots } from "$lib/server/crypto/enroll";
import { keyringStatus, sealKeyring } from "$lib/server/crypto/keyring";

/**
 * crypto-rotation-safety tasks 2.1–2.3:
 * - /migrate succeeds for a slot-LESS legacy user on the first attempt (the
 *   old flow unwrapped a password slot before creating it — always 500)
 * - registration is atomic: a password-slot failure leaves NO user row
 *   (username stays available)
 */

vi.mock("$lib/auth/password", () => ({
	hashPassword: vi.fn(() => Promise.resolve("mock-hash")),
	verifyPassword: vi.fn(() => Promise.resolve(true)),
}));

// envelope.wrapSlot is delegating-mocked so a single enrollment can be made
// to fail (task 2.3: simulated slot failure) while everything else stays real.
const wrapSlotMock = vi.hoisted(() => vi.fn());
vi.mock("$lib/server/crypto/envelope", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("$lib/server/crypto/envelope")>();
	wrapSlotMock.mockImplementation(
		(dataKey: Uint8Array, slotKey: Uint8Array, aad: never) =>
			actual.wrapSlot(dataKey, slotKey, aad),
	);
	return { ...actual, wrapSlot: wrapSlotMock };
});

const migrateActions = (
	await import("../../src/routes/(auth)/migrate/+page.server")
).actions;
const registerActions = (
	await import("../../src/routes/(auth)/register/+page.server")
).actions;

const PASSWORD = "migrate-register-pass-1!";
const cleanupUserIds: number[] = [];

async function insertLegacyUser(username: string) {
	const [user] = await db
		.insert(users)
		.values({
			username,
			passwordHash: "mock-hash",
			passwordSalt: crypto.randomBytes(16).toString("hex"),
			totpSecret: "REMOVED",
			totpSecretIV: "REMOVED",
		})
		.returning();
	cleanupUserIds.push(user.id);
	return user;
}

function cookiesStub() {
	return { set: vi.fn(), get: vi.fn(() => undefined), delete: vi.fn() };
}

beforeEach(() => {
	vi.clearAllMocks();
	sealKeyring("test-setup");
});

afterEach(async () => {
	sealKeyring("test-teardown");
	if (cleanupUserIds.length > 0) {
		const userAccounts = await db
			.select({ id: accounts.id })
			.from(accounts)
			.where(inArray(accounts.userId, cleanupUserIds));
		if (userAccounts.length > 0) {
			await db
				.delete(accountTransactions)
				.where(
					inArray(
						accountTransactions.accountId,
						userAccounts.map((a) => a.id),
					),
				);
		}
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, cleanupUserIds));
		await db.delete(accounts).where(inArray(accounts.userId, cleanupUserIds));
		await db.delete(users).where(inArray(users.id, cleanupUserIds));
		cleanupUserIds.length = 0;
	}
});

describe("/migrate action (task 2.1)", () => {
	it("succeeds for a slot-less legacy user on the FIRST attempt (no 500)", async () => {
		const user = await insertLegacyUser(
			`mig-user-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
		);

		// Legacy plaintext data
		const [account] = await db
			.insert(accounts)
			.values({
				slug: `mig-atomic-${user.id}`,
				userId: user.id,
				name: "Legacy",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		const txSlug = `mig-atomic-tx-${user.id}`;
		await db.insert(accountTransactions).values({
			slug: txSlug,
			accountId: account.id,
			type: "deposit",
			amount: 100,
			description: "Plaintext legacy",
			transactionDate: new Date(),
		});

		const formData = new FormData();
		formData.append("password", PASSWORD);

		const result = await migrateActions.migrate(
			{
				request: new Request("http://localhost/migrate", {
					method: "POST",
					body: formData,
				}),
				locals: { user: { id: user.id, username: user.username } },
				cookies: cookiesStub(),
			} as never,
		);

		// The old flow 500'd here (unwrap before slot creation); now the
		// migration completes and unlocks with the DataKey it produced.
		expect(result).not.toHaveProperty("status");
		expect((result as { success?: boolean }).success).toBe(true);
		expect(keyringStatus().state).toBe("unlocked");
		expect(keyringStatus().userId).toBe(user.id);

		// Password slot created; row encrypted
		expect(await getActiveSlots(db, user.id, "password")).toHaveLength(1);
		const [row] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, txSlug));
		expect(row.description?.startsWith("v1|")).toBe(true);
	});

	it("already-enrolled user is redirected (resume guard)", async () => {
		const user = await insertLegacyUser(
			`mig-resume-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
		);
		// Give the user an envelope (slot exists = resume scenario)
		const { enrollPasswordSlot } = await import("$lib/server/crypto/enroll");
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});

		const formData = new FormData();
		formData.append("password", PASSWORD);

		let redirected: string | null = null;
		try {
			await migrateActions.migrate(
				{
					request: new Request("http://localhost/migrate", {
						method: "POST",
						body: formData,
					}),
					locals: { user: { id: user.id, username: user.username } },
					cookies: cookiesStub(),
				} as never,
			);
			expect.fail("expected redirect");
		} catch (e) {
			if (e && typeof e === "object" && "status" in e && e.status === 302) {
				redirected = (e as unknown as { location: string }).location;
			} else {
				throw e;
			}
		}
		expect(redirected).toBe("/");
	});
});

describe("registration atomicity (task 2.2)", () => {
	it("happy path: user + password slot commit together", async () => {
		const username = `reg-ok-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
		const formData = new FormData();
		formData.append("username", username);
		formData.append("password", PASSWORD);
		formData.append("confirmPassword", PASSWORD);

		let redirected: string | null = null;
		try {
			await registerActions.default({
				request: new Request("http://localhost/register", {
					method: "POST",
					body: formData,
				}),
				cookies: cookiesStub(),
				getClientAddress: () => "127.0.0.1",
			} as never);
			expect.fail("expected redirect");
		} catch (e) {
			if (e && typeof e === "object" && "status" in e && e.status === 302) {
				redirected = (e as unknown as { location: string }).location;
			} else {
				throw e;
			}
		}
		expect(redirected).toBe("/recovery-enroll?mode=register");

		const [row] = await db
			.select()
			.from(users)
			.where(eq(users.username, username));
		expect(row).toBeDefined();
		expect(await getActiveSlots(db, row.id, "password")).toHaveLength(1);
		expect(keyringStatus().userId).toBe(row.id);
	});

	it("slot-enrollment failure rolls the user insert back — username stays available", async () => {
		const username = `reg-fail-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
		const formData = new FormData();
		formData.append("username", username);
		formData.append("password", PASSWORD);
		formData.append("confirmPassword", PASSWORD);

		// Simulate the slot write failing inside the registration transaction
		wrapSlotMock.mockImplementationOnce(() => {
			throw new Error("simulated slot enrollment failure");
		});

		const result = await registerActions.default({
			request: new Request("http://localhost/register", {
				method: "POST",
				body: formData,
			}),
			cookies: cookiesStub(),
			getClientAddress: () => "127.0.0.1",
		} as never);

		expect((result as { status?: number }).status).toBe(500);

		// No orphan user: the username remains available
		const rows = await db
			.select()
			.from(users)
			.where(eq(users.username, username));
		expect(rows).toHaveLength(0);
	});
});
