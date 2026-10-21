import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { goals, snapshots, users } from "$lib/db/schema";
import { sealKeyring } from "$lib/server/crypto/keyring";
import { load as layoutLoad } from "../../src/routes/+layout.server";
import { load as profileLoad } from "../../src/routes/settings/profile/+page.server";
import { load as dataLoad } from "../../src/routes/settings/data/+page.server";
import { load as snapshotsLoad } from "../../src/routes/overview/snapshots/+page.server";
import { load as snapshotCreateLoad } from "../../src/routes/overview/snapshots/create/+page.server";
import { load as snapshotDetailLoad } from "../../src/routes/overview/snapshots/[slug]/+page.server";
import { load as debtCreateLoad } from "../../src/routes/goals/debt/create/+page.server";
import { load as goalCreateLoad } from "../../src/routes/goals/create/+page.server";
import {
	load as archiveConfirmLoad,
} from "../../src/routes/goals/[slug]/confirm-archive/+page.server";

/**
 * auth-session-hardening 1.1–1.3: no browser-visible load payload contains
 * secret material. Loads are invoked with a FULL users row (and session row)
 * in locals — exactly what hooks populates — and the serialized payloads are
 * key-scanned for credential material.
 */

/** Keys that must never appear in a load payload. */
const FORBIDDEN_KEYS = [
	"passwordHash",
	"passwordSalt",
	"totpSecret",
	"totpSecretIV",
	"mfaSetupToken",
	"token",
	"wrappedKey",
];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, keys);
		return keys;
	}
	if (value && typeof value === "object") {
		if (value instanceof Date) return keys;
		for (const [key, child] of Object.entries(value)) {
			keys.add(key);
			collectKeys(child, keys);
		}
	}
	return keys;
}

function expectSanitized(label: string, payload: unknown) {
	const keys = collectKeys(payload);
	const leaks = FORBIDDEN_KEYS.filter((k) => keys.has(k));
	expect(leaks, `${label} leaked secret keys`).toEqual([]);
	// The user DTO shape is the whitelisted subset
	if (payload && typeof payload === "object" && "user" in payload) {
		const user = (payload as { user: Record<string, unknown> | null }).user;
		if (user) {
			expect(Object.keys(user).sort()).toEqual([
				"createdAt",
				"id",
				"inactivityTimeout",
				"username",
			]);
		}
	}
}

const cleanupIds: number[] = [];

async function insertUser() {
	const [user] = await db
		.insert(users)
		.values({
			username: `dto-user-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			passwordHash: "SECRET-HASH",
			passwordSalt: "SECRET-SALT",
			totpSecret: "REMOVED",
			totpSecretIV: "REMOVED",
			inactivityTimeout: 5,
		})
		.returning();
	cleanupIds.push(user.id);
	return user;
}

const fullSession = {
	id: 1,
	token: "SECRET-SESSION-TOKEN",
	userId: 0,
	createdAt: new Date(),
	lastActivity: new Date(),
};

afterEach(async () => {
	sealKeyring("test-teardown");
	if (cleanupIds.length > 0) {
		await db.delete(snapshots).where(inArray(snapshots.userId, cleanupIds));
		await db.delete(goals).where(inArray(goals.userId, cleanupIds));
		await db.delete(users).where(inArray(users.id, cleanupIds));
		cleanupIds.length = 0;
	}
});

describe("page-data DTO sanitization (auth-session-hardening 1.1–1.3)", () => {
	it("layout returns the user DTO and no session record", () => {
		return (async () => {
			const user = await insertUser();
			const payload = (await layoutLoad({
				locals: { user, session: fullSession },
			} as never)) as Record<string, unknown>;
			expectSanitized("layout", payload);
			expect("session" in payload).toBe(false);
		})();
	});

	it("settings/profile returns user DTO + timing-only session subset", async () => {
		const user = await insertUser();
		const payload = await profileLoad({
			locals: { user, session: { ...fullSession, userId: user.id } },
		} as never);
		expectSanitized("settings/profile", payload);
		const session = (
			payload as { session: Record<string, unknown> | null }
		).session;
		expect(Object.keys(session ?? {}).sort()).toEqual([
			"createdAt",
			"lastActivity",
		]);
	});

	it("settings/data returns user DTO", async () => {
		const user = await insertUser();
		const payload = await dataLoad({
			locals: { user, session: fullSession },
		} as never);
		expectSanitized("settings/data", payload);
	});

	it("overview/snapshots (list + create + detail) return user DTOs", async () => {
		const user = await insertUser();
		const locals = { user, session: fullSession };

		const list = await snapshotsLoad({
			locals,
			url: new URL("http://localhost/overview/snapshots"),
		} as never);
		expectSanitized("overview/snapshots", list);

		const create = await snapshotCreateLoad({ locals } as never);
		expectSanitized("overview/snapshots/create", create);

		const [snapshot] = await db
			.insert(snapshots)
			.values({
				slug: `dto-snap-${user.id}`,
				userId: user.id,
				snapshotDate: "2026-10-21",
				netWorthInCents: 0,
				totalAssetsInCents: 0,
				totalLiabilitiesInCents: 0,
				accountsBreakdown: {
					snapshotTakenAt: new Date().toISOString(),
					accounts: [],
				} as never,
				goalsBreakdown: { snapshotTakenAt: "", goals: [] } as never,
				isaBreakdown: { snapshotTakenAt: "", accounts: [] } as never,
			})
			.returning();
		const detail = await snapshotDetailLoad({
			locals,
			params: { slug: snapshot.slug },
		} as never);
		expectSanitized("overview/snapshots/[slug]", detail);
	});

	it("goals (debt/create, create, archive confirm) return user DTOs", async () => {
		const user = await insertUser();
		const locals = { user, session: fullSession };

		const debt = await debtCreateLoad({ locals } as never);
		expectSanitized("goals/debt/create", debt);

		const create = await goalCreateLoad({ locals } as never);
		expectSanitized("goals/create", create);

		const [goal] = await db
			.insert(goals)
			.values({
				slug: `dto-goal-${user.id}`,
				userId: user.id,
				name: "DTO probe",
				targetAmountInCents: 100,
				goalType: "savings",
			})
			.returning();
		const confirm = await (
			archiveConfirmLoad as unknown as (e: unknown) => Promise<unknown>
		)({
			locals,
			params: { slug: goal.slug },
		});
		expectSanitized("goals/[slug]/confirm-archive", confirm);
	});
});
