import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import {
	encryptTOTPSecret,
	generateTOTPSecret,
} from "../../../src/lib/auth/mfa.js";
import { hashPassword } from "../../../src/lib/auth/password.js";
import * as schema from "../../../src/lib/db/schema/index";
import type { DB } from "./db.js";

export async function ensureAdminUser(db: DB): Promise<number> {
	const existing = await db.query.users.findFirst({
		where: eq(schema.users.username, "admin"),
	});

	if (existing) {
		console.log("⚠️  Admin user already exists, reusing.");
		return existing.id;
	}

	const encryptionKey = process.env.ENCRYPTION_KEY;
	const totpSecret = generateTOTPSecret();
	let secretToStore = totpSecret;
	let ivToStore = "";

	if (encryptionKey) {
		const result = encryptTOTPSecret(totpSecret, encryptionKey);
		secretToStore = result.encrypted;
		ivToStore = result.iv;
	} else {
		secretToStore = `PLAIN:${totpSecret}`;
		ivToStore = "PLAIN";
	}

	const passwordSalt = crypto.randomBytes(16).toString("hex");
	const passwordHash = await hashPassword("password");

	const [newUser] = await db
		.insert(schema.users)
		.values({
			username: "admin",
			passwordHash,
			totpSecret: secretToStore,
			totpSecretIV: ivToStore,
			passwordSalt,
			taxBand: "basic",
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	const userId = newUser.id;

	const codes: Array<{
		userId: number;
		code: string;
		used: boolean;
		createdAt: Date;
	}> = [];
	for (let i = 0; i < 10; i++) {
		const code = crypto.randomBytes(4).toString("hex").toUpperCase();
		codes.push({
			userId,
			code: await hashPassword(code),
			used: false,
			createdAt: new Date(),
		});
	}
	await db.insert(schema.backupCodes).values(codes);

	await db.insert(schema.sessions).values({
		token: crypto.randomBytes(32).toString("hex"),
		userId,
		lastActivity: new Date(),
		createdAt: new Date(),
	});

	console.log("✅ Created admin user (admin / password)");
	return userId;
}
