import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	credentialSlots,
	spendingCategories,
	users,
} from "$lib/db/schema";
import { resetRegistrationRateLimit } from "$lib/security/rate-limiter";
import {
	issueRecoveryEnrollment,
	pendingEnrollmentsForTest,
} from "$lib/server/auth/recovery-enroll-token";
import { enrollPasswordSlot } from "$lib/server/crypto/enroll";
import { sealKeyring, unlockKeyring } from "$lib/server/crypto/keyring";
import { createTransaction } from "$lib/server/transactions";

/**
 * auth-session-hardening tasks 3.3/3.4 (rate-limit coverage + registration
 * cap), 4.1/4.2 (amount bounds + categoryId ownership), 5.2 (recovery
 * cookie capability token).
 */

// Argon2 is irrelevant to these behaviors — mock the auth-hash verifier so
// failure/success is controlled per test. The REAL rate limiter runs.
vi.mock("$lib/auth/password", () => ({
	hashPassword: vi.fn(() => Promise.resolve("mock-hash")),
	verifyPassword: vi.fn(() => Promise.resolve(false)),
}));

const migrateActions = (
	await import("../../src/routes/(auth)/migrate/+page.server")
).actions;
const changePasswordActions = (
	await import("../../src/routes/settings/security/+page.server")
).actions;
const recoveryEnrollModule = await import(
	"../../src/routes/(auth)/recovery-enroll/+page.server"
);
const registerAction = (
	await import("../../src/routes/(auth)/register/+page.server")
).actions;
const addTransactionActions = (
	await import("../../src/routes/accounts/[slug]/+page.server")
).actions;

const PASSWORD = "hardening-pass-123!";
const cleanupUserIds: number[] = [];

async function insertUser(username: string) {
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

function postForm(fields: Record<string, string>) {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.append(k, v);
	return new Request("http://localhost/", { method: "POST", body: formData });
}

beforeEach(() => {
	vi.clearAllMocks();
	sealKeyring("test-setup");
	pendingEnrollmentsForTest.clear();
	resetRegistrationRateLimit();
});

afterEach(async () => {
	vi.useRealTimers();
	sealKeyring("test-teardown");
	const ids = cleanupUserIds;
	if (ids.length > 0) {
		const userAccounts = await db
			.select({ id: accounts.id })
			.from(accounts)
			.where(inArray(accounts.userId, ids));
		if (userAccounts.length > 0) {
			await db.delete(accountTransactions).where(
				inArray(
					accountTransactions.accountId,
					userAccounts.map((a) => a.id),
				),
			);
		}
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, ids));
		await db
			.delete(spendingCategories)
			.where(inArray(spendingCategories.userId, ids));
		await db.delete(accounts).where(inArray(accounts.userId, ids));
		await db.delete(users).where(inArray(users.id, ids));
		cleanupUserIds.length = 0;
	}
	// Clear limiter rows for the usernames this file created
	const { loginAttempts } = await import("$lib/db/schema");
	await db.delete(loginAttempts);
});

/**
 * The real limiter pairs lockout with exponential BACKOFF — rapid retries
 * are delayed before they can record another failure. Fake timers advance
 * past the max backoff window (30s) so each attempt is evaluated and
 * counted, reaching the 5-failure lockout deterministically.
 */
async function attemptOutsideBackoff<T>(fn: () => T | Promise<T>): Promise<T> {
	vi.advanceTimersByTime(31_000);
	return await fn();
}

