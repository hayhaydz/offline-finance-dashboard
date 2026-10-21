import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { verifyPassword } from "$lib/auth/password";
import { db } from "$lib/db/client";
import { users } from "$lib/db/schema";
import { hasEnvelope, unwrapPasswordSlot } from "$lib/server/crypto/enroll";
import { unlockKeyring } from "$lib/server/crypto/keyring";
import { migrateUserEnvelope } from "$lib/server/crypto/migrate-envelope";
import { logError } from "$lib/server/logger";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

/**
 * One-shot envelope migration for legacy users (task 5.1).
 *
 * Reachable only with a valid session and no enrolled envelope (hooks guard).
 * Re-verifies the password (auth-hash gate — the migration needs it to wrap
 * the password slot), then: DataKey + password slot → encrypt protected
 * columns (transactional per table, counts verified) → recovery-paper
 * enrollment in the SAME session (mandatory, next screen).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	const enrolled = await hasEnvelope(db, user.id);
	if (enrolled) {
		throw redirect(302, "/");
	}

	return { username: user.username };
};

export const actions: Actions = {
	migrate: async ({ request, locals, cookies }) => {
		const user = requireAuth(locals);

		const formData = await request.formData();
		const password = formData.get("password") as string;
		if (!password) {
			return fail(400, { error: "Password confirmation is required" });
		}

		const dbUser = await db.query.users.findFirst({
			where: eq(users.id, user.id),
		});
		if (!dbUser) return fail(401, { error: "Authentication required" });

		const passwordValid = await verifyPassword(dbUser.passwordHash, password);
		if (!passwordValid) {
			return fail(401, { error: "Invalid password" });
		}

		const alreadyEnrolled = await hasEnvelope(db, user.id);
		if (alreadyEnrolled) {
			throw redirect(302, "/");
		}

		try {
			// Migrate FIRST: the migration creates the password slot from the
			// verified password (no pre-existing slot is needed) and returns
			// the DataKey it created — unlock with that.
			const result = await migrateUserEnvelope(db, {
				userId: user.id,
				password,
				passwordSalt: dbUser.passwordSalt,
			});

			if (result.dataKey) {
				// Fresh migration — the keyring unlocks with the DataKey the
				// migration itself produced.
				unlockKeyring(user.id, result.dataKey);
			} else {
				// Resume path: a password slot already existed (previous run
				// completed the atomic migration; only the session unlock was
				// lost). NOW unwrapping is possible.
				const dataKey = await unwrapPasswordSlot(db, dbUser, password);
				unlockKeyring(user.id, dataKey);
			}

			// Recovery enrollment is REQUIRED in the same session.
			cookies.set("recovery-enroll-user", String(user.id), {
				path: "/",
				httpOnly: true,
				sameSite: "strict",
				secure: process.env.APP_ENV === "production",
				maxAge: 60 * 15,
			});

			return {
				success: true,
				tables: result.tables,
			};
		} catch (error) {
			logError("envelope-migrate", "Migration failed", {
				userId: user.id,
				message: error instanceof Error ? error.message : String(error),
			});
			return fail(500, { error: "Migration failed — no data was changed" });
		}
	},
};
