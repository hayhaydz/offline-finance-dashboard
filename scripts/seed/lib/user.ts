import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../../../src/lib/auth/password.js";
import * as schema from "../../../src/lib/db/schema/index";
import {
	enrollPasswordSlot,
	enrollRecoverySlot,
} from "../../../src/lib/server/crypto/enroll.js";
import type { DB } from "./db.js";

export async function ensureAdminUser(db: DB): Promise<number> {
	const existing = await db.query.users.findFirst({
		where: eq(schema.users.username, "admin"),
	});

	if (existing) {
		console.log("⚠️  Admin user already exists, reusing.");
		return existing.id;
	}

	const passwordSalt = crypto.randomBytes(16).toString("hex");
	const passwordHash = await hashPassword("password");

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
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	const userId = newUser.id;

	// Envelope fixtures (task 2.2): real password slot + recovery paper slot
	// wrapping a real DataKey, so seeded databases exercise the actual path.
	const { dataKey } = await enrollPasswordSlot(db, {
		userId,
		password: "password",
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
	console.log(`📄 DEV recovery passphrase (shown once): ${passphrase}`);
	return userId;
}
