import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { users } from "$lib/db/schema";
import {
	checkRateLimit,
	recordFailedAttempt,
	recordSuccessfulAttempt,
} from "$lib/security/rate-limiter";
import { normalizePassphrase } from "$lib/server/crypto/diceware";
import {
	countActiveSlots,
	unwrapPasswordSlot,
	unwrapRecoverySlot,
} from "$lib/server/crypto/enroll";
import { EnvelopeError } from "$lib/server/crypto/envelope";
import {
	markRecoveryInitiated,
	unlockKeyring,
} from "$lib/server/crypto/keyring";
import { logError } from "$lib/server/logger";
import { sanitizeRedirectTo } from "$lib/utils/redirect-to";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Unlock ceremony (spec unlock-ceremony) for a session-holding but SEALED
 * user — typically after a server restart (fresh boot is always sealed).
 * Session-less users are handled by /login, which performs the same
 * password unwrap as part of full authentication.
 *
 * L2 device step placeholder: once a `webauthn-prf` slot is enrolled the
 * device share becomes mandatory here (design D7).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const params = new URLSearchParams();
		const reason = url.searchParams.get("reason");
		const redirectTo = sanitizeRedirectTo(url.searchParams.get("redirectTo"));
		if (reason) params.set("reason", reason);
		if (redirectTo) params.set("redirectTo", redirectTo);
		const qs = params.toString();
		throw redirect(302, `/login${qs ? `?${qs}` : ""}`);
	}

	const userId = locals.user.id;
	const [deviceSlots, recoverySlots] = await Promise.all([
		countActiveSlots(db, userId, "webauthn-prf"),
		countActiveSlots(db, userId, "recovery-passphrase"),
	]);

	return {
		username: locals.user.username,
		reason: url.searchParams.get("reason"),
		deviceEnrolled: deviceSlots > 0,
		hasRecovery: recoverySlots > 0,
	};
};

export const actions: Actions = {
	/**
	 * Password step: verify the Argon2id auth hash FIRST (rate-limited gate
	 * — wrong passwords never reach unwrap), then unwrap the password slot
	 * → DataKey in memory.
	 */
	password: async ({ request, locals, url }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const password = formData.get("password") as string;
		if (!password) {
			return fail(400, { error: "Password is required" });
		}

		const rateLimitResult = await checkRateLimit(user.username);
		if (rateLimitResult.locked) {
			return fail(429, {
				locked: true,
				error: "Account locked due to too many failed attempts",
			});
		}
		if (rateLimitResult.delay) {
			return fail(429, {
				delay: rateLimitResult.delay,
				error: "Too many failed attempts. Please wait before trying again.",
			});
		}

		const dbUser = await db.query.users.findFirst({
			where: eq(users.id, user.id),
		});
		if (!dbUser) {
			return fail(401, { error: "Invalid credentials" });
		}

		// Auth-hash gate BEFORE unwrap (design D2): the GCM unwrap failure
		// must never be the only signal, and unwrap must not run without the
		// rate-limited pre-check having passed.
		const { verifyPassword } = await import("$lib/auth/password");
		const passwordValid = await verifyPassword(dbUser.passwordHash, password);
		if (!passwordValid) {
			await recordFailedAttempt(user.username);
			return fail(401, { error: "Invalid credentials" });
		}

		try {
			const dataKey = await unwrapPasswordSlot(db, dbUser, password);
			unlockKeyring(dbUser.id, dataKey);
		} catch (error) {
			if (error instanceof EnvelopeError) {
				logError("unlock", "Password slot unwrap failed", {
					userId: dbUser.id,
					code: error.code,
				});
				await recordFailedAttempt(user.username);
				return fail(401, { error: "Invalid credentials" });
			}
			throw error;
		}

		await recordSuccessfulAttempt(user.username);

		const redirectTo = sanitizeRedirectTo(url.searchParams.get("redirectTo"));
		throw redirect(302, redirectTo ?? "/");
	},

	/**
	 * Recovery step (break-glass): passphrase unwrap → recovery-initiated
	 * session → forced re-enrollment before any data-bearing route
	 * (spec recovery-credentials).
	 */
	recovery: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const passphrase = normalizePassphrase(
			(formData.get("passphrase") as string) ?? "",
		);
		if (!passphrase) {
			return fail(400, { error: "Recovery passphrase is required" });
		}

		const rateLimitResult = await checkRateLimit(user.username);
		if (rateLimitResult.locked) {
			return fail(429, {
				locked: true,
				error: "Account locked due to too many failed attempts",
			});
		}
		if (rateLimitResult.delay) {
			return fail(429, {
				delay: rateLimitResult.delay,
				error: "Too many failed attempts. Please wait before trying again.",
			});
		}

		try {
			const dataKey = await unwrapRecoverySlot(db, user.id, passphrase);
			// Single-factor break-glass unlock — flagged session.
			unlockKeyring(user.id, dataKey, { recoveryInitiated: true });
			markRecoveryInitiated(user.id);
		} catch (error) {
			if (error instanceof EnvelopeError) {
				logError("unlock", "Recovery slot unwrap failed", {
					userId: user.id,
					code: error.code,
				});
				await recordFailedAttempt(user.username);
				return fail(401, { error: "Invalid recovery passphrase" });
			}
			throw error;
		}

		await recordSuccessfulAttempt(user.username);
		throw redirect(302, "/recovery-enroll?mode=recovery");
	},
};