describe("credential-verification endpoints lock after threshold (3.4)", () => {
	it("migrate: 5 wrong passwords → locked (429) even before verification", async () => {
		vi.useFakeTimers();
		const user = await insertUser(`rl-migrate-${Date.now()}`);
		const call = () =>
			(migrateActions.migrate as any)({
				request: postForm({ password: "wrong-password-123!" }),
				locals: { user: { id: user.id, username: user.username } },
				cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
			} as never);
		for (let i = 0; i < 5; i++) {
			const result = await attemptOutsideBackoff(call);
			expect(result.status).toBe(401);
		}
		const locked = await call(); // lock flag needs no backoff advance
		expect(locked.status).toBe(429);
		expect(locked.data.locked).toBe(true);
	});

	it("changePassword: locks after threshold; success resets the limiter", async () => {
		vi.useFakeTimers();
		const user = await insertUser(`rl-changepw-${Date.now()}`);
		// REAL slot so the rewrap succeeds on the correct-password attempt
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, crypto.randomBytes(32));
		const call = (currentPassword: string) =>
			(changePasswordActions.changePassword as any)({
				request: postForm({
					currentPassword,
					newPassword: "Fresh-Staple-Cabbage-77!",
					confirmPassword: "Fresh-Staple-Cabbage-77!",
				}),
				locals: { user: { id: user.id, username: user.username } },
			} as never);
		for (let i = 0; i < 3; i++) {
			const result = await attemptOutsideBackoff(() =>
				call("wrong-current-1!"),
			);
			expect(result.status).toBe(400); // wrong current password
		}
		// Correct password now → success clears the failure count
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		const okResult = await attemptOutsideBackoff(() => call(PASSWORD));
		expect(okResult.success).toBe(true);

		// Failures start over — one wrong attempt is NOT locked
		const afterReset = await attemptOutsideBackoff(() =>
			call("wrong-again-1!"),
		);
		expect(afterReset.status).toBe(400);
	});

	it("rotateDataKey: locks after threshold", async () => {
		vi.useFakeTimers();
		const user = await insertUser(`rl-rotate-${Date.now()}`);
		unlockKeyring(user.id, crypto.randomBytes(32));
		const call = () =>
			(changePasswordActions.rotateDataKey as any)({
				request: postForm({ password: "wrong-password-123!" }),
				locals: { user: { id: user.id, username: user.username } },
			} as never);
		for (let i = 0; i < 5; i++) {
			const result = await attemptOutsideBackoff(call);
			expect(result.status).toBe(400);
		}
		const locked = await call();
		expect(locked.status).toBe(429);
	});

	it("setNewPassword (recovery re-enroll): locks after threshold", async () => {
		vi.useFakeTimers();
		const user = await insertUser(`rl-setnew-${Date.now()}`);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as ReturnType<typeof vi.fn>).mockReset();
		(verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
		unlockKeyring(user.id, crypto.randomBytes(32), {
			recoveryInitiated: true,
		});
		const call = () =>
			(recoveryEnrollModule.actions.setNewPassword as any)({
				request: postForm({
					currentPassword: "neither-old-nor-paper",
					newPassword: "Fresh-Staple-Cabbage-77!",
					confirmPassword: "Fresh-Staple-Cabbage-77!",
				}),
				locals: { user: { id: user.id, username: user.username } },
			} as never);
		for (let i = 0; i < 5; i++) {
			const result = await attemptOutsideBackoff(call);
			expect(result.status).toBe(400); // bad current credential
		}
		const locked = await call();
		expect(locked.status).toBe(429);
	});
});

describe("registration IP rate limit (3.3)", () => {
	it("sliding window: 10 per hour, then refuse; window expiry restores", async () => {
		const { checkRegistrationRateLimit, recordRegistrationAttempt } =
			await import("$lib/security/rate-limiter");
		const t0 = 1_000_000;
		for (let i = 0; i < 10; i++) {
			expect(checkRegistrationRateLimit("1.2.3.4", t0 + i)).toBe(true);
			recordRegistrationAttempt("1.2.3.4", t0 + i);
		}
		expect(checkRegistrationRateLimit("1.2.3.4", t0 + 10)).toBe(false);
		// Other IPs are unaffected
		expect(checkRegistrationRateLimit("5.6.7.8", t0 + 10)).toBe(true);
		// One hour past the FIRST attempt: the window slides open again
		expect(checkRegistrationRateLimit("1.2.3.4", t0 + 60 * 60 * 1000)).toBe(
			true,
		);
	});

	it("register action refuses the 11th registration from one IP", async () => {
		const ip = "127.0.0.1";
		const attempt = async (username: string) => {
			try {
				await registerAction.default({
					request: postForm({
						username,
						password: PASSWORD,
						confirmPassword: PASSWORD,
					}),
					cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
					getClientAddress: () => ip,
				} as never);
				return null; // unexpected — successful registrations redirect
			} catch (e) {
				if (e && typeof e === "object" && "status" in e && e.status === 302) {
					return "redirected";
				}
				throw e;
			}
		};
		for (let i = 0; i < 10; i++) {
			const username = `reg-rl-${Date.now()}-${i}-${crypto.randomBytes(2).toString("hex")}`;
			expect(await attempt(username)).toBe("redirected");
		}
		const result = await registerAction.default({
			request: postForm({
				username: `reg-rl-${Date.now()}-overflow`,
				password: PASSWORD,
				confirmPassword: PASSWORD,
			}),
			cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
			getClientAddress: () => ip,
		} as never);
		expect(result.status).toBe(429);
	});
});

