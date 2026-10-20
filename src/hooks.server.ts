import type { Handle, HandleServerError } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { HOME_ROUTE, LOGIN_ROUTE } from "$lib/constants/routes";
import { db } from "$lib/db/client";
import { runMigrations } from "$lib/db/migrate";
import { sessions } from "$lib/db/schema";
import { countActiveSlots, hasEnvelope } from "$lib/server/crypto/enroll";
import {
	isUnlockedFor,
	keyringStatus,
	sealKeyring,
} from "$lib/server/crypto/keyring";
import { logError } from "$lib/server/logger";
import { sanitizeRedirectTo } from "$lib/utils/redirect-to";
import { MS_PER_DAY } from "$lib/utils/time-constants";

// Run migrations once per server process and block requests until complete.
const startupMigrations = runMigrations();

/**
 * Redirect to login with a visible reason and the preserved return URL —
 * never a silent redirect (audit qa-findings/03 + backlog #21).
 */
function loginRedirect(reason: "expired" | "logged-out", url: URL): never {
	const redirectTo = sanitizeRedirectTo(url.pathname + url.search);
	const params = new URLSearchParams({ reason });
	if (redirectTo) {
		params.set("redirectTo", redirectTo);
	}
	throw redirect(302, `${LOGIN_ROUTE}?${params.toString()}`);
}

/**
 * Redirect a session-holding but SEALED user to the unlock ceremony with a
 * stated reason and preserved return URL (spec session-expiry-reliability +
 * envelope-encryption: sealed state is user-visibly routed, never rendered
 * as content).
 */
function unlockRedirect(reason: "sealed" | "restart", url: URL): never {
	const redirectTo = sanitizeRedirectTo(url.pathname + url.search);
	const params = new URLSearchParams({ reason });
	if (redirectTo) {
		params.set("redirectTo", redirectTo);
	}
	throw redirect(302, `/unlock?${params.toString()}`);
}

// Routes reachable while sealed or during ceremony-scoped flows. Everything
// else is data-bearing: no ciphertext or data values may render while sealed.
const SEALED_ALLOWED_PREFIXES = [
	"/login",
	"/register",
	"/unlock",
	"/logout",
	"/api/logout",
	"/api/session-ping",
	"/mfa-setup", // legacy route — removed with the 5.3 release step
	"/recovery-enroll",
	"/migrate",
];

