import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "$lib/auth/password";
import { db } from "$lib/db/client";
import { credentialSlots, users } from "$lib/db/schema";
import {
	enrollPasswordSlot,
	enrollRecoverySlot,
} from "$lib/server/crypto/enroll";
import { keyringStatus, sealKeyring } from "$lib/server/crypto/keyring";
import { actions } from "../../src/routes/(auth)/unlock/+page.server";

/**
 * Unlock ceremony 2-of-2 enforcement (tasks 6.2/6.3) at the ACTION level:
 * with an enrolled device slot, the password alone must never open the
 * keyring; password + verified device unwrap must agree on the DataKey.
 */

vi.mock("$lib/auth/password", () => ({
	hashPassword: vi.fn(() => Promise.resolve("x")),
	verifyPassword: vi.fn(),
}));

vi.mock("$lib/security/rate-limiter", () => ({
	checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
	recordFailedAttempt: vi.fn(),
	recordSuccessfulAttempt: vi.fn(),
}));

vi.mock("$lib/server/crypto/webauthn", () => ({
	WebAuthnCeremonyError: class extends Error {
		constructor(
			public code: string,
			message: string,
		) {
			super(message);
		}
	},
	completeDeviceUnlock: vi.fn(),
}));

import {
	completeDeviceUnlock,
	WebAuthnCeremonyError,
} from "$lib/server/crypto/webauthn";

const PASSWORD = "unlock-ceremony-pass-1!";
const dataKey = crypto.randomBytes(32);

let userId: number;
const cleanupIds: number[] = [];

