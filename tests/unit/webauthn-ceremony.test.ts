import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import { credentialSlots, users } from "$lib/db/schema";
import { enrollPasswordSlot } from "$lib/server/crypto/enroll";
import {
	keyringStatus,
	sealKeyring,
	unlockKeyring,
} from "$lib/server/crypto/keyring";
import {
	beginDeviceEnrollment,
	beginDeviceUnlock,
	completeDeviceEnrollment,
	completeDeviceEnrollmentEval,
	completeDeviceUnlock,
	deviceMetadata,
	expectedOrigins,
	getDeviceSlots,
	stageDeviceEnrollment,
	WebAuthnCeremonyError,
} from "$lib/server/crypto/webauthn";
import { EnvelopeError } from "$lib/server/crypto/envelope";

/**
 * L2 WebAuthn PRF ceremony (tasks 6.1–6.3) with @simplewebauthn/server
 * mocked — signature/UV crypto correctness is that library's job; these
 * tests verify OUR orchestration: challenge lifecycle, PRF capability
 * probe, slot persistence, UV enforcement, and 2-of-2 unwrap agreement.
 */

const verifyRegistrationResponse = vi.hoisted(() => vi.fn());
const verifyAuthenticationResponse = vi.hoisted(() => vi.fn());

vi.mock("@simplewebauthn/server", () => ({
	generateRegistrationOptions: vi.fn(async () => ({
		challenge: "reg-challenge-1",
		rp: { name: "OFD", id: "localhost" },
		user: { id: "x", name: "u", displayName: "u" },
		pubKeyCredParams: [],
		timeout: 60000,
		excludeCredentials: [],
		authenticatorSelection: { userVerification: "required" },
		attestation: "none",
	})),
	generateAuthenticationOptions: vi.fn(
		async (opts?: { allowCredentials?: Array<{ id: string }> }) => ({
			challenge: "auth-challenge-1",
			rpId: "localhost",
			allowCredentials: opts?.allowCredentials ?? [],
			timeout: 60000,
			userVerification: "required",
		}),
	),
	verifyRegistrationResponse,
	verifyAuthenticationResponse,
}));

const dataKey = crypto.randomBytes(32);
const prfKey = crypto.randomBytes(32);
let _userId: number;
let cleanupIds: number[] = [];

