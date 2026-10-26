import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { credentialSlots, users } from "$lib/db/schema";
import { enrollPasswordSlot, getActiveSlots } from "$lib/server/crypto/enroll";
import { sealKeyring, unlockKeyring } from "$lib/server/crypto/keyring";
import { actions } from "../../src/routes/settings/security/+page.server";

/**
 * Per-account L2 device-enrollment switch (users.deviceEnrollmentEnabled).
 * ON reveals/permits enrollment for the account. OFF revokes enrolled
 * device slots (slot tier — data untouched) per spec unlock-ceremony.
 * Enforcement itself is never gated directly: zero slots = L1.
 */

const dataKey = crypto.randomBytes(32);
const cleanupIds: number[] = [];

async function setupUser(enabled: boolean) {
	const passwordSalt = crypto.randomBytes(16).toString("hex");
	const [user] = await db
		.insert(users)
		.values({
			username: `devsw-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			passwordHash: "hash",
			passwordSalt,
			deviceEnrollmentEnabled: enabled,
		})
		.returning();
	cleanupIds.push(user.id);
	await enrollPasswordSlot(db, {
		userId: user.id,
		password: "password-123456",
		passwordSalt,
		dataKey,
	});
	return user;
}

async function toggle(user: { id: number }, enabled: boolean) {
	const formData = new FormData();
	formData.append("enabled", String(enabled));
	return (actions.toggleDeviceEnrollment as any)({
		request: new Request("http://localhost/settings/security", {
			method: "POST",
			body: formData,
		}),
		locals: { user: { id: user.id, username: "x" } },
	});
}

beforeEach(() => {
	process.env.WEBAUTHN_PRF_ENABLED = "true";
	sealKeyring("setup");
});

afterEach(async () => {
	process.env.WEBAUTHN_PRF_ENABLED = undefined;
	sealKeyring("teardown");
	if (cleanupIds.length > 0) {
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, cleanupIds));
		await db.delete(users).where(inArray(users.id, cleanupIds));
		cleanupIds.length = 0;
	}
});

describe("per-account device-enrollment switch", () => {
	it("turning ON sets the account flag (full unlock required)", async () => {
		const user = await setupUser(false);
		unlockKeyring(user.id, dataKey);

		const result = await toggle(user, true);
		expect(result.success).toBe(true);

		const [row] = await db
			.select({ enabled: users.deviceEnrollmentEnabled })
			.from(users)
			.where(inArray(users.id, [user.id]));
		expect(row.enabled).toBe(true);
	});

	it("refuses while sealed (guarded by full unlock)", async () => {
		const user = await setupUser(false);
		const result = await toggle(user, true);
		expect(result.status).toBe(403);
	});

	it("ON is blocked while globally disabled (env kill switch)", async () => {
		process.env.WEBAUTHN_PRF_ENABLED = "false";
		const user = await setupUser(false);
		unlockKeyring(user.id, dataKey);
		const result = await toggle(user, true);
		expect(result.status).toBe(400);
	});

	it("turning OFF revokes enrolled device slots — data slots untouched", async () => {
		const user = await setupUser(true);
		unlockKeyring(user.id, dataKey);

		// A device slot + a recovery slot enrolled
		await db.insert(credentialSlots).values({
			slotId: `dev-${user.id}-a`,
			userId: user.id,
			kind: "webauthn-prf",
			wrappedKey: crypto.randomBytes(48).toString("hex"),
			iv: crypto.randomBytes(12).toString("hex"),
			metadata: { label: "Phone" },
			createdAt: new Date(),
		});
		const { enrollRecoverySlot } = await import("$lib/server/crypto/enroll");
		await enrollRecoverySlot(db, {
			userId: user.id,
			dataKey,
			passphrase:
				"one two three four five six seven eight nine ten eleven twelve",
		});

		const result = await toggle(user, false);
		expect(result.success).toBe(true);
		expect(result.message).toContain("1 device slot(s) revoked");

		const remaining = await getActiveSlots(db, user.id);
		expect(remaining.filter((s) => s.kind === "webauthn-prf")).toHaveLength(0);
		// Password + recovery slots survive; account is L1 again
		expect(remaining.filter((s) => s.kind === "password")).toHaveLength(1);
		expect(
			remaining.filter((s) => s.kind === "recovery-passphrase"),
		).toHaveLength(1);

		const [row] = await db
			.select({ enabled: users.deviceEnrollmentEnabled })
			.from(users)
			.where(inArray(users.id, [user.id]));
		expect(row.enabled).toBe(false);
	});
});