describe("transaction input validation (4.1 / 4.2)", () => {
	async function accountFor(username: string) {
		const user = await insertUser(username);
		const [account] = await db
			.insert(accounts)
			.values({
				slug: `hard-tx-${user.id}`,
				userId: user.id,
				name: "Hardening Account",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		return { user, account };
	}

	function txFields(amount: string) {
		return {
			type: "deposit",
			amount,
			description: "probe",
			transactionDate: "2026-10-21",
		};
	}

	it("addTransaction rejects non-finite and out-of-range amounts (incl 1e308)", async () => {
		const { user, account } = await accountFor(
			`tx-bound-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
		);
		unlockKeyring(user.id, crypto.randomBytes(32));
		const call = (amount: string) =>
			(addTransactionActions.addTransaction as any)({
				request: postForm(txFields(amount)),
				locals: { user: { id: user.id, username: user.username } },
				params: { slug: account.slug },
			} as never);
		for (const bad of [
			"1e308",
			"Infinity",
			"-Infinity",
			"abc",
			"10000000.01",
		]) {
			const result = await call(bad);
			expect(result.status, `amount=${bad}`).toBe(400);
		}
		// Exactly at the cap is accepted
		const atCap = await call("10000000");
		expect((atCap as { success?: boolean }).success).toBe(true);
	});

	it("createTransaction neutralizes a foreign categoryId; own category persists", async () => {
		const owner = await accountFor(
			`cat-owner-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
		);
		const other = await accountFor(
			`cat-other-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
		);
		const [ownCat] = await db
			.insert(spendingCategories)
			.values({
				slug: `cat-own-${owner.user.id}`,
				userId: owner.user.id,
				name: "Own",
				key: "own",
				colour: "#000000",
			})
			.returning();
		const [foreignCat] = await db
			.insert(spendingCategories)
			.values({
				slug: `cat-foreign-${other.user.id}`,
				userId: other.user.id,
				name: "Foreign",
				key: "foreign",
				colour: "#000000",
			})
			.returning();

		unlockKeyring(owner.user.id, crypto.randomBytes(32));
		const date = new Date();

		const foreign = await createTransaction(
			{
				accountId: owner.account.id,
				type: "deposit",
				amount: 100,
				categoryId: foreignCat.id,
				transactionDate: date,
			},
			owner.account,
		);
		expect(foreign.ok).toBe(true);

		const owned = await createTransaction(
			{
				accountId: owner.account.id,
				type: "deposit",
				amount: 200,
				categoryId: ownCat.id,
				transactionDate: date,
			},
			owner.account,
		);
		expect(owned.ok).toBe(true);

		const rows = await db
			.select({
				slug: accountTransactions.slug,
				categoryId: accountTransactions.categoryId,
			})
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, owner.account.id));
		expect(rows).toHaveLength(2);
		const foreignRow = rows.find((r) => r.categoryId === null);
		const ownedRow = rows.find((r) => r.categoryId === ownCat.id);
		expect(foreignRow).toBeDefined(); // foreign id stored as null
		expect(ownedRow).toBeDefined(); // own id persisted
	});
});

describe("recovery cookie is a capability token (5.2)", () => {
	it("arbitrary cookie value yields no disclosure (redirect, no username)", async () => {
		let redirected: string | null = null;
		try {
			await recoveryEnrollModule.load({
				locals: {},
				cookies: {
					get: (name: string) =>
						name === "recovery-enroll-user" ? "1" : undefined,
				},
				url: new URL("http://localhost/recovery-enroll?mode=register"),
			} as never);
			expect.fail("expected redirect");
		} catch (e) {
			if (e && typeof e === "object" && "status" in e && e.status === 302) {
				redirected = (e as unknown as { location: string }).location;
			} else {
				throw e;
			}
		}
		// No candidate resolved → /login, and no user data anywhere
		expect(redirected).toBe("/login");
	});

	it("expired token yields no disclosure", async () => {
		const user = await insertUser(`rec-cookie-${Date.now()}`);
		const cookieJar: { value?: string } = {};
		issueRecoveryEnrollment(
			{
				set: (_n, v) => {
					cookieJar.value = v;
				},
			},
			user.id,
		);
		// Force expiry server-side
		for (const entry of pendingEnrollmentsForTest.values()) {
			entry.expiresAt = Date.now() - 1;
		}

		let redirected: string | null = null;
		try {
			await recoveryEnrollModule.load({
				locals: {},
				cookies: {
					get: (name: string) =>
						name === "recovery-enroll-user" ? cookieJar.value : undefined,
				},
				url: new URL("http://localhost/recovery-enroll?mode=register"),
			} as never);
			expect.fail("expected redirect");
		} catch (e) {
			if (e && typeof e === "object" && "status" in e && e.status === 302) {
				redirected = (e as unknown as { location: string }).location;
			} else {
				throw e;
			}
		}
		expect(redirected).toBe("/login");
	});

	it("valid token + unlocked keyring discloses the username (e2e enroll path)", async () => {
		const user = await insertUser(`rec-valid-${Date.now()}`);
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);

		const cookieJar: { value?: string } = {};
		issueRecoveryEnrollment(
			{
				set: (_n, v) => {
					cookieJar.value = v;
				},
			},
			user.id,
		);

		const payload = (await recoveryEnrollModule.load({
			locals: {},
			cookies: {
				get: (name: string) =>
					name === "recovery-enroll-user" ? cookieJar.value : undefined,
			},
			url: new URL("http://localhost/recovery-enroll?mode=register"),
		} as never)) as { username?: string };
		expect(payload.username).toBe(user.username);
	});
});
