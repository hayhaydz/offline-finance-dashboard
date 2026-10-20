import { json } from "@sveltejs/kit";
import { db } from "$lib/db/client";
import {
	beginDeviceUnlock,
	WebAuthnCeremonyError,
} from "$lib/server/crypto/webauthn";
import { logError } from "$lib/server/logger";
import { getAuthUser } from "$lib/server/utils/auth-guard";
import type { RequestHandler } from "./$types";

/**
 * POST /unlock/device-options — begin the unlock ceremony's device step
 * (assertion options for the user's enrolled device slots, UV required).
 * Session-holding but sealed users reach this: /unlock is sealed-allowed.
 */
export const POST: RequestHandler = async ({ locals }) => {
	const user = getAuthUser(locals);
	if (!user) {
		return json({ error: "Authentication required" }, { status: 401 });
	}
	try {
		const start = await beginDeviceUnlock(db, user.id);
		return json(start);
	} catch (error) {
		if (error instanceof WebAuthnCeremonyError) {
			return json({ error: error.message, code: error.code }, { status: 400 });
		}
		logError("webauthn", "Device unlock options failed", error);
		return json({ error: "Could not start device step" }, { status: 500 });
	}
};