function isSealedAllowed(pathname: string): boolean {
	return SEALED_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

// During a recovery-initiated session, only re-enrollment (+ logout) is
// usable until fresh credentials are enrolled (spec recovery-credentials).
const RECOVERY_ALLOWED_PREFIXES = [
	"/recovery-enroll",
	"/logout",
	"/api/logout",
	"/api/session-ping",
];

function isRecoveryAllowed(pathname: string): boolean {
	return RECOVERY_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
	await startupMigrations;

	const { pathname, hostname } = event.url;

	// SECURITY: Host Header Validation
	// Prevent LAN exposure by ensuring the request is targeted at localhost.
	// This allows Windows <-> WSL2 communication via localhost forwarding
	// while blocking external network access.

	const allowedClientIps = new Set(["127.0.0.1", "::1"]);

	const clientIp = event.getClientAddress();
	if (!allowedClientIps.has(clientIp)) {
		return new Response("Forbidden: local access only.", { status: 403 });
	}

	if (hostname !== "localhost" && hostname !== "127.0.0.1") {
		// Log the attempt - security concern
		logError(
			"security",
			`Blocked external access attempt from hostname: ${hostname}`,
			{
				clientIp,
				hostname,
				pathname,
			},
		);
		return new Response("Forbidden", { status: 403 });
	}

	// Define route types
	const isAuthRoute =
		pathname.startsWith("/login") ||
		pathname.startsWith("/register") ||
		pathname.startsWith("/mfa-setup");

	// Get session token from HTTP-only cookie
	const sessionToken = event.cookies.get("session");

	if (!sessionToken) {
		if (isAuthRoute || pathname.startsWith("/unlock")) {
			return resolve(event);
		}
		// Data-bearing routes require authentication first
		if (
			pathname.startsWith("/accounts") ||
			pathname.startsWith("/settings") ||
			pathname.startsWith("/overview") ||
			pathname.startsWith("/goals") ||
			pathname.startsWith("/alerts") ||
			pathname.startsWith("/tools") ||
			pathname === "/" ||
			pathname.startsWith("/api/")
		) {
			loginRedirect("logged-out", event.url);
		}
		return resolve(event);
	}

	// Validate session with database
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.token, sessionToken),
		with: {
			user: true,
		},
	});

	if (!session) {
		event.cookies.delete("session", { path: "/" });
		if (isAuthRoute || pathname.startsWith("/unlock")) {
			return resolve(event);
		}
		if (
			pathname.startsWith("/accounts") ||
			pathname.startsWith("/settings") ||
			pathname.startsWith("/overview") ||
			pathname.startsWith("/goals") ||
			pathname.startsWith("/alerts") ||
			pathname.startsWith("/tools") ||
			pathname === "/" ||
			pathname.startsWith("/api/")
		) {
			loginRedirect("logged-out", event.url);
		}
		return resolve(event);
	}

	// Server-side session expiry (24h inactivity) — this is the ENFORCEMENT
	// clock. The client session-timer (src/lib/utils/session-timer.svelte.ts)
	// is the UX warning layered on top; the per-user inactivityTimeout
	// setting configures the client timer only. Expiry BOTH ends the session
	// AND seals the keyring (DataKey wiped) as one single event
	// (spec session-expiry-reliability, MODIFIED).
	if (Date.now() - session.lastActivity.getTime() > MS_PER_DAY) {
		await db.delete(sessions).where(eq(sessions.token, sessionToken));
		event.cookies.delete("session", { path: "/" });
		sealKeyring("session-expired");
		loginRedirect("expired", event.url);
	}

	// If logged in and trying to access auth routes — send sealed users to
	// the unlock ceremony instead of the (data-bearing) home route.
	if (isAuthRoute && !pathname.startsWith("/mfa-setup")) {
		if (!isUnlockedFor(session.user.id)) {
			unlockRedirect("sealed", event.url);
		}
		throw redirect(302, HOME_ROUTE);
	}

	// Session valid - update last activity
	await db
		.update(sessions)
		.set({ lastActivity: new Date() })
		.where(eq(sessions.token, sessionToken));

	// Populate locals with user data
	event.locals.user = session.user;
	event.locals.session = session;

	// ------------------------------------------------------------------------
	// Envelope keyring guard (spec envelope-encryption: sealed state denies
	// data reads and is user-visibly routed).
	// ------------------------------------------------------------------------
	const userId = session.user.id;

	if (!isUnlockedFor(userId)) {
		const enrolled = await hasEnvelope(db, userId);

		if (!enrolled) {
			// Legacy account (pre-envelope): the one-shot migration enrolls the
			// envelope before any data-bearing route is usable (task 5.1).
			if (!isSealedAllowed(pathname) && !pathname.startsWith("/migrate")) {
				if (pathname.startsWith("/api/")) {
					return new Response(JSON.stringify({ error: "migration-required" }), {
						status: 401,
						headers: { "content-type": "application/json" },
					});
				}
				throw redirect(302, "/migrate");
			}
		} else if (!isSealedAllowed(pathname)) {
			// Sealed: no ciphertext or data values render; route to ceremony.
			if (pathname.startsWith("/api/")) {
				return new Response(JSON.stringify({ error: "sealed" }), {
					status: 401,
					headers: { "content-type": "application/json" },
				});
			}
			unlockRedirect("sealed", event.url);
		}
	} else if (
		keyringStatus().recoveryInitiated &&
		!isRecoveryAllowed(pathname)
	) {
		// Recovery-initiated session: forced re-enrollment before any
		// data-bearing route (spec recovery-credentials).
		if (pathname.startsWith("/api/")) {
			return new Response(
				JSON.stringify({ error: "recovery-re-enrollment-required" }),
				{ status: 401, headers: { "content-type": "application/json" } },
			);
		}
		throw redirect(302, "/recovery-enroll?mode=recovery");
	} else {
		// Unlocked — but enrollment must be COMPLETE (recovery paper is
		// required at account creation / migration; spec recovery-credentials).
		const recoverySlots = await countActiveSlots(
			db,
			userId,
			"recovery-passphrase",
		);
		if (recoverySlots === 0 && !isSealedAllowed(pathname)) {
			throw redirect(302, "/recovery-enroll");
		}
	}

	return resolve(event);
};

/**
 * Global error handler for server-side errors
 * Logs all unexpected errors for debugging and monitoring
 */
export const handleError: HandleServerError = async ({ error, event }) => {
	// Log the error with context
	logError("server", "Unhandled server error", error);

	// Include request context for debugging
	const errorContext = {
		url: event.url.href,
		method: event.request.method,
		hasSession: !!event.locals.session,
		hasUser: !!event.locals.user,
	};

	logError("server", "Request context for error", errorContext);

	// Return user-friendly error message
	return {
		message: "An unexpected error occurred. Please try again later.",
		// In development, include the error details for debugging
		...(process.env.APP_ENV === "development" && {
			developerMessage: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		}),
	};
};