async function insertUser() {
	const [user] = await db
		.insert(users)
		.values({
			username: `webauthn-user-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			passwordHash: "hash",
			totpSecret: "REMOVED",
			totpSecretIV: "REMOVED",
			passwordSalt: crypto.randomBytes(16).toString("hex"),
			deviceEnrollmentEnabled: true,
		})
		.returning();
	cleanupIds.push(user.id);
	return user;
}

beforeEach(() => {
	vi.clearAllMocks();
	process.env.WEBAUTHN_PRF_ENABLED = "true";
	process.env.WEBAUTHN_EXPECTED_ORIGINS = "http://localhost:5173";
});

afterEach(async () => {
	process.env.WEBAUTHN_PRF_ENABLED = undefined;
	sealKeyring("test-teardown");
	if (cleanupIds.length > 0) {
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, cleanupIds));
		await db.delete(users).where(inArray(users.id, cleanupIds));
		cleanupIds = [];
	}
});

function regResponse() {
	return { id: "cred-1", rawId: "cred-1", type: "public-key" } as never;
}
function authResponse(credentialId: string) {
	return { id: credentialId, rawId: credentialId, type: "public-key" } as never;
}
function registrationInfo(credentialId = "cred-1") {
	return {
		verified: true,
		registrationInfo: {
			credential: {
				id: credentialId,
				publicKey: new Uint8Array(77),
				counter: 0,
				transports: ["ble"],
			},
			credentialDeviceType: "singleDevice",
			credentialBackedUp: false,
			aaguid: "00000000-0000-0000-0000-000000000000",
		},
	};
}

describe("device enrollment (task 6.1)", () => {
	it("refuses to start when globally disabled (ships dark until live test)", async () => {
		process.env.WEBAUTHN_PRF_ENABLED = "false";
		const user = await insertUser();
		await expect(
			beginDeviceEnrollment(db, { id: user.id, username: user.username }),
		).rejects.toMatchObject({ code: "ENROLLMENT_DISABLED" });
	});

	it("refuses to start when the PER-ACCOUNT switch is off", async () => {
		const user = await insertUser();
		await db
			.update(users)
			.set({ deviceEnrollmentEnabled: false })
			.where(inArray(users.id, [user.id]));
		await expect(
			beginDeviceEnrollment(db, { id: user.id, username: user.username }),
		).rejects.toMatchObject({ code: "ENROLLMENT_DISABLED" });
	});

	it("capability probe: no usable PRF output → refused, NO slot written", async () => {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);

		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});

		await expect(
			completeDeviceEnrollment(db, {
				userId: user.id,
				token: start.token,
				registration: regResponse(),
				prfOutput: crypto.randomBytes(16).toString("base64"), // wrong size
			}),
		).rejects.toMatchObject({ code: "PRF_UNSUPPORTED" });

		expect(await getDeviceSlots(db, user.id)).toHaveLength(0);
	});

	it("verification failure → no slot written", async () => {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);

		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue({ verified: false });

		await expect(
			completeDeviceEnrollment(db, {
				userId: user.id,
				token: start.token,
				registration: regResponse(),
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
		expect(await getDeviceSlots(db, user.id)).toHaveLength(0);
	});

	it("successful enrollment wraps the DataKey with the PRF output (UV required at verify)", async () => {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);

		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});

		verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: {
					id: "cred-1",
					publicKey: new Uint8Array(77),
					counter: 0,
					transports: ["usb"],
				},
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
				aaguid: "00000000-0000-0000-0000-000000000000",
			},
		});

		const { slotId } = await completeDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
			prfOutput: prfKey.toString("base64"),
			label: "Pixel 8",
		});

		const slots = await getDeviceSlots(db, user.id);
		expect(slots).toHaveLength(1);
		expect(slots[0].slotId).toBe(slotId);
		expect(slots[0].metadata.credentialId).toBe("cred-1");
		expect(slots[0].metadata.label).toBe("Pixel 8");

		// UV enforcement is requested from the verifier
		expect(verifyRegistrationResponse).toHaveBeenCalledWith(
			expect.objectContaining({ requireUserVerification: true }),
		);

		// Enrollment token is single-use
		await expect(
			completeDeviceEnrollment(db, {
				userId: user.id,
				token: start.token,
				registration: regResponse(),
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
	});

	it("pins the ceremony salt — slot stores the salt the client evaluated", async () => {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);

		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue(registrationInfo());

		await completeDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
			prfOutput: prfKey.toString("base64"),
		});

		// Regression: re-deriving the salt at write time minted a FRESH salt
		// for the first device slot → unlock would evaluate the wrong PRF
		// input and permanently fail the unwrap.
		const slots = await getDeviceSlots(db, user.id);
		expect(slots[0].metadata.prfSalt).toBe(
			Buffer.from(start.salt, "base64").toString("hex"),
		);
	});
});

describe("CTAP2.0 eval fallback (stage + assertion)", () => {
	async function stageableUser() {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);
		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue(registrationInfo());
		return { user, start };
	}

	it("stages a verified registration — auth options for the SAME credential, no slot, token single-use", async () => {
		const { user, start } = await stageableUser();

		const staged = await stageDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
			label: "fidont (BLE)",
		});

		expect(staged.options.allowCredentials).toHaveLength(1);
		expect(staged.options.allowCredentials?.[0]?.id).toBe("cred-1");
		expect(staged.options.userVerification).toBe("required");
		// Same ceremony salt travels to the eval assertion
		expect(staged.salt).toBe(start.salt);
		// NOTHING written yet
		expect(await getDeviceSlots(db, user.id)).toHaveLength(0);

		// The enroll token was consumed by staging
		await expect(
			stageDeviceEnrollment(db, {
				userId: user.id,
				token: start.token,
				registration: regResponse(),
			}),
		).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
	});

	it("eval assertion (UV=true) writes the slot; unlock with the SAME PRF output unwraps the DataKey", async () => {
		const { user, start } = await stageableUser();
		const staged = await stageDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
			label: "fidont (BLE)",
		});

		const evalPrf = crypto.randomBytes(32);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 1,
				userVerified: true,
			},
		});

		const { slotId } = await completeDeviceEnrollmentEval(db, {
			userId: user.id,
			token: staged.token,
			assertion: authResponse("cred-1"),
			prfOutput: evalPrf.toString("base64"),
		});

		const slots = await getDeviceSlots(db, user.id);
		expect(slots[0].slotId).toBe(slotId);
		expect(slots[0].metadata.label).toBe("fidont (BLE)");
		expect(slots[0].metadata.counter).toBe(1); // from the eval assertion
		// Salt pinned through the eval path too
		expect(slots[0].metadata.prfSalt).toBe(
			Buffer.from(start.salt, "base64").toString("hex"),
		);

		// End-to-end: a later unlock evaluates the PRF with the STORED salt
		// and must unwrap the same DataKey the slot was wrapped with.
		sealKeyring("between-ceremonies");
		const unlockStart = await beginDeviceUnlock(db, user.id);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 2,
				userVerified: true,
			},
		});
		const unwrapped = await completeDeviceUnlock(db, {
			userId: user.id,
			token: unlockStart.token,
			assertion: authResponse("cred-1"),
			prfOutput: evalPrf.toString("base64"),
		});
		expect(unwrapped.equals(dataKey)).toBe(true);
	});

	it("eval refuses a non-32-byte PRF output — no slot written", async () => {
		const { user, start } = await stageableUser();
		const staged = await stageDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
		});

		await expect(
			completeDeviceEnrollmentEval(db, {
				userId: user.id,
				token: staged.token,
				assertion: authResponse("cred-1"),
				prfOutput: crypto.randomBytes(16).toString("base64"),
			}),
		).rejects.toMatchObject({ code: "PRF_UNSUPPORTED" });
		expect(await getDeviceSlots(db, user.id)).toHaveLength(0);
	});

	it("eval rejects an assertion from a different credential", async () => {
		const { user, start } = await stageableUser();
		const staged = await stageDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
		});

		await expect(
			completeDeviceEnrollmentEval(db, {
				userId: user.id,
				token: staged.token,
				assertion: authResponse("not-staged"),
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toMatchObject({ code: "UNKNOWN_CREDENTIAL" });
		expect(await getDeviceSlots(db, user.id)).toHaveLength(0);
	});

	it("eval refuses UV=false assertions — no slot written", async () => {
		const { user, start } = await stageableUser();
		const staged = await stageDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
		});

		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 1,
				userVerified: false,
			},
		});
		await expect(
			completeDeviceEnrollmentEval(db, {
				userId: user.id,
				token: staged.token,
				assertion: authResponse("cred-1"),
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
		expect(await getDeviceSlots(db, user.id)).toHaveLength(0);
	});
});

describe("device unlock step (task 6.2)", () => {
	async function enrolledUser() {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);
		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: {
					id: "cred-1",
					publicKey: new Uint8Array(77),
					counter: 0,
					transports: ["usb"],
				},
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
				aaguid: "00000000-0000-0000-000000000000",
			},
		});
		await completeDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
			prfOutput: prfKey.toString("base64"),
		});
		sealKeyring("reset-between-ceremonies");
		return user;
	}

	it("rejects an assertion from an unknown credential", async () => {
		const user = await enrolledUser();
		const start = await beginDeviceUnlock(db, user.id);
		await expect(
			completeDeviceUnlock(db, {
				userId: user.id,
				token: start.token,
				assertion: authResponse("not-enrolled"),
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toMatchObject({ code: "UNKNOWN_CREDENTIAL" });
	});

	it("rejects an assertion without UV (signed userVerified=false)", async () => {
		const user = await enrolledUser();
		const start = await beginDeviceUnlock(db, user.id);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 1,
				userVerified: false, // UV absent in the signed flags
			},
		});
		await expect(
			completeDeviceUnlock(db, {
				userId: user.id,
				token: start.token,
				assertion: authResponse("cred-1"),
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
		// UV was required from the verifier
		expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
			expect.objectContaining({ requireUserVerification: true }),
		);
	});

	it("UV=true + correct PRF output unwraps the DataKey and updates the counter", async () => {
		const user = await enrolledUser();
		const start = await beginDeviceUnlock(db, user.id);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 7,
				userVerified: true,
			},
		});

		const unwrapped = await completeDeviceUnlock(db, {
			userId: user.id,
			token: start.token,
			assertion: authResponse("cred-1"),
			prfOutput: prfKey.toString("base64"),
		});
		expect(unwrapped.equals(dataKey)).toBe(true);

		// Counter persisted for replay protection
		const slots = await getDeviceSlots(db, user.id);
		expect(slots[0].metadata.counter).toBe(7);
	});

	it("wrong PRF output (different device secret) fails the unwrap", async () => {
		const user = await enrolledUser();
		const start = await beginDeviceUnlock(db, user.id);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 2,
				userVerified: true,
			},
		});
		await expect(
			completeDeviceUnlock(db, {
				userId: user.id,
				token: start.token,
				assertion: authResponse("cred-1"),
				prfOutput: crypto.randomBytes(32).toString("base64"),
			}),
		).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
	});

	it("ceremony requires full unlock state for enrollment (sealed keyring refuses)", async () => {
		const user = await enrolledUser();
		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: {
					id: "cred-2",
					publicKey: new Uint8Array(77),
					counter: 0,
				},
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
				aaguid: "00000000-0000-0000-0000-000000000000",
			},
		});
		// keyring sealed (enrolledUser seals) — spare enrollment must refuse
		await expect(
			completeDeviceEnrollment(db, {
				userId: user.id,
				token: start.token,
				registration: { id: "cred-2" } as never,
				prfOutput: prfKey.toString("base64"),
			}),
		).rejects.toThrow(); // SealedError from requireDataKey
		expect(keyringStatus().state).toBe("sealed");
	});
});

describe("enrollment hardening (crypto-rotation-safety)", () => {
	async function unlockedEnrolledUser(credentialId = "cred-1") {
		const user = await insertUser();
		await enrollPasswordSlot(db, {
			userId: user.id,
			password: "password-123456",
			passwordSalt: user.passwordSalt,
		});
		unlockKeyring(user.id, dataKey);
		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue(registrationInfo(credentialId));
		await completeDeviceEnrollment(db, {
			userId: user.id,
			token: start.token,
			registration: regResponse(),
			prfOutput: prfKey.toString("base64"),
		});
		return user;
	}

	it("3.1 rejects a duplicate active credentialId — no second slot written", async () => {
		const user = await unlockedEnrolledUser("cred-1");
		expect(await getDeviceSlots(db, user.id)).toHaveLength(1);

		// A client that ignored excludeCredentials replays the SAME
		// credential id — the server rejects regardless of client behavior.
		const start = await beginDeviceEnrollment(db, {
			id: user.id,
			username: user.username,
		});
		verifyRegistrationResponse.mockResolvedValue(registrationInfo("cred-1"));

		await expect(
			completeDeviceEnrollment(db, {
				userId: user.id,
				token: start.token,
				registration: regResponse(),
				prfOutput: crypto.randomBytes(32).toString("base64"),
			}),
		).rejects.toMatchObject({
			code: "UNKNOWN_CREDENTIAL",
			name: "WebAuthnCeremonyError",
		});
		expect(await getDeviceSlots(db, user.id)).toHaveLength(1);
	});

	it("3.2 deviceMetadata hard-fails on missing prfSalt (no random fallback)", () => {
		const corruptSlot = {
			slotId: "s",
			kind: "webauthn-prf" as const,
			wrappedKey: "aa",
			iv: "bb",
			metadata: { label: "X", credentialId: "c", publicKey: "k" }, // no prfSalt
			createdAt: new Date(),
		};
		let err: unknown;
		try {
			deviceMetadata(corruptSlot);
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(EnvelopeError);
		expect(err).toMatchObject({ code: "BAD_FORMAT" });
	});

	it("3.2 corrupt slot (no prfSalt) surfaces a format error at ceremony start", async () => {
		const user = await unlockedEnrolledUser("cred-1");
		// Corrupt the stored slot: strip prfSalt from its metadata
		const slots = await getDeviceSlots(db, user.id);
		const meta = { ...slots[0].metadata } as Record<string, unknown>;
		delete meta.prfSalt;
		await db
			.update(credentialSlots)
			.set({ metadata: meta })
			.where(eq(credentialSlots.slotId, slots[0].slotId));

		sealKeyring("corrupt-slot-check");
		await expect(beginDeviceUnlock(db, user.id)).rejects.toMatchObject({
			name: "EnvelopeError",
			code: "BAD_FORMAT",
		});
	});

	it("3.3 counter persistence is atomic and never regresses (json_set + max guard)", async () => {
		const user = await unlockedEnrolledUser("cred-1");
		sealKeyring("counter-tests");

		// Ceremony A reports counter 7
		let start = await beginDeviceUnlock(db, user.id);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 7,
				userVerified: true,
			},
		});
		await completeDeviceUnlock(db, {
			userId: user.id,
			token: start.token,
			assertion: authResponse("cred-1"),
			prfOutput: prfKey.toString("base64"),
		});
		let slots = await getDeviceSlots(db, user.id);
		expect(slots[0].metadata.counter).toBe(7);

		// Ceremony B — "completed" concurrently from a STALE read — reports a
		// LOWER counter (3). The stored counter must stay at the higher value
		// (no lost update, no regression), and other metadata stays intact.
		start = await beginDeviceUnlock(db, user.id);
		verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				credentialID: "cred-1",
				newCounter: 3,
				userVerified: true,
			},
		});
		await completeDeviceUnlock(db, {
			userId: user.id,
			token: start.token,
			assertion: authResponse("cred-1"),
			prfOutput: prfKey.toString("base64"),
		});
		slots = await getDeviceSlots(db, user.id);
		expect(slots[0].metadata.counter).toBe(7);
		expect(typeof slots[0].metadata.prfSalt).toBe("string");
		expect(typeof slots[0].metadata.label).toBe("string");
	});
});

describe("expectedOrigins (crypto-rotation-safety 3.4)", () => {
	const savedEnv = {
		appEnv: process.env.APP_ENV,
		origins: process.env.WEBAUTHN_EXPECTED_ORIGINS,
	};

	afterEach(() => {
		if (savedEnv.appEnv === undefined) delete process.env.APP_ENV;
		else process.env.APP_ENV = savedEnv.appEnv;
		if (savedEnv.origins === undefined) delete process.env.WEBAUTHN_EXPECTED_ORIGINS;
		else process.env.WEBAUTHN_EXPECTED_ORIGINS = savedEnv.origins;
	});

	it("dev ports when APP_ENV=development and no explicit origins", () => {
		delete process.env.WEBAUTHN_EXPECTED_ORIGINS;
		process.env.APP_ENV = "development";
		expect(expectedOrigins()).toEqual([
			"http://localhost:5173",
			"http://localhost:4173",
			"http://localhost:3000",
		]);
	});

	it("dev ports when APP_ENV is unset", () => {
		delete process.env.WEBAUTHN_EXPECTED_ORIGINS;
		delete process.env.APP_ENV;
		expect(expectedOrigins()).toEqual([
			"http://localhost:5173",
			"http://localhost:4173",
			"http://localhost:3000",
		]);
	});

	it("explicit WEBAUTHN_EXPECTED_ORIGINS always wins", () => {
		process.env.APP_ENV = "production";
		process.env.WEBAUTHN_EXPECTED_ORIGINS =
			"https://finance.example.com, https://alt.example.com";
		expect(expectedOrigins()).toEqual([
			"https://finance.example.com",
			"https://alt.example.com",
		]);
	});

	it("fails closed outside development without WEBAUTHN_EXPECTED_ORIGINS", () => {
		delete process.env.WEBAUTHN_EXPECTED_ORIGINS;
		process.env.APP_ENV = "production";
		let err: unknown;
		try {
			expectedOrigins();
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(WebAuthnCeremonyError);
		expect(err).toMatchObject({ code: "ORIGINS_UNCONFIGURED" });
	});
});
