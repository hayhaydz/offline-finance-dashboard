import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { json } from "@sveltejs/kit";
import { db } from "$lib/db/client";
import {
	completeDeviceEnrollment,
	completeDeviceEnrollmentEval,
	stageDeviceEnrollment,
	WebAuthnCeremonyError,
} from "$lib/server/crypto/webauthn";
import { logError } from "$lib/server/logger";
import { getAuthUser } from "$lib/server/utils/auth-guard";
import type { RequestHandler } from "./$types";

/**
 * POST /settings/security/device/verify — complete PRF enrollment.
 *
 * Three body shapes:
 *  1. { token, registration, prfOutput, label? } — CTAP2.1-style: the PRF
 *     was evaluated during create(); verify + write the slot directly.
 *  2. { token, registration, label? } — CTAP2.0 fallback (fidont, most
 *     hmac-secret keys): verify the registration, write NOTHING, return
 *     { evalRequired: true, token, options, salt } for the eval assertion.
 *  3. { token, assertion, prfOutput, label? } — the eval assertion from
 *     (2): verify (UV required), probe the PRF output, write the slot.
 *
 * Capability probe: a non-PRF authenticator is refused with NO slot written.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = getAuthUser(locals);
	if (!user) {
		return json({ error: "Authentication required" }, { status: 401 });
	}

	let body: {
		token?: string;
		registration?: RegistrationResponseJSON;
		assertion?: AuthenticationResponseJSON;
		prfOutput?: string;
		label?: string;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body" }, { status: 400 });
	}
	if (!body.token) {
		return json({ error: "token is required" }, { status: 400 });
	}

	try {
		// Case 1: PRF evaluated at create() — finish in one round trip.
		if (body.registration && body.prfOutput) {
			const { slotId } = await completeDeviceEnrollment(db, {
				userId: user.id,
				token: body.token,
				registration: body.registration,
				prfOutput: body.prfOutput,
				label: body.label,
			});
			return json({
				ok: true,
				slotId,
				message:
					"Device slot enrolled. Unlock now requires password + this device (2-of-2).",
			});
		}

		// Case 2: CTAP2.0 — PRF only evaluable on an assertion; stage it.
		if (body.registration) {
			const staged = await stageDeviceEnrollment(db, {
				userId: user.id,
				token: body.token,
				registration: body.registration,
				label: body.label,
			});
			return json({ ok: true, evalRequired: true, ...staged });
		}

		// Case 3: eval assertion completes the staged enrollment.
		if (body.assertion && body.prfOutput) {
			const { slotId } = await completeDeviceEnrollmentEval(db, {
				userId: user.id,
				token: body.token,
				assertion: body.assertion,
				prfOutput: body.prfOutput,
				label: body.label,
			});
			return json({
				ok: true,
				slotId,
				message:
					"Device slot enrolled. Unlock now requires password + this device (2-of-2).",
			});
		}

		return json(
			{
				error:
					"registration+prfOutput, registration, or assertion+prfOutput is required",
			},
			{ status: 400 },
		);
	} catch (error) {
		if (error instanceof WebAuthnCeremonyError) {
			return json({ error: error.message, code: error.code }, { status: 400 });
		}
		logError("webauthn", "Enrollment verification failed", error);
		return json({ error: "Enrollment failed" }, { status: 500 });
	}
};
