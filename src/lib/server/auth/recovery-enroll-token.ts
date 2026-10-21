import crypto from "node:crypto";
import type { Cookies } from "@sveltejs/kit";

/**
 * Recovery-enrollment capability token (auth-session-hardening).
 *
 * The register/migrate → recovery-enroll handoff previously carried the
 * RAW USER ID in a cookie; any caller could set `recovery-enroll-user=1`
 * and probe for existing usernames. The cookie now holds a random 32-byte
 * token; the userId mapping lives only in this server-side TTL store
 * (mirroring the WebAuthn challenge store). No valid token → no candidate
 * → no disclosure.
 */

export const RECOVERY_ENROLL_COOKIE = "recovery-enroll-user";

const ENROLLMENT_TTL_MS = 15 * 60 * 1000; // 15 minutes (matches cookie maxAge)

const pendingEnrollments = new Map<
	string,
	{ userId: number; expiresAt: number }
>();

/** Delete expired mappings (called on issue and on resolve). */
export function sweepRecoveryEnrollments(now = Date.now()): void {
	for (const [token, entry] of pendingEnrollments) {
		if (entry.expiresAt <= now) pendingEnrollments.delete(token);
	}
}

/** Issue a fresh single-owner enrollment token cookie for a user. */
export function issueRecoveryEnrollment(
	cookies: Pick<Cookies, "set">,
	userId: number,
): void {
	sweepRecoveryEnrollments();
	const token = crypto.randomBytes(32).toString("hex");
	pendingEnrollments.set(token, {
		userId,
		expiresAt: Date.now() + ENROLLMENT_TTL_MS,
	});
	cookies.set(RECOVERY_ENROLL_COOKIE, token, {
		path: "/",
		httpOnly: true,
		sameSite: "strict",
		secure: process.env.APP_ENV === "production",
		maxAge: 60 * 15, // 15 minutes to complete enrollment
	});
}

/**
 * Resolve the candidate userId for the token in the cookie — null when
 * absent, unknown, or expired (indistinguishable to the caller).
 */
export function resolveRecoveryEnrollment(
	cookies: Pick<Cookies, "get">,
): number | null {
	const token = cookies.get(RECOVERY_ENROLL_COOKIE);
	if (!token) return null;
	sweepRecoveryEnrollments();
	return pendingEnrollments.get(token)?.userId ?? null;
}

/** Finish the handoff: drop the server mapping and the cookie. */
export function clearRecoveryEnrollment(
	cookies: Pick<Cookies, "get" | "delete">,
): void {
	const token = cookies.get(RECOVERY_ENROLL_COOKIE);
	if (token) pendingEnrollments.delete(token);
	cookies.delete(RECOVERY_ENROLL_COOKIE, { path: "/" });
}

/** Test access (direct expiry manipulation). */
export const pendingEnrollmentsForTest = pendingEnrollments;
