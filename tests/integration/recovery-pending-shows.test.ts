import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { credentialSlots, users } from "$lib/db/schema";
import { enrollPasswordSlot } from "$lib/server/crypto/enroll";
import { sealKeyring, unlockKeyring } from "$lib/server/crypto/keyring";
import {
	actions,
	load,
	pendingShowsForTest,
	sweepPendingShows,
} from "../../src/routes/(auth)/recovery-enroll/+page.server";

/**
 * Key hygiene (crypto-rotation-safety 4.4): one-time recovery passphrase
 * disclosures held in process memory are swept on expiry — deleted on every
 * read AND insert, not only when consumed.
 */

const PASSWORD = "pending-shows-pass-1!";
const cleanupIds: number[] = [];

async function insertUser() {
	const [user] = await db
		.insert(users)
		.values({
			username: `shows-user-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			passwordHash: "hash",
			totpSecret: "REMOVED",
			totpSecretIV: "REMOVED",
			passwordSalt: crypto.randomBytes(16).toString("hex"),
		})
		.returning();
	cleanupIds.push(user.id);
	return user;
}

function expiredEntry(userId: number) {
	return {
		userId,
		passphrase: "stale one-time passphrase",
		expiresAt: Date.now() - 1,
	};
}

beforeEach(() => {
	sealKeyring("test-setup");
	pendingShowsForTest.clear();
});

afterEach(async () => {
	sealKeyring("test-teardown");
	pendingShowsForTest.clear();
	if (cleanupIds.length > 0) {
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, cleanupIds));
		await db.delete(users).where(inArray(users.id, cleanupIds));
		cleanupIds.length = 0;
	}
});

describe("pendingShows sweep (key hygiene 4.4)", () => {
	it("sweepPendingShows deletes expired entries and keeps live ones", () => {
		pendingShowsForTest.set("expired", expiredEntry(1));
		pendingShowsForTest.set("live", {
			userId: 1,
			passphrase: "still valid",
			expiresAt: Date.now() + 60_000,
		});

		sweepPendingShows();

		expect(pendingShowsForTest.has("expired")).toBe(false);
		expect(pendingShowsForTest.has("live")).toBe(true);
	});

	it("read path: an expired disclosure is swept when load runs", async () => {
		const user = await insertUser();
		pendingShowsForTest.set("tok", expiredEntry(user.id));

		// Expired token → load must not reveal the passphrase; the entry is
		// deleted from memory (swept on read), then the normal guards apply
		// (no slots at all → /migrate redirect).
		let redirected: number | null = null;
		try {
			await load({
				locals: { user: { id: user.id, username: user.username } },
				cookies: { get: () => undefined } as never,
				url: new URL(`http://localhost/recovery-enroll?show=tok`),
			} as never);
		} catch (e) {
			if (e && typeof e === "object" && "status" in e) {
				redirected = (e as { status: number }).status;
			} else {
				throw e;
			}
		}
		expect(redirected).toBe(302);
		expect(pendingShowsForTest.has("tok")).toBe(false);
	});

	it("insert path: enrolling a fresh disclosure sweeps expired ones", async () => {
		const user = await insertUser();
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);

		pendingShowsForTest.set("stale", expiredEntry(user.id));

		let showUrl: string | null = null;
		try {
			await actions.enroll({
				locals: { user: { id: user.id, username: user.username } },
				cookies: { get: () => undefined } as never,
			} as never);
			expect.fail("expected redirect");
		} catch (e) {
			if (
				e &&
				typeof e === "object" &&
				"status" in e &&
				(e as { status: number }).status === 302
			) {
				showUrl = (e as unknown as { location: string }).location;
			} else {
				throw e;
			}
		}

		// The fresh disclosure is staged for one-time display...
		const token = new URL(showUrl ?? "", "http://localhost").searchParams.get(
			"show",
		);
		expect(token).toBeTruthy();
		expect(pendingShowsForTest.has(token as string)).toBe(true);
		// ...and the expired one no longer lingers in memory
		expect(pendingShowsForTest.has("stale")).toBe(false);
	});
});
