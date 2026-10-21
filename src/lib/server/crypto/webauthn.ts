import crypto from "node:crypto";
import {
	type AuthenticationResponseJSON,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, eq, sql } from "drizzle-orm";
import { credentialSlots, users } from "$lib/db/schema";
import { logError, logInfo } from "$lib/server/logger";
import { getActiveSlots, type KeyringDb, type SlotRecord } from "./enroll";
import {
	EnvelopeError,
	generateSlotId,
	unwrapSlot,
	wrapSlot,
} from "./envelope";
import { requireDataKey } from "./keyring";

/**
 * WebAuthn PRF device slot (L2, design D4; tasks 6.1–6.3).
 *
 * The authenticator holds a secret that never leaves the device; the PRF
 * (hmac-secret) extension derives a 32-byte output from
 * (device secret, salt). That output wraps a copy of the user's DataKey as
 * a `webauthn-prf` slot — the server stores only the credential record
 * (id/public key/counter) and the PUBLIC salt. RP ID is `localhost` (a
 * secure context by spec — no HTTPS needed for this single-device app).
 *
 * 2-of-2 enforcement: the unlock ceremony requires BOTH the password slot
 * unwrap AND a signed assertion (UV=true) whose PRF output unwraps a device
 * slot — and both unwraps must yield the SAME DataKey. The keyring is only
 * unlocked when the two factors agree (spec unlock-ceremony).
 *
 * Salt policy: ONE PRF salt per user, shared by all their device slots —
 * different authenticators produce different outputs for the same salt
 * (each is keyed by its own secret), and the browser can request the PRF
 * evaluation before knowing which credential the user will pick.
 *
 * Extensions transport: `prf.eval.first` is a BufferSource and cannot
 * survive JSON — options are returned WITHOUT extensions plus the salt
 * (base64); the CLIENT injects the prf extension before invoking the
 * browser helpers (works for both create and get).
 *
 * CTAP2.0 fallback (live verification): most hmac-secret authenticators do
 * NOT evaluate the PRF during create() — they only report `enabled`. For
 * those, the client POSTs the registration WITHOUT a prfOutput; the server
 * verifies it, stages the credential in memory (NO slot written) and hands
 * back authentication options for the SAME credential. The client runs an
 * immediate get() with `prf.eval.first` (second touch) and completes the
 * enrollment with that assertion. CTAP2.1 keys (hmac-secret-mc) evaluate
 * during create() and finish in one round trip.
 *
 * Salt pinning: the salt is generated at ceremony START and carried in the
 * pending ceremony record — the slot is written with exactly the salt the
 * client evaluated. Re-deriving at write time would mint a fresh salt for
 * a first device slot and permanently break its unlock.
 */

export const WEBAUTHN_RP_ID = "localhost";
export const WEBAUTHN_RP_NAME = "Offline Finance Dashboard";

/** Default localhost origins: dev (5173), preview (4173), prod build (3000). */
const DEFAULT_ORIGINS = [
	"http://localhost:5173",
	"http://localhost:4173",
	"http://localhost:3000",
];

export function expectedOrigins(): string[] {
	const raw = process.env.WEBAUTHN_EXPECTED_ORIGINS;
	if (raw) {
		return raw
			.split(",")
			.map((o) => o.trim())
			.filter(Boolean);
	}
	const appEnv = process.env.APP_ENV;
	if (!appEnv || appEnv === "development") {
		return DEFAULT_ORIGINS;
	}
	// Fail closed outside development: no fabricated origins, no silent
	// acceptance of arbitrary source origins. Surfaced at the first ceremony
	// that needs them (clear log, typed error).
	logError(
		"webauthn",
		"WEBAUTHN_EXPECTED_ORIGINS is not set (non-development APP_ENV) — ceremonies fail closed",
		{ appEnv },
	);
	throw new WebAuthnCeremonyError(
		"ORIGINS_UNCONFIGURED",
		"WebAuthn expected origins are not configured — set WEBAUTHN_EXPECTED_ORIGINS",
	);
}

