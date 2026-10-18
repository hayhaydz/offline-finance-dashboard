import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * POST /api/session-ping
 *
 * "Stay signed in" target for the session-expiry banner. Authenticated
 * requests already refresh the server-side session lastActivity in
 * hooks.server.ts (the enforcement clock), so the body only acknowledges.
 */
export const POST: RequestHandler = async () => json({ success: true });
