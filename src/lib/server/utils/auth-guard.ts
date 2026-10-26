/**
 * Server-side authentication guard.
 *
 * Eliminates the repeated `if (!locals.user) redirect(302, "/login")` boilerplate
 * across 37+ server files.
 *
 * Usage in load functions:
 *   const user = requireAuth(locals);
 *
 * Usage in actions:
 *   const user = getAuthUser(locals);
 *   if (!user) return fail(401, { error: "Unauthorized" });
 */

import { redirect } from "@sveltejs/kit";

/**
 * Browser-safe user DTO (auth-session-hardening spec: page data never
 * contains secret material). The ONLY user shape any load may return —
 * `locals.user` is the full `users` row (passwordHash, passwordSalt) and
 * must never be serialized to the client.
 */
export interface UserDto {
	id: number;
	username: string;
	createdAt: Date;
	inactivityTimeout: number | null;
}

export function userDto(user: {
	id: number;
	username: string;
	createdAt: Date;
	inactivityTimeout: number | null;
}): UserDto {
	return {
		id: user.id,
		username: user.username,
		createdAt: user.createdAt,
		inactivityTimeout: user.inactivityTimeout,
	};
}

/**
 * Require authentication in a load function.
 *
 * Returns the user if authenticated, throws redirect to /login if not.
 *
 * @param locals - SvelteKit locals from load function
 * @returns The authenticated user
 * @throws Redirects to /login if not authenticated
 */
export function requireAuth(
	locals: App.Locals,
): NonNullable<App.Locals["user"]> {
	if (!locals.user) {
		redirect(302, "/login");
	}
	return locals.user;
}

/**
 * Get the authenticated user in a form action.
 *
 * Returns the user if authenticated, or null if not.
 * The caller is responsible for returning `fail(401, ...)`.
 *
 * @param locals - SvelteKit locals from action function
 * @returns The authenticated user, or null if not authenticated
 */
export function getAuthUser(
	locals: App.Locals,
): NonNullable<App.Locals["user"]> | null {
	return locals.user ?? null;
}
