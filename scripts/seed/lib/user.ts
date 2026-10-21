import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../../../src/lib/auth/password.js";
import * as schema from "../../../src/lib/db/schema/index";
import {
	enrollPasswordSlot,
	enrollRecoverySlot,
	unwrapPasswordSlot,
} from "../../../src/lib/server/crypto/enroll.js";
import { unlockKeyring } from "../../../src/lib/server/crypto/keyring.js";
import type { DB } from "./db.js";

/** Dev-seed credential — matches the seeded admin login. */
const SEED_PASSWORD = "password";

export async function ensureAdminUser(db: DB): Promise<number> {
	const existing = await db.query.users.findFirst({
		where: eq(schema.users.username, "admin"),
	});

	if (existing) {
		console.log("⚠️  Admin user already exists, reusing.");
		// Re-seed: the existing keyring slots wrap the ORIGINAL DataKey —
		// unwrap with the dev password so fixture writes encrypt under the
		// same key the unlock ceremony will recover later (value layer).
		try {
			const dataKey = await unwrapPasswordSlot(
				db,
				{ id: existing.id, passwordSalt: existing.passwordSalt },
				SEED_PASSWORD,
			);
			unlockKeyring(existing.id, dataKey);
			console.log("🔑 Keyring unlocked with the existing DataKey (re-seed).");
		} catch (error) {
			console.error(
				"❌ Could not unwrap the existing admin keyring with the dev password.",
			);
			console.error(
				"   The seed only supports users enrolled by a previous seed run.",
			);
			throw error;
		}
		return existing.id;
	}

	const passwordSalt = crypto.randomBytes(16).toString("hex");
	const passwordHash = await hashPassword(SEED_PASSWORD);

	const [newUser] = await db
		.insert(schema.users)
		.values({
			username: "admin",
			passwordHash,
			// Legacy TOTP columns (dropped in the 5.3 release step): inert
			// placeholders satisfy NOT NULL until then.
			totpSecret: "REMOVED",
			totpSecretIV: "REMOVED",
			passwordSalt,
			taxBand: "basic",
			inactivityTimeout: 5,
			deviceEnrollmentEnabled: false, // L1 by default; enable per account in settings/security
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	const userId = newUser.id;

	// Envelope fixtures (task 2.2): real password slot + recovery paper slot
	// wrapping a real DataKey, so seeded databases exercise the actual path.
	const { dataKey } = await enrollPasswordSlot(db, {
		userId,
		password: SEED_PASSWORD,
		passwordSalt,
	});
	const { passphrase } = await enrollRecoverySlot(db, {
		userId,
		dataKey,
	});

	await db.insert(schema.sessions).values({
		token: crypto.randomBytes(32).toString("hex"),
		userId,
		lastActivity: new Date(),
		createdAt: new Date(),
	});

	// The recovery passphrase is shown ONCE, here (seed context = dev only).
	console.log("✅ Created admin user (admin / password)");
	console.log(`🔑 Envelope keyring enrolled (password + recovery slots)`);

	// Value layer: unlock in-process so fixture writes go through the
	// encrypt helpers (seed.ts seals the keyring again at exit).
	unlockKeyring(userId, dataKey);

	console.log(`📄 DEV recovery passphrase (shown once): ${passphrase}`);
	return userId;
}
