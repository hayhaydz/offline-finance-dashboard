import { fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "$lib/auth/password";
import { db } from "$lib/db/client";
import { users } from "$lib/db/schema";
import {
	enrollRecoverySlot,
	getActiveSlots,
	revokeSlot,
	rewrapPasswordSlot,
} from "$lib/server/crypto/enroll";
import { EnvelopeError } from "$lib/server/crypto/envelope";
import { requireDataKey } from "$lib/server/crypto/keyring";
import { rotateUserEnvelope } from "$lib/server/crypto/migrate-envelope";
import {
	getDeviceSlots,
	isDeviceEnrollmentEnabled,
	isDeviceEnrollmentEnabledForUser,
} from "$lib/server/crypto/webauthn";
import {
	devLog,
	isVerboseDebug,
	logError,
	logFormData,
} from "$lib/server/logger";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Security settings — keyring status (task 3.3). The 2FA section is gone:
 * the envelope keyring IS the second-factor story now (custody, not codes).
 *
 * - Slot list with revocation (device loss = slot-tier, no data rewrite)
 * - Spare-device prompt when exactly one device slot exists (task 4.3)
 * - Recovery paper: never re-displayed; rotation issues a new one
 * - Full DataKey rotation for paper compromise (task 4.4)
 * - Password change: slot re-wrap only (task 3.5)
 */

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	const slots = await getActiveSlots(db, user.id);

	const userData = await db
		.select({
			id: users.id,
			username: users.username,
			createdAt: users.createdAt,
			inactivityTimeout: users.inactivityTimeout,
		})
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	const dbUser = userData[0];
	const deviceSlots = slots.filter((s) => s.kind === "webauthn-prf");
	const recoverySlots = slots.filter((s) => s.kind === "recovery-passphrase");
	const deviceEnrollmentEnabledForUser = await isDeviceEnrollmentEnabledForUser(
		db,
		user.id,
	);

	return {
		user: {
			id: user.id,
			username: user.username,
		},
		slots: slots.map((s) => ({
			slotId: s.slotId,
			kind: s.kind,
			label: typeof s.metadata.label === "string" ? s.metadata.label : s.kind,
			createdAt: s.createdAt.toISOString(),
		})),
		deviceSlotCount: deviceSlots.length,
		recoveryEnrolled: recoverySlots.length > 0,
		promptSpareDevice: deviceSlots.length === 1,
		deviceEnrollmentEnabled: deviceEnrollmentEnabledForUser,
		deviceEnrollmentGlobalKill: !isDeviceEnrollmentEnabled(),
		inactivityTimeout: dbUser?.inactivityTimeout ?? 5,
		accountCreated: dbUser?.createdAt?.toISOString() ?? null,
	};
};

function requireFullUnlock(userId: number): boolean {
	try {
		requireDataKey(userId);
		return true;
	} catch {
		return false;
	}
}

