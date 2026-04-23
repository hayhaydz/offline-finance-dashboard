import type { Handle, HandleServerError } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { HOME_ROUTE, LOGIN_ROUTE } from "$lib/constants/routes";
import { db } from "$lib/db/client";
import { sessions } from "$lib/db/schema";
import { runMigrations } from "$lib/db/migrate";
import { logError } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

// Run migrations once per server process and block requests until complete.
const startupMigrations = runMigrations();

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

	const isProtectedRoute =
		pathname.startsWith("/accounts") ||
		pathname.startsWith("/settings") ||
		pathname.startsWith("/overview/snapshots") ||
		pathname.startsWith("/app");

	// Get session token from HTTP-only cookie
	const sessionToken = event.cookies.get("session");

	if (!sessionToken) {
		if (isProtectedRoute) {
			throw redirect(302, LOGIN_ROUTE);
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
		if (isProtectedRoute) {
			throw redirect(302, LOGIN_ROUTE);
		}
		return resolve(event);
	}

	// Check session expiration (24-hour inactivity)
	if (Date.now() - session.lastActivity.getTime() > MS_PER_DAY) {
		await db.delete(sessions).where(eq(sessions.token, sessionToken));
		event.cookies.delete("session", { path: "/" });
		if (isProtectedRoute) {
			throw redirect(302, LOGIN_ROUTE);
		}
		return resolve(event);
	}

	// If logged in and trying to access auth routes (except mfa-setup which might be needed)
	if (isAuthRoute && !pathname.startsWith("/mfa-setup")) {
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
