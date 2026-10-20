import { json } from "@sveltejs/kit";
import { db } from "$lib/db/client";
import { requireDataKey } from "$lib/server/crypto/keyring";
import {
	beginDeviceEnrollment,
	WebAuthnCeremonyError,
} from "$lib/server/crypto/webauthn";
import { logError } from "$lib/server/logger";
import { getAuthUser } from "$lib/server/utils/auth-guard";
import type { RequestHandler } from "./$types";

/**
 * POST /settings/security/device/start — begin PRF enrollment.
 * Requires an authenticated, FULLY UNLOCKED session (the ceremony wraps a
 * DataKey copy with the PRF output).
 */
export const POST: RequestHandler = async ({ locals }) => {
	const user = getAuthUser(locals);
	if (!user) {
		return json({ error: "Authentication required" }, { status: 401 });
	}
	try {
		requireDataKey(user.id); // full unlock required
		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		return json(start);
	} catch (error) {
		if (error instanceof WebAuthnCeremonyError) {
			return json({ error: error.message, code: error.code }, { status: 400 });
		}
		if (error instanceof Error && error.name === "SealedError") {
			return json(
				{ error: "Keyring is sealed — unlock first", code: "SEALED" },
				{ status: 403 },
			);
		}
		logError("webauthn", "Enrollment start failed", error);
		return json({ error: "Enrollment failed to start" }, { status: 500 });
	}
};
