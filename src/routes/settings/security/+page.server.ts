import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { db } from '$lib/db/client';
import { users, sessions, backupCodes } from '$lib/db/schema';
import { generateBackupCodes } from '$lib/auth/mfa';
import { verifyPassword, hashPassword } from '$lib/auth/password';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError('settings-security', 'Authentication required');
		redirect(302, '/login');
	}

	devLog('settings-security', 'Security settings page loaded', {
		username: locals.user.username,
		userId: locals.user.id
	});

	// Query user data for MFA status
	const userData = await db
		.select({
			id: users.id,
			username: users.username,
			mfaSetupToken: users.mfaSetupToken,
			createdAt: users.createdAt
		})
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);

	const user = userData[0];

	// MFA is enabled if mfaSetupToken is null (setup completed)
	const mfaEnabled = user?.mfaSetupToken === null;

	// Query backup codes for the user to get counts
	const backupCodesData = await db
		.select({ used: backupCodes.used })
		.from(backupCodes)
		.where(eq(backupCodes.userId, locals.user.id));

	// Calculate backup code counts
	const totalCodes = 10; // Always 10 backup codes
	const usedCodes = backupCodesData.filter((code) => code.used).length;
	const remainingCodes = totalCodes - usedCodes;

	// MFA enabled date (when user was created, which is when MFA was set up during registration)
	const mfaEnabledDate = mfaEnabled && user?.createdAt ? new Date(user.createdAt) : null;

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username
		},
		mfaEnabled,
		mfaEnabledDate,
		totalCodes,
		usedCodes,
		remainingCodes
	};
};

export const actions: Actions = {
	// Change password action
	changePassword: async ({ request, locals }) => {
		try {
			if (!locals.user) {
				logError('settings-security', 'Authentication required for password change');
				return fail(401, { error: 'Authentication required' });
			}

			const formData = await request.formData();
			logFormData('settings-security', Object.fromEntries(formData));

			const currentPassword = formData.get('currentPassword') as string;
			const newPassword = formData.get('newPassword') as string;

			// Basic validation
			if (!currentPassword || !newPassword) {
				devLog('settings-security', 'Validation failed - missing fields', {
					userId: locals.user.id
				});
				return fail(400, { error: 'All fields are required' });
			}

			// Validate new password meets requirements (12+ chars, strong password)
			if (newPassword.length < 12) {
				devLog('settings-security', 'Validation failed - password too short', {
					userId: locals.user.id
				});
				return fail(400, {
					error: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character'
				});
			}

			// Strong password validation
			const hasUppercase = /[A-Z]/.test(newPassword);
			const hasLowercase = /[a-z]/.test(newPassword);
			const hasNumber = /[0-9]/.test(newPassword);
			const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:',.<>?\/`~]/.test(newPassword);

			if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
				devLog('settings-security', 'Validation failed - weak password', {
					userId: locals.user.id
				});
				return fail(400, {
					error: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character'
				});
			}

			// Query user to get current password hash
			const userData = await db
				.select({ passwordHash: users.passwordHash })
				.from(users)
				.where(eq(users.id, locals.user.id))
				.limit(1);

			if (userData.length === 0) {
				logError('settings-security', 'User not found', { userId: locals.user.id });
				return fail(404, { error: 'User not found' });
			}

			// Verify current password
			const currentPasswordHash = userData[0].passwordHash;
			const isCurrentPasswordValid = await verifyPassword(
				currentPasswordHash,
				currentPassword
			);

			if (!isCurrentPasswordValid) {
				devLog('settings-security', 'Password change failed - incorrect current password', {
					userId: locals.user.id
				});
				// Generic error message for security (prevents username enumeration)
				return fail(400, { error: 'Current password is incorrect' });
			}

			devLog('settings-security', 'Password validation passed, updating password', {
				userId: locals.user.id
			});

			// Hash new password
			const newPasswordHash = await hashPassword(newPassword);

			// Update password in database
			await db
				.update(users)
				.set({ passwordHash: newPasswordHash, updatedAt: new Date() })
				.where(eq(users.id, locals.user.id));

			devLog('settings-security', 'Password updated successfully', {
				userId: locals.user.id
			});

			// Invalidate ALL sessions for security (force re-authentication)
			await db.delete(sessions).where(eq(sessions.userId, locals.user.id));

			devLog('settings-security', 'All sessions invalidated after password change', {
				userId: locals.user.id
			});

			// Return success - client will redirect to login
			return { success: true };
		} catch (error) {
			logError('settings-security', 'Unexpected error during password change', error);
			return fail(500, { error: 'An error occurred during password change' });
		}
	},

	// Regenerate backup codes action
	regenerateBackupCodes: async ({ request, locals }) => {
		if (!locals.user) {
			logError('settings-security', 'Authentication required for backup code regeneration');
			return fail(401, { error: 'Authentication required' });
		}

		try {
			const formData = await request.formData();
			logFormData('settings-security', Object.fromEntries(formData));

			devLog('settings-security', 'Backup code regeneration requested', {
				username: locals.user.username,
				userId: locals.user.id
			});

			// Step 1: Delete all existing backup codes for the user
			await db.delete(backupCodes).where(eq(backupCodes.userId, locals.user.id));

			devLog('settings-security', 'Old backup codes deleted', {
				username: locals.user.username
			});

			// Step 2: Generate 10 new plaintext backup codes
			const newCodes = generateBackupCodes();

			devLog('settings-security', 'New backup codes generated', {
				username: locals.user.username,
				codeCount: newCodes.length
			});

			// Step 3: Hash each code with Argon2id and insert into database
			for (const code of newCodes) {
				const hashedCode = await hashPassword(code);
				await db.insert(backupCodes).values({
					userId: locals.user.id,
					code: hashedCode,
					used: false,
					createdAt: new Date()
				});
			}

			devLog('settings-security', 'Backup codes stored successfully', {
				username: locals.user.username,
				codesStored: newCodes.length
			});

			// Step 4: Return plaintext codes for one-time display
			return {
				success: true,
				codes: newCodes
			};
		} catch (error) {
			logError('settings-security', 'Failed to regenerate backup codes', error);
			return fail(500, { error: 'Failed to regenerate backup codes' });
		}
	}
};