/**
 * Global enrollment kill switch (deploy-wide; task 6.4: enrollment ships
 * dark until the owner verifies PRF/UV live and flips WEBAUTHN_PRF_ENABLED).
 * Per-account opt-in lives in users.deviceEnrollmentEnabled. Enforcement for
 * ALREADY-enrolled users is never gated — neither switch can strand a user.
 */
export function isDeviceEnrollmentEnabled(): boolean {
	return process.env.WEBAUTHN_PRF_ENABLED === "true";
}

/** Per-account opt-in (users.deviceEnrollmentEnabled). */
export async function isDeviceEnrollmentEnabledForUser(
	db: KeyringDb,
	userId: number,
): Promise<boolean> {
	const row = await db
		.select({ enabled: users.deviceEnrollmentEnabled })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row[0]?.enabled === true;
}

async function assertEnrollmentAllowed(db: KeyringDb, userId: number) {
	if (!isDeviceEnrollmentEnabled()) {
		throw new WebAuthnCeremonyError(
			"ENROLLMENT_DISABLED",
			"Device enrollment is globally disabled (pending live verification — see .docs checklist)",
		);
	}
	if (!(await isDeviceEnrollmentEnabledForUser(db, userId))) {
		throw new WebAuthnCeremonyError(
			"ENROLLMENT_DISABLED",
			"Device enrollment is off for this account — enable it in settings/security first",
		);
	}
}

export class WebAuthnCeremonyError extends Error {
	constructor(
		readonly code:
			| "PRF_UNSUPPORTED"
			| "VERIFICATION_FAILED"
			| "CHALLENGE_EXPIRED"
			| "UNKNOWN_CREDENTIAL"
			| "ENROLLMENT_DISABLED"
			| "KEY_MISMATCH"
			| "ORIGINS_UNCONFIGURED",
		message: string,
	) {
		super(message);
		this.name = "WebAuthnCeremonyError";
	}
}

// ---------------------------------------------------------------------------
// Challenge store — in-memory, TTL, single-use. Process restart invalidates
// pending ceremonies (harmless: the user simply restarts the ceremony).
// ---------------------------------------------------------------------------

/** Registration verified on the CTAP2.0 path, awaiting the eval assertion. */
interface StagedCredential {
	label?: string;
	credentialId: string;
	publicKey: string; // base64 COSE key
	counter: number;
	transports?: string[];
	deviceType?: string;
	backedUp?: boolean;
	aaguid?: string;
}

interface PendingCeremony {
	userId: number;
	purpose: "enroll" | "enroll-eval" | "unlock";
	challenge: string;
	expiresAt: number;
	/** Hex PRF salt PINNED to this ceremony — the client evaluates the PRF
	 * with THIS salt and the slot is written with THIS salt. Re-deriving at
	 * write time would mint a fresh salt for a first device slot (salt is
	 * only stable once a slot exists) and permanently break its unlock. */
	prfSalt?: string;
	/** Present only for purpose "enroll-eval" (CTAP2.0 fallback). */
	stagedCredential?: StagedCredential;
}

const CHALLENGE_TTL_MS = 3 * 60 * 1000;
const pendingCeremonies = new Map<string, PendingCeremony>();

function sweepChallenges(now = Date.now()): void {
	for (const [token, ceremony] of pendingCeremonies) {
		if (ceremony.expiresAt < now) pendingCeremonies.delete(token);
	}
}

function storeChallenge(
	userId: number,
	purpose: PendingCeremony["purpose"],
	challenge: string,
	extra?: Pick<PendingCeremony, "prfSalt" | "stagedCredential">,
): string {
	sweepChallenges();
	const token = crypto.randomBytes(32).toString("hex");
	pendingCeremonies.set(token, {
		userId,
		purpose,
		challenge,
		expiresAt: Date.now() + CHALLENGE_TTL_MS,
		...extra,
	});
	return token;
}