export const actions: Actions = {
	/**
	 * Password change (task 3.5): verify old password, re-wrap the password
	 * slot ONLY — no data rewrite, no other slot touched. The inactivity
	 * timeout setting (seal deadline) is carried over unchanged.
	 */
	changePassword: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-security", Object.fromEntries(formData));

		const currentPassword = formData.get("currentPassword") as string;
		const newPassword = formData.get("newPassword") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (!currentPassword || !newPassword || !confirmPassword) {
			return fail(400, { error: "All fields are required" });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { error: "New passwords do not match" });
		}
		if (newPassword.length < 12) {
			return fail(400, { error: "Password must be at least 12 characters" });
		}
		const hasUppercase = /[A-Z]/.test(newPassword);
		const hasLowercase = /[a-z]/.test(newPassword);
		const hasNumber = /[0-9]/.test(newPassword);
		const hasSpecial = /[!@#$%^&*()_+\-=[\]{}|;:',.<>?/`~]/.test(newPassword);
		if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
			return fail(400, {
				error:
					"Password must include uppercase, lowercase, number, and special character",
			});
		}

		if (!requireFullUnlock(user.id)) {
			return fail(403, {
				error: "Keyring is sealed — unlock before changing password",
			});
		}

		const passwordData = await db
			.select({
				passwordHash: users.passwordHash,
				passwordSalt: users.passwordSalt,
			})
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);

		if (passwordData.length === 0) {
			return fail(404, { error: "User not found" });
		}

		const isCurrentPasswordValid = await verifyPassword(
			passwordData[0].passwordHash,
			currentPassword,
		);
		if (!isCurrentPasswordValid) {
			devLog("settings-security", "Password change failed — wrong password", {
				userId: user.id,
			});
			return fail(400, { error: "Current password is incorrect" });
		}

		try {
			// Slot-tier rotation only: fresh salt, same DataKey, no data rewrite.
			const { passwordSalt } = await rewrapPasswordSlot(db, {
				userId: user.id,
				currentPassword,
				currentPasswordSalt: passwordData[0].passwordSalt,
				newPassword,
			});

			const newPasswordHash = await hashPassword(newPassword);
			await db
				.update(users)
				.set({
					passwordHash: newPasswordHash,
					passwordSalt,
					updatedAt: new Date(),
				})
				.where(eq(users.id, user.id));

			devLog("settings-security", "Password updated (slot re-wrapped)", {
				userId: user.id,
			});

			return {
				success: true,
				message:
					"Password changed. Your data was NOT re-encrypted — only the password slot was re-wrapped.",
			};
		} catch (error) {
			logError("settings-security", "Password change failed", error);
			return fail(500, { error: "An error occurred during password change" });
		}
	},

	/**
	 * Rotate the recovery paper (slot tier): revoke the old slot, enroll a
	 * fresh CSPRNG passphrase over the SAME DataKey — no data rewrite. The
	 * new passphrase is shown exactly once. (The old one can never be
	 * re-displayed — that is the paper re-enrollment guard.)
	 */
	rotateRecoverySlot: async ({ locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}
		if (!requireFullUnlock(user.id)) {
			return fail(403, { error: "Keyring is sealed — unlock first" });
		}

		try {
			const dataKey = requireDataKey(user.id);
			const oldSlots = await getActiveSlots(db, user.id, "recovery-passphrase");
			for (const slot of oldSlots) {
				await revokeSlot(db, user.id, slot.slotId);
			}
			const { passphrase } = await enrollRecoverySlot(db, {
				userId: user.id,
				dataKey,
			});
			return { success: true, recoveryPassphrase: passphrase };
		} catch (error) {
			logError("settings-security", "Recovery rotation failed", error);
			return fail(500, { error: "Recovery passphrase rotation failed" });
		}
	},

	/**
	 * Revoke a credential slot (task 4.3). Stolen device? Its slot alone
	 * could never unlock (2-of-2) — revocation is immediate and re-writes
	 * nothing. The password slot cannot be revoked (lockout by design).
	 */
	revokeSlot: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		const slotId = formData.get("slotId") as string;
		if (!slotId) {
			return fail(400, { error: "Slot id is required" });
		}

		const slots = await getActiveSlots(db, user.id);
		const target = slots.find((s) => s.slotId === slotId);
		if (!target) {
			return fail(404, { error: "Slot not found" });
		}
		if (target.kind === "password") {
			return fail(400, {
				error:
					"The password slot cannot be revoked — you would be locked out forever",
			});
		}
		if (target.kind === "recovery-passphrase") {
			// Revoking the only break-glass slot = guaranteed lockout on
			// password loss; require rotating it to a new one instead.
			return fail(400, {
				error:
					"Revoke the recovery paper only by rotating it to a new passphrase (use 'Rotate recovery passphrase')",
			});
		}

		const revoked = await revokeSlot(db, user.id, slotId);
		if (!revoked) {
			return fail(404, { error: "Slot not found" });
		}
		return {
			success: true,
			message: "Slot revoked. No data was re-encrypted.",
		};
	},

	/**
	 * Full DataKey rotation (task 4.4) — recovery-paper compromise only.
	 * Re-encrypts EVERYTHING under a fresh DataKey, re-wraps all slots, and
	 * issues a new recovery passphrase shown once. Behind full unlock +
	 * password confirmation.
	 */
	rotateDataKey: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}
		if (!requireFullUnlock(user.id)) {
			return fail(403, { error: "Keyring is sealed — unlock first" });
		}

		const formData = await request.formData();
		const password = formData.get("password") as string;
		if (!password) {
			return fail(400, { error: "Password confirmation is required" });
		}

		const passwordData = await db
			.select({ passwordHash: users.passwordHash })
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);
		if (passwordData.length === 0) {
			return fail(404, { error: "User not found" });
		}
		const valid = await verifyPassword(passwordData[0].passwordHash, password);
		if (!valid) {
			return fail(400, { error: "Password is incorrect" });
		}

		try {
			const { passphrase, deviceSlotsRevoked } = await rotateUserEnvelope(
				db,
				{
					userId: user.id,
					password,
				},
			);
			return {
				success: true,
				recoveryPassphrase: passphrase,
				deviceSlotsRevoked,
				message: deviceSlotsRevoked
					? "Full rotation complete: all data re-encrypted under a fresh key, every slot re-wrapped. Device slots revoked — re-enroll your device."
					: "Full rotation complete: all data re-encrypted under a fresh key, every slot re-wrapped.",
			};
		} catch (error) {
			if (error instanceof EnvelopeError) {
				return fail(400, { error: "Rotation failed — no data was changed" });
			}
			logError("settings-security", "DataKey rotation failed", error);
			return fail(500, { error: "DataKey rotation failed" });
		}
	},

	/**
	 * Per-account L2 switch. ON: reveals + permits device enrollment for
	 * this account. OFF: revokes every enrolled device slot (spec
	 * unlock-ceremony: disabling the device requirement revokes the slot
	 * explicitly, behind a full unlock) — data is never re-encrypted
	 * (slot tier). Enforcement is never gated by this flag directly: with
	 * zero enrolled slots the account is simply L1 again.
	 */
	toggleDeviceEnrollment: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}
		if (!requireFullUnlock(user.id)) {
			return fail(403, { error: "Keyring is sealed — unlock first" });
		}

		const formData = await request.formData();
		const enable = formData.get("enabled") === "true";

		if (enable && !isDeviceEnrollmentEnabled()) {
			return fail(400, {
				error:
					"Device enrollment is globally disabled (pending live verification — set WEBAUTHN_PRF_ENABLED=true)",
			});
		}

		let revokedCount = 0;
		if (!enable) {
			const deviceSlots = await getDeviceSlots(db, user.id);
			for (const slot of deviceSlots) {
				if (await revokeSlot(db, user.id, slot.slotId)) {
					revokedCount++;
				}
			}
		}

		await db
			.update(users)
			.set({ deviceEnrollmentEnabled: enable, updatedAt: new Date() })
			.where(eq(users.id, user.id));

		return {
			success: true,
			message: enable
				? "Device enrollment enabled — enroll a device below."
				: `Device enrollment disabled${revokedCount > 0 ? ` and ${revokedCount} device slot(s) revoked` : ""}. Password-only unlock (L1) is active for this account.`,
		};
	},

	// Seal deadline (inactivity timeout) — unchanged semantics.
	saveInactivityTimeout: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-security", Object.fromEntries(formData));

		const timeout = parseInt(formData.get("inactivityTimeout") as string, 10);

		if (![1, 5, 10].includes(timeout)) {
			return fail(400, { error: "Invalid timeout value" });
		}

		await db
			.update(users)
			.set({ inactivityTimeout: timeout, updatedAt: new Date() })
			.where(eq(users.id, user.id));

		if (isVerboseDebug()) {
			devLog(
				"settings-security",
				"Seal deadline (inactivity timeout) updated",
				{
					userId: user.id,
					timeout,
				},
			);
		}

		return { success: true, inactivityTimeout: timeout };
	},
};
