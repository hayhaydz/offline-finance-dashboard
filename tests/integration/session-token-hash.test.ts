import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "$lib/auth/session-token";
import { db } from "$lib/db/client";
import { sessions, users } from "$lib/db/schema";
import { sealKeyring } from "$lib/server/crypto/keyring";
import { actions as loginActions } from "../../src/routes/(auth)/login/+page.server";

/**
 * auth-session-hardening 2.1–2.2: session tokens are stored ONLY as
 * SHA-256 hashes; lookups hash the presented cookie value first.
 */

vi.mock("$lib/server/crypto/enroll", () => ({
	hasEnvelope: vi.fn(() => Promise.resolve(true)),
	unwrapPasswordSlot: vi.fn(() => Promise.resolve(crypto.randomBytes(32))),
	countActiveSlots: vi.fn(() => Promise.resolve(0)),
}));

vi.mock("$lib/server/crypto/keyring", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("$lib/server/crypto/keyring")>();
	return { ...actual, unlockKeyring: vi.fn() };
});

const PASSWORD = "session-hash-pass-1!";
const cleanupIds: number[] = [];

afterEach(async () => {
	sealKeyring("test-teardown");
	vi.restoreAllMocks();
	if (cleanupIds.length > 0) {
		await db.delete(sessions).where(inArray(sessions.userId, cleanupIds));
		await db.delete(users).where(inArray(users.id, cleanupIds));
		cleanupIds.length = 0;
	}
});

describe("session tokens hashed at rest", () => {
	it("hashSessionToken is a stable sha256 hex digest", () => {
		const token = crypto.randomBytes(32).toString("hex");
		const h = hashSessionToken(token);
		expect(h).toMatch(/^[0-9a-f]{64}$/);
		expect(h).toBe(hashSessionToken(token));
		expect(h).not.toBe(token);
	});

	it("login stores sha256(token); lookup succeeds with the RAW cookie only via hashing", async () => {
		// Real user + real Argon2 auth hash so the login path runs end-to-end
		const { hashPassword } = await import("$lib/auth/password");
		const [user] = await db
			.insert(users)
			.values({
				username: `sesshash-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
				passwordHash: await hashPassword(PASSWORD),
				passwordSalt: crypto.randomBytes(16).toString("hex"),
			})
			.returning();
		cleanupIds.push(user.id);

		let cookieToken: string | null = null;
		const cookies = {
			set: vi.fn((name: string, value: string) => {
				if (name === "session") cookieToken = value;
			}),
			get: vi.fn(),
			delete: vi.fn(),
		};

		const formData = new FormData();
		formData.append("username", user.username);
		formData.append("password", PASSWORD);

		let redirected: string | null = null;
		try {
			await loginActions.default({
				request: new Request("http://localhost/login", {
					method: "POST",
					body: formData,
				}),
				cookies,
				url: new URL("http://localhost/login"),
			} as never);
			expect.fail("expected redirect");
		} catch (e) {
			if (e && typeof e === "object" && "status" in e && e.status === 302) {
				redirected = (e as unknown as { location: string }).location;
			} else {
				throw e;
			}
		}
		expect(redirected).toBe("/");
		expect(cookieToken).toBeTruthy();
		const rawCookie = cookieToken as unknown as string;

		// The stored row holds the SHA-256 of the cookie value — never the
		// raw value itself
		const [row] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.userId, user.id));
		expect(row.token).toBe(hashSessionToken(rawCookie));
		expect(row.token).not.toBe(cookieToken);
		expect(row.token).toMatch(/^[0-9a-f]{64}$/);

		// A stolen DB file is useless: presenting the stored value as a
		// cookie finds nothing (it would be hashed again); the RAW cookie
		// value matches exactly once hashed.
		const byStolenHash = await db.query.sessions.findFirst({
			where: eq(sessions.token, row.token ? hashSessionToken(row.token) : ""),
		});
		expect(byStolenHash).toBeUndefined();
		const byRawCookie = await db.query.sessions.findFirst({
			where: eq(sessions.token, hashSessionToken(rawCookie)),
		});
		expect(byRawCookie?.userId).toBe(user.id);
	});
});