function consumeChallenge(
	token: string,
	userId: number,
	purpose: PendingCeremony["purpose"],
): PendingCeremony {
	const ceremony = pendingCeremonies.get(token);
	pendingCeremonies.delete(token); // single-use
	if (!ceremony || ceremony.userId !== userId || ceremony.purpose !== purpose) {
		throw new WebAuthnCeremonyError(
			"CHALLENGE_EXPIRED",
			"Ceremony expired — restart the device step",
		);
	}
	if (ceremony.expiresAt < Date.now()) {
		throw new WebAuthnCeremonyError(
			"CHALLENGE_EXPIRED",
			"Ceremony expired — restart the device step",
		);
	}
	return ceremony;
}

// ---------------------------------------------------------------------------
// Device slot metadata (credential record lives in slot metadata — no new
// table; future slot kinds are enum values, per design D7).
// ---------------------------------------------------------------------------

export interface DeviceSlotMetadata {
	label: string;
	credentialId: string; // base64url — matches WebAuthn credential id
	publicKey: string; // base64 COSE key
	counter: number;
	transports?: string[];
	prfSalt: string; // hex — PUBLIC (per-user, shared across device slots)
	deviceType?: string; // singleDevice | multiDevice
	backedUp?: boolean;
	aaguid?: string;
	enrolledAt: string;
}

export async function getDeviceSlots(
	db: KeyringDb,
	userId: number,
): Promise<SlotRecord[]> {
	return getActiveSlots(db, userId, "webauthn-prf");
}

export function deviceMetadata(slot: SlotRecord): DeviceSlotMetadata | null {
	const m = slot.metadata as Partial<DeviceSlotMetadata>;
	if (typeof m.credentialId !== "string" || typeof m.publicKey !== "string") {
		return null;
	}
	// Salt integrity (spec unlock-ceremony): a device slot without its PRF
	// salt is corrupt — hard-fail instead of fabricating a random salt (a
	// fabricated salt would silently evaluate the wrong PRF input and
	// permanently brick the slot's unlock).
	if (typeof m.prfSalt !== "string") {
		throw new EnvelopeError(
			"BAD_FORMAT",
			"Device slot metadata is corrupt: missing prfSalt",
		);
	}
	return {
		label: typeof m.label === "string" ? m.label : "Device",
		credentialId: m.credentialId,
		publicKey: m.publicKey,
		counter: typeof m.counter === "number" ? m.counter : 0,
		transports: Array.isArray(m.transports) ? m.transports : undefined,
		prfSalt: m.prfSalt,
		deviceType: typeof m.deviceType === "string" ? m.deviceType : undefined,
		backedUp: typeof m.backedUp === "boolean" ? m.backedUp : undefined,
		aaguid: typeof m.aaguid === "string" ? m.aaguid : undefined,
		enrolledAt:
			typeof m.enrolledAt === "string"
				? m.enrolledAt
				: slot.createdAt.toISOString(),
	};
}

