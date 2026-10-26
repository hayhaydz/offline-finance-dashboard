import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "$lib/auth/password";
import { db } from "$lib/db/client";
import { sessions, users } from "$lib/db/schema";
import {
	checkRateLimit,
	recordFailedAttempt,
	recordSuccessfulAttempt,
} from "$lib/security/rate-limiter";
import {
	clearRecoveryEnrollment,
	resolveRecoveryEnrollment,
} from "$lib/server/auth/recovery-enroll-token";
import { normalizePassphrase } from "$lib/server/crypto/diceware";
import {
	enrollRecoverySlot,
	getActiveSlots,
	revokeSlot,
	rewrapPasswordSlot,
	unwrapRecoverySlot,
} from "$lib/server/crypto/enroll";
import {
	clearRecoveryInitiated,
	isUnlockedFor,
	keyringStatus,
	requireDataKey,
} from "$lib/server/crypto/keyring";
import { logError, logInfo } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Recovery paper enrollment (spec recovery-credentials).
 *
 * Serves three entry modes:
 *  - register: fresh account (recovery-enroll-user cookie, no session yet) —
 *    REQUIRED before the app is usable
 *  - migrate:  legacy account mid-migration (session, envelope just created)
 *  - recovery: recovery-initiated session — must set a NEW password before
 *    any data-bearing route (spec: forced re-enrollment)
 *
 * The passphrase is CSPRNG-generated 12-word EFF diceware, displayed exactly
 * once, never user-invented, never shown again.
 */

const SHOW_TTL_MS = 5 * 60 * 1000;

/**
 * One-shot passphrase display. The enroll action stores the generated
 * passphrase here under a random token and redirects to `?show=<token>`;
 * the load pops it exactly once. This avoids the SvelteKit action-rerun
 * trap where load's "already enrolled → redirect" guard fires immediately
 * after a successful enrollment and discards the one-time display.
 */
const pendingShows = new Map<
	string,
	{ userId: number; passphrase: string; expiresAt: number }
>();

/**
 * Key hygiene (spec key-hygiene): pending disclosures are one-time
 * passphrases held in process memory — expired entries are DELETED on every
 * read and insert (mirroring the WebAuthn challenge sweep), not only when
 * consumed. Exported for tests (direct expiry set).
 */
export function sweepPendingShows(now = Date.now()): void {
	for (const [token, entry] of pendingShows) {
		if (entry.expiresAt <= now) pendingShows.delete(token);
	}
}

/** Test access to the in-memory pending disclosures (sweep verification). */
export const pendingShowsForTest = pendingShows;

async function userById(id: number) {
	const user = await db.query.users.findFirst({
		where: eq(users.id, id),
	});
	return user ?? null;
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const mode = url.searchParams.get("mode") ?? "register";

	// Recovery-initiated session: password re-enrollment path
	if (locals.user && keyringStatus().recoveryInitiated) {
		return { mode: "recovery", username: locals.user.username };
	}

	// Register / migrate: user has a password slot but no recovery slot yet.
	// The handoff cookie holds a capability TOKEN (never a raw user id) —
	// an arbitrary cookie value resolves to nothing.
	let candidateId: number | null = null;
	if (locals.user) {
		candidateId = locals.user.id;
	} else {
		candidateId = resolveRecoveryEnrollment(cookies);
	}
	if (!candidateId) throw redirect(302, "/login");

	const user = await userById(candidateId);
	if (!user) throw redirect(302, "/login");

	// One-time display of a freshly generated passphrase (?show=<token>):
	// pop it BEFORE the enrolled-state guards below can redirect. A refresh
	// re-enters load without a valid token → normal guards apply (the
	// passphrase is gone by design — shown exactly once).
	const showToken = url.searchParams.get("show");
	if (showToken) {
		sweepPendingShows(); // expired disclosures never linger (key hygiene)
		const entry = pendingShows.get(showToken);
		if (entry && entry.userId === candidateId && entry.expiresAt > Date.now()) {
			pendingShows.delete(showToken);
			return {
				mode,
				username: user.username,
				passphrase: entry.passphrase,
			};
		}
	}

	const [passwordSlots, recoverySlots] = await Promise.all([
		getActiveSlots(db, user.id, "password"),
		getActiveSlots(db, user.id, "recovery-passphrase"),
	]);

	// Already enrolled? Paper is never re-displayed — offer rotation instead
	// (via settings; spec: "the passphrase is never displayed again").
	if (recoverySlots.length > 0) {
		throw redirect(302, locals.user ? "/" : "/login");
	}
	if (passwordSlots.length === 0) {
		// No envelope at all — wrong door; legacy users start at /migrate
		throw redirect(302, locals.user ? "/migrate" : "/login");
	}

	// Sealed keyring (e.g. server restarted mid-enrollment): the wrap needs
	// the DataKey — go through login/unlock first; guards send the user back.
	if (!isUnlockedFor(user.id)) {
		throw redirect(302, locals.user ? "/unlock?reason=sealed" : "/login");
	}

	return { mode, username: user.username };
};