async function setupUser(withDeviceSlot: boolean) {
	const passwordSalt = crypto.randomBytes(16).toString("hex");
	const passwordHash = await hashPassword(PASSWORD);
	const [user] = await db
		.insert(users)
		.values({
			username: `unlock-user-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			passwordHash,
			passwordSalt,
		})
		.returning();
	cleanupIds.push(user.id);
	userId = user.id;

	await enrollPasswordSlot(db, {
		userId,
		password: PASSWORD,
		passwordSalt,
		dataKey,
	});
	if (withDeviceSlot) {
		await enrollRecoverySlot(db, {
			userId,
			dataKey,
			passphrase:
				"one two three four five six seven eight nine ten eleven twelve",
		});
		// Convert the RECOVERY slot into a webauthn-prf slot (kind change only
		// — wrap material is opaque to this test's purpose; scoped so the
		// password slot keeps its kind)
		await db
			.update(credentialSlots)
			.set({ kind: "webauthn-prf" })
			.where(
				and(
					inArray(credentialSlots.userId, [userId]),
					eq(credentialSlots.kind, "recovery-passphrase"),
				),
			);
	}
	return user;
}

beforeEach(() => {
	vi.clearAllMocks();
	sealKeyring("test-setup");
	(completeDeviceUnlock as any).mockReset();
});

afterEach(async () => {
	sealKeyring("test-teardown");
	if (cleanupIds.length > 0) {
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, cleanupIds));
		await db.delete(users).where(inArray(users.id, cleanupIds));
		cleanupIds.length = 0;
	}
});

function post(
	fields: Record<string, string>,
	user: { id: number; username: string },
) {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) formData.append(k, v);
	return (actions.password as any)({
		request: new Request("http://localhost/unlock", {
			method: "POST",
			body: formData,
		}),
		locals: { user },
		url: new URL("http://localhost/unlock"),
	});
}

describe("unlock ceremony 2-of-2 (device slot enrolled)", () => {
	it("password alone is refused — data stays sealed", async () => {
		const user = await setupUser(true);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);

		const result = await post({ password: PASSWORD }, user);

		expect(result.status).toBe(401);
		expect(result.data.deviceRequired).toBe(true);
		expect(keyringStatus().state).toBe("sealed");
	});

	it("device step failure refuses — data stays sealed", async () => {
		const user = await setupUser(true);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);
		(completeDeviceUnlock as any).mockRejectedValue(
			new WebAuthnCeremonyError("VERIFICATION_FAILED", "UV missing"),
		);

		const result = await post(
			{
				password: PASSWORD,
				deviceToken: "t",
				deviceAssertion: JSON.stringify({ id: "cred-1" }),
				devicePrf: crypto.randomBytes(32).toString("base64"),
			},
			user,
		);

		expect(result.status).toBe(401);
		expect(result.data.deviceRequired).toBe(true);
		expect(keyringStatus().state).toBe("sealed");
	});

	it("password + device agreeing on the DataKey unlocks (2-of-2)", async () => {
		const user = await setupUser(true);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);
		// Real password slot unwraps to the same DataKey the device yields
		(completeDeviceUnlock as any).mockResolvedValue(dataKey);

		let redirected: string | null = null;
		try {
			await post(
				{
					password: PASSWORD,
					deviceToken: "t",
					deviceAssertion: JSON.stringify({ id: "cred-1" }),
					devicePrf: crypto.randomBytes(32).toString("base64"),
				},
				user,
			);
			expect.fail("expected redirect");
		} catch (e: any) {
			if (e.status === 302) redirected = e.location;
			else throw e;
		}
		expect(redirected).toBe("/");
		expect(keyringStatus().state).toBe("unlocked");
		expect(keyringStatus().userId).toBe(userId);
	});

	it("factors unwrapping DIFFERENT keys refuse — data stays sealed", async () => {
		const user = await setupUser(true);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);
		// Device yields a DIFFERENT key than the password slot holds
		(completeDeviceUnlock as any).mockResolvedValue(crypto.randomBytes(32));

		const result = await post(
			{
				password: PASSWORD,
				deviceToken: "t",
				deviceAssertion: JSON.stringify({ id: "cred-1" }),
				devicePrf: crypto.randomBytes(32).toString("base64"),
			},
			user,
		);

		expect(result.status).toBe(401);
		expect(keyringStatus().state).toBe("sealed");
	});
});

describe("unlock ceremony L1 (no device slot)", () => {
	it("password alone unlocks when no device slot is enrolled", async () => {
		const user = await setupUser(false);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);

		let redirected: string | null = null;
		try {
			await post({ password: PASSWORD }, user);
			expect.fail("expected redirect");
		} catch (e: any) {
			if (e.status === 302) redirected = e.location;
			else throw e;
		}
		expect(redirected).toBe("/");
		expect(keyringStatus().state).toBe("unlocked");
		expect(completeDeviceUnlock).not.toHaveBeenCalled();
	});
});

describe("key hygiene at unlock (crypto-rotation-safety 4.1)", () => {
	it("mismatched factors zeroize the device buffer before the failure response", async () => {
		const user = await setupUser(true);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);
		// Device yields a DIFFERENT key than the password slot holds — hold
		// the buffer reference so zeroization is observable.
		const deviceBuf = crypto.randomBytes(32);
		(completeDeviceUnlock as any).mockResolvedValue(deviceBuf);
		expect(deviceBuf.every((b) => b !== 0)).toBe(true);

		const result = await post(
			{
				password: PASSWORD,
				deviceToken: "t",
				deviceAssertion: JSON.stringify({ id: "cred-1" }),
				devicePrf: crypto.randomBytes(32).toString("base64"),
			},
			user,
		);

		expect(result.status).toBe(401);
		expect(keyringStatus().state).toBe("sealed");
		// No key residue: the discarded device factor buffer is zeroized
		expect(deviceBuf.every((b) => b === 0)).toBe(true);
	});

	it("password unwrap failure after a successful device step zeroizes the device buffer", async () => {
		const user = await setupUser(true);
		const { verifyPassword } = await import("$lib/auth/password");
		(verifyPassword as any).mockResolvedValue(true);

		const deviceBuf = crypto.randomBytes(32);
		(completeDeviceUnlock as any).mockResolvedValue(deviceBuf);

		// Corrupt the password slot so the post-device unwrap fails (GCM
		// authentication failure → EnvelopeError → 401).
		await db
			.update(credentialSlots)
			.set({ wrappedKey: "ab".repeat(48) })
			.where(
				and(
					eq(credentialSlots.userId, userId),
					eq(credentialSlots.kind, "password"),
				),
			);

		const result = await post(
			{
				password: PASSWORD,
				deviceToken: "t",
				deviceAssertion: JSON.stringify({ id: "cred-1" }),
				devicePrf: crypto.randomBytes(32).toString("base64"),
			},
			user,
		);

		expect(result.status).toBe(401);
		expect(keyringStatus().state).toBe("sealed");
		expect(deviceBuf.every((b) => b === 0)).toBe(true);
	});
});