/** The per-user PRF salt: reuse the first device slot's, else generate fresh. */
export async function getUserDeviceSalt(
	db: KeyringDb,
	userId: number,
): Promise<string> {
	const slots = await getDeviceSlots(db, userId);
	for (const slot of slots) {
		const meta = deviceMetadata(slot);
		if (meta?.prfSalt) return meta.prfSalt;
	}
	return crypto.randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Enrollment (task 6.1)
// ---------------------------------------------------------------------------

export interface CeremonyStart {
	token: string;
	/** Options WITHOUT the prf extension (BufferSource cannot cross JSON). */
	options:
		| PublicKeyCredentialCreationOptionsJSON
		| PublicKeyCredentialRequestOptionsJSON;
	/** base64 PRF salt — the client injects `prf.eval.first` from this. */
	salt: string;
}

export async function beginDeviceEnrollment(
	db: KeyringDb,
	user: { id: number; username: string },
): Promise<CeremonyStart> {
	await assertEnrollmentAllowed(db, user.id);

	const slots = await getDeviceSlots(db, user.id);
	const salt = await getUserDeviceSalt(db, user.id);

	const options = await generateRegistrationOptions({
		rpName: WEBAUTHN_RP_NAME,
		rpID: WEBAUTHN_RP_ID,
		userName: user.username,
		userID: new TextEncoder().encode(`ofd-user-${user.id}`),
		attestationType: "none",
		excludeCredentials: slots
			.map((s) => deviceMetadata(s))
			.filter((m): m is DeviceSlotMetadata => m !== null)
			.map((m) => ({
				id: m.credentialId,
				transports: m.transports as never,
			})),
		authenticatorSelection: {
			// Cross-platform ONLY: slot 2 must be a physically separate
			// device (phone/hardware key over USB). Chrome otherwise defaults
			// the ceremony to this machine's platform authenticator (Touch
			// ID / iCloud Keychain) — both halves on one machine is theater,
			// not custody (design D4).
			authenticatorAttachment: "cross-platform",
			residentKey: "preferred",
			userVerification: "required",
		},
	});

	const token = storeChallenge(user.id, "enroll", options.challenge, {
		prfSalt: salt,
	});
	return { token, options, salt: toB64(fromHex(salt)) };
}

/**
 * Capability probe (spec: non-PRF authenticator is refused, no slot
 * written): the PRF output must be exactly 32 bytes (hmac-sha256) and not
 * the all-zero dummy some authenticators emit.
 */
function assertUsablePrfOutput(userId: number, prfOutputB64: string): Buffer {
	const prfKey = Buffer.from(prfOutputB64, "base64");
	if (prfKey.length !== 32 || prfKey.every((b) => b === 0)) {
		logError("webauthn", "Enrollment refused: no usable PRF output", {
			userId,
			length: prfKey.length,
		});
		throw new WebAuthnCeremonyError(
			"PRF_UNSUPPORTED",
			"Authenticator/browser did not return a usable PRF output — enrollment refused, no slot written",
		);
	}
	return prfKey;
}

/** Credential fields as verified by the server, ready for slot storage. */
interface DeviceCredentialRecord {
	id: string;
	publicKeyBase64: string;
	counter: number;
	transports?: string[];
	deviceType?: string;
	backedUp?: boolean;
	aaguid?: string;
}

/** Wrap a DataKey copy with the PRF output and persist the slot. */
async function writeDeviceSlot(
	db: KeyringDb,
	params: {
		userId: number;
		prfKey: Buffer;
		saltHex: string;
		credential: DeviceCredentialRecord;
		label?: string;
	},
): Promise<string> {
	const dataKey = requireDataKey(params.userId); // settings: full unlock

	// Duplicate-credential guard (spec unlock-ceremony): reject a second
	// ACTIVE slot with the same credentialId regardless of client behavior
	// (excludeCredentials is advisory — the server decides).
	const existingSlots = await getDeviceSlots(db, params.userId);
	for (const slot of existingSlots) {
		if (deviceMetadata(slot)?.credentialId === params.credential.id) {
			throw new WebAuthnCeremonyError(
				"UNKNOWN_CREDENTIAL",
				"This device credential is already enrolled — no second slot written",
			);
		}
	}

	const slotId = generateSlotId();
	const wrapped = wrapSlot(dataKey, params.prfKey, {
		kind: "webauthn-prf",
		userId: params.userId,
		slotId,
	});

	const metadata: DeviceSlotMetadata = {
		label:
			params.label?.trim() ||
			`Device ${new Date().toLocaleDateString("en-GB")}`,
		credentialId: params.credential.id,
		publicKey: params.credential.publicKeyBase64,
		counter: params.credential.counter,
		transports: params.credential.transports,
		prfSalt: params.saltHex,
		deviceType: params.credential.deviceType,
		backedUp: params.credential.backedUp,
		aaguid: params.credential.aaguid,
		enrolledAt: new Date().toISOString(),
	};

	await db.insert(credentialSlots).values({
		slotId,
		userId: params.userId,
		kind: "webauthn-prf",
		wrappedKey: wrapped.wrappedKey,
		iv: wrapped.iv,
		metadata: metadata as unknown as Record<string, unknown>,
		createdAt: new Date(),
	});

	logInfo("webauthn", "Device slot enrolled (PRF-probed, UV required)", {
		userId: params.userId,
		slotId,
		credentialId: params.credential.id,
	});
	return slotId;
}

function registrationCredential(
	info: NonNullable<
		Awaited<ReturnType<typeof verifyRegistrationResponse>>["registrationInfo"]
	>,
): DeviceCredentialRecord {
	return {
		id: info.credential.id,
		publicKeyBase64: Buffer.from(info.credential.publicKey).toString("base64"),
		counter: info.credential.counter ?? 0,
		transports: info.credential.transports,
		deviceType: info.credentialDeviceType,
		backedUp: info.credentialBackedUp,
		aaguid: info.aaguid,
	};
}

export async function completeDeviceEnrollment(
	db: KeyringDb,
	params: {
		userId: number;
		token: string;
		registration: RegistrationResponseJSON;
		prfOutput: string; // base64 — clientExtensionResults.prf.results.first
		label?: string;
	},
): Promise<{ slotId: string }> {
	await assertEnrollmentAllowed(db, params.userId);

	// Capability probe FIRST — a non-PRF authenticator never writes a slot.
	const prfKey = assertUsablePrfOutput(params.userId, params.prfOutput);

	const ceremony = consumeChallenge(params.token, params.userId, "enroll");

	const verification = await verifyRegistrationResponse({
		response: params.registration,
		expectedChallenge: ceremony.challenge,
		expectedOrigin: expectedOrigins(),
		expectedRPID: WEBAUTHN_RP_ID,
		requireUserVerification: true,
	});

	if (!verification.verified || !verification.registrationInfo) {
		throw new WebAuthnCeremonyError(
			"VERIFICATION_FAILED",
			"Device registration could not be verified",
		);
	}

	const salt = ceremony.prfSalt ?? (await getUserDeviceSalt(db, params.userId));

	const slotId = await writeDeviceSlot(db, {
		userId: params.userId,
		prfKey,
		saltHex: salt,
		credential: registrationCredential(verification.registrationInfo),
		label: params.label,
	});
	return { slotId };
}

/**
 * CTAP2.0 fallback, step 1: the authenticator reported `prf.enabled` but
 * produced no output at create() (fidont, YubiKeys < 5.7, most hmac-secret
 * keys). Verify the registration, write NOTHING, and return authentication
 * options scoped to the fresh credential so the client can evaluate
 * `prf.eval.first` on an immediate assertion (second touch).
 */
export async function stageDeviceEnrollment(
	db: KeyringDb,
	params: {
		userId: number;
		token: string;
		registration: RegistrationResponseJSON;
		label?: string;
	},
): Promise<
	Omit<CeremonyStart, "options"> & {
		options: PublicKeyCredentialRequestOptionsJSON;
	}
> {
	await assertEnrollmentAllowed(db, params.userId);

	const ceremony = consumeChallenge(params.token, params.userId, "enroll");

	const verification = await verifyRegistrationResponse({
		response: params.registration,
		expectedChallenge: ceremony.challenge,
		expectedOrigin: expectedOrigins(),
		expectedRPID: WEBAUTHN_RP_ID,
		requireUserVerification: true,
	});

	if (!verification.verified || !verification.registrationInfo) {
		throw new WebAuthnCeremonyError(
			"VERIFICATION_FAILED",
			"Device registration could not be verified",
		);
	}
	const info = verification.registrationInfo;

	const options = await generateAuthenticationOptions({
		rpID: WEBAUTHN_RP_ID,
		allowCredentials: [
			{
				id: info.credential.id,
				transports: info.credential.transports as never,
			},
		],
		userVerification: "required",
	});

	const cred = registrationCredential(info);
	const staged: StagedCredential = {
		label: params.label,
		credentialId: cred.id,
		publicKey: cred.publicKeyBase64,
		counter: cred.counter,
		transports: cred.transports,
		deviceType: cred.deviceType,
		backedUp: cred.backedUp,
		aaguid: cred.aaguid,
	};

	const token = storeChallenge(
		params.userId,
		"enroll-eval",
		options.challenge,
		{ prfSalt: ceremony.prfSalt, stagedCredential: staged },
	);

	return {
		token,
		options,
		salt: toB64(fromHex(ceremony.prfSalt ?? "")),
	};
}

/**
 * CTAP2.0 fallback, step 2: the eval assertion completes the staged
 * enrollment — verify it (UV required), probe the PRF output, write the
 * slot with the SAME ceremony salt the client evaluated.
 */
export async function completeDeviceEnrollmentEval(
	db: KeyringDb,
	params: {
		userId: number;
		token: string;
		assertion: AuthenticationResponseJSON;
		prfOutput: string; // base64
		label?: string;
	},
): Promise<{ slotId: string }> {
	await assertEnrollmentAllowed(db, params.userId);

	// Capability probe FIRST — no slot for a non-PRF authenticator.
	const prfKey = assertUsablePrfOutput(params.userId, params.prfOutput);

	const ceremony = consumeChallenge(params.token, params.userId, "enroll-eval");
	const staged = ceremony.stagedCredential;
	if (!staged) {
		throw new WebAuthnCeremonyError(
			"CHALLENGE_EXPIRED",
			"Ceremony expired — restart the device step",
		);
	}
	if (params.assertion.id !== staged.credentialId) {
		throw new WebAuthnCeremonyError(
			"UNKNOWN_CREDENTIAL",
			"Assertion is not from the staged credential",
		);
	}

	const verification = await verifyAuthenticationResponse({
		response: params.assertion,
		expectedChallenge: ceremony.challenge,
		expectedOrigin: expectedOrigins(),
		expectedRPID: WEBAUTHN_RP_ID,
		credential: {
			id: staged.credentialId,
			publicKey: new Uint8Array(Buffer.from(staged.publicKey, "base64")),
			counter: staged.counter,
			transports: staged.transports as never,
		},
		requireUserVerification: true, // rejects UV=false assertions
	});

	if (!verification.verified || !verification.authenticationInfo.userVerified) {
		throw new WebAuthnCeremonyError(
			"VERIFICATION_FAILED",
			"Device assertion could not be verified (UV required)",
		);
	}

	const salt = ceremony.prfSalt ?? (await getUserDeviceSalt(db, params.userId));

	const slotId = await writeDeviceSlot(db, {
		userId: params.userId,
		prfKey,
		saltHex: salt,
		credential: {
			id: staged.credentialId,
			publicKeyBase64: staged.publicKey,
			counter: verification.authenticationInfo.newCounter,
			transports: staged.transports,
			deviceType: staged.deviceType,
			backedUp: staged.backedUp,
			aaguid: staged.aaguid,
		},
		label: params.label ?? staged.label,
	});
	return { slotId };
}

// ---------------------------------------------------------------------------
// Unlock ceremony device step (task 6.2)
// ---------------------------------------------------------------------------

export async function beginDeviceUnlock(
	db: KeyringDb,
	userId: number,
): Promise<CeremonyStart> {
	const slots = await getDeviceSlots(db, userId);
	if (slots.length === 0) {
		throw new WebAuthnCeremonyError(
			"UNKNOWN_CREDENTIAL",
			"No enrolled device slots",
		);
	}
	const salt = await getUserDeviceSalt(db, userId);

	const options = await generateAuthenticationOptions({
		rpID: WEBAUTHN_RP_ID,
		allowCredentials: slots
			.map((s) => deviceMetadata(s))
			.filter((m): m is DeviceSlotMetadata => m !== null)
			.map((m) => ({
				id: m.credentialId,
				transports: m.transports as never,
			})),
		userVerification: "required", // spec: UV cryptographically enforced
	});

	const token = storeChallenge(userId, "unlock", options.challenge);
	return { token, options, salt: toB64(fromHex(salt)) };
}

export async function completeDeviceUnlock(
	db: KeyringDb,
	params: {
		userId: number;
		token: string;
		assertion: AuthenticationResponseJSON;
		prfOutput: string;
	},
): Promise<Buffer> {
	const slots = await getDeviceSlots(db, params.userId);
	const slot = slots.find(
		(s) => deviceMetadata(s)?.credentialId === params.assertion.id,
	);
	if (!slot) {
		throw new WebAuthnCeremonyError(
			"UNKNOWN_CREDENTIAL",
			"Assertion is not from an enrolled device slot",
		);
	}
	const meta = deviceMetadata(slot);
	if (!meta) {
		throw new EnvelopeError("BAD_FORMAT", "Device slot metadata corrupt");
	}

	const ceremony = consumeChallenge(params.token, params.userId, "unlock");

	const verification = await verifyAuthenticationResponse({
		response: params.assertion,
		expectedChallenge: ceremony.challenge,
		expectedOrigin: expectedOrigins(),
		expectedRPID: WEBAUTHN_RP_ID,
		credential: {
			id: meta.credentialId,
			publicKey: new Uint8Array(Buffer.from(meta.publicKey, "base64")),
			counter: meta.counter,
			transports: meta.transports as never,
		},
		requireUserVerification: true, // rejects UV=false assertions
	});

	if (!verification.verified || !verification.authenticationInfo.userVerified) {
		throw new WebAuthnCeremonyError(
			"VERIFICATION_FAILED",
			"Device assertion could not be verified (UV required)",
		);
	}

	// PRF output unwraps the device slot's DataKey copy.
	const prfKey = Buffer.from(params.prfOutput, "base64");
	if (prfKey.length !== 32) {
		throw new WebAuthnCeremonyError(
			"PRF_UNSUPPORTED",
			"No usable PRF output — rerun the device step",
		);
	}
	let dataKey: Buffer;
	try {
		dataKey = unwrapSlot({ wrappedKey: slot.wrappedKey, iv: slot.iv }, prfKey, {
			kind: "webauthn-prf",
			userId: params.userId,
			slotId: slot.slotId,
		});
	} catch {
		throw new WebAuthnCeremonyError(
			"VERIFICATION_FAILED",
			"Device slot unwrap failed — wrong device secret",
		);
	}

	// Persist the reported counter (replay protection moving target).
	// Atomic (spec unlock-ceremony): writes ONLY the counter field via
	// json_set — no read-modify-write of the whole metadata blob — scoped to
	// slotId+userId (RLS parity), with a max() guard so a concurrent
	// ceremony's higher counter can never regress.
	await db
		.update(credentialSlots)
		.set({
			metadata: sql`json_set(${credentialSlots.metadata}, '$.counter', max(coalesce(json_extract(${credentialSlots.metadata}, '$.counter'), 0), ${verification.authenticationInfo.newCounter}))`,
		})
		.where(
			and(
				eq(credentialSlots.slotId, slot.slotId),
				eq(credentialSlots.userId, params.userId),
			),
		);

	return dataKey;
}

// ---------------------------------------------------------------------------
// Small codecs
// ---------------------------------------------------------------------------

function fromHex(hex: string): Buffer {
	return Buffer.from(hex, "hex");
}

function toB64(buf: Buffer): string {
	return buf.toString("base64");
}