export const actions: Actions = {
	/**
	 * Generate + enroll the recovery paper slot. Returns the passphrase for
	 * EXACTLY ONE display — the system cannot show it again (it only holds
	 * the wrapped copy).
	 */
	enroll: async ({ locals, cookies }) => {
		let userId: number | null = locals.user?.id ?? null;
		if (!userId) {
			// Capability token (never a raw user id) — invalid value yields
			// nothing, no disclosure.
			userId = resolveRecoveryEnrollment(cookies);
		}
		if (!userId) return fail(401, { error: "Enrollment session expired" });

		const user = await userById(userId);
		if (!user) return fail(401, { error: "Enrollment session expired" });

		const recoverySlots = await getActiveSlots(
			db,
			user.id,
			"recovery-passphrase",
		);
		if (recoverySlots.length > 0) {
			return fail(400, {
				error:
					"Recovery passphrase already enrolled — rotate it from settings if needed",
			});
		}

		// Registration/migration/recovery all run inside the same process the
		// envelope was unlocked in; the keyring holds the DataKey.
		try {
			const dataKey = requireDataKey(user.id);
			const { passphrase } = await enrollRecoverySlot(db, {
				userId: user.id,
				dataKey,
			});
			logInfo("recovery-enroll", "Recovery paper enrolled (shown once)", {
				userId: user.id,
			});
			// One-shot display: redirect to ?show=<token> — returning the
			// passphrase from the action would be discarded when load's
			// "already enrolled" guard reruns and redirects.
			const { randomBytes } = await import("node:crypto");
			const token = randomBytes(24).toString("hex");
			sweepPendingShows(); // expired disclosures never linger (key hygiene)
			pendingShows.set(token, {
				userId: user.id,
				passphrase,
				expiresAt: Date.now() + SHOW_TTL_MS,
			});
			throw redirect(302, `/recovery-enroll?show=${token}`);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"status" in error &&
				error.status === 302
			) {
				throw error;
			}
			logError("recovery-enroll", "Recovery enrollment failed", {
				userId: user.id,
				message: error instanceof Error ? error.message : String(error),
			});
			return fail(500, { error: "Recovery enrollment failed" });
		}
	},

	/** Acknowledgement complete — finish enrollment and move on. */
	done: async ({ locals, cookies }) => {
		clearRecoveryEnrollment(cookies);

		if (locals.user) {
			if (keyringStatus().recoveryInitiated) {
				// Still needs the new password step
				throw redirect(302, "/recovery-enroll?mode=recovery");
			}
			throw redirect(302, "/");
		}
		throw redirect(302, "/login");
	},

	/**
	 * Recovery re-enrollment: set a NEW password (re-wraps the password slot
	 * over the unchanged DataKey — no data rewrite), then clear the
	 * recovery-initiated flag.
	 */
	setNewPassword: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Authentication required" });
		if (!keyringStatus().recoveryInitiated) {
			throw redirect(302, "/");
		}

		const formData = await request.formData();
		const currentPassword = formData.get("currentPassword") as string;
		const newPassword = formData.get("newPassword") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (!currentPassword || !newPassword || !confirmPassword) {
			return fail(400, { error: "All fields are required" });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { error: "Passwords do not match" });
		}
		if (newPassword.length < 12) {
			return fail(400, { error: "Password must be at least 12 characters" });
		}

		// Rate-limited credential verification (auth-session-hardening): the
		// current-credential proof (old password or recovery passphrase)
		// shares the login limiter.
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

		const dbUser = await userById(user.id);
		if (!dbUser) return fail(401, { error: "Authentication required" });

		// Paper unlock means the OLD password may be unknown/lost — accept
		// EITHER the old password OR the recovery passphrase as the "current
		// credential" proof (guards a shoulder-surfed recovery session).
		let provedWithOldPassword = false;
		try {
			provedWithOldPassword = await verifyPassword(
				dbUser.passwordHash,
				currentPassword,
			);
		} catch {
			provedWithOldPassword = false;
		}
		if (!provedWithOldPassword) {
			try {
				await unwrapRecoverySlot(
					db,
					user.id,
					normalizePassphrase(currentPassword),
				);
			} catch {
				await recordFailedAttempt(user.username);
				return fail(400, {
					error: "Enter your previous password or the recovery passphrase",
				});
			}
		}

		try {
			// Re-wrap the password slot under the new password (slot tier —
			// data untouched) using the keyring DataKey the paper unwrap
			// already assembled.
			const dataKey = requireDataKey(user.id);
			const { passwordSalt } = await rewrapPasswordSlot(db, {
				userId: user.id,
				newPassword,
				dataKey,
			});

			const newHash = await hashPassword(newPassword);
			await db
				.update(users)
				.set({
					passwordHash: newHash,
					passwordSalt,
					updatedAt: new Date(),
				})
				.where(eq(users.id, user.id));

			clearRecoveryInitiated(user.id);

			// Device slots cannot be re-wrapped server-side (their wrapping
			// key never leaves the device) — revoke them so recovery lands
			// the account at L1; settings then prompts fresh enrollment.
			const deviceSlots = await getActiveSlots(db, user.id, "webauthn-prf");
			for (const slot of deviceSlots) {
				await revokeSlot(db, user.id, slot.slotId);
			}

			// Single-session policy: force everyone through the new password
			await db.delete(sessions).where(eq(sessions.userId, user.id));
			await recordSuccessfulAttempt(user.username);

			logInfo("recovery-enroll", "Password re-enrolled after recovery", {
				userId: user.id,
			});
			throw redirect(302, "/login?reason=logged-out");
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"status" in error &&
				error.status === 302
			) {
				throw error;
			}
			logError("recovery-enroll", "Password re-enrollment failed", error);
			return fail(500, { error: "Password re-enrollment failed" });
		}
	},
};
