import { db } from '$lib/db/client';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_DELAY = 30000; // 30 seconds max delay

export interface RateLimitResult {
	allowed: boolean;
	delay?: number;
	locked?: boolean;
	attemptsRemaining?: number;
}

/**
 * Check rate limit for a username using database-backed storage.
 * Returns exponential backoff delay and lockout status.
 */
export async function checkRateLimit(username: string): Promise<RateLimitResult> {
	// Look up user to get current attempt count and lockout status
	const user = await db.query.users.findFirst({
		where: eq(users.username, username),
		columns: {
			id: true,
			failedLoginAttempts: true,
			lockedUntil: true
		}
	});

	// If user doesn't exist, allow (we'll record failed attempt later)
	if (!user) {
		return { allowed: true, attemptsRemaining: MAX_ATTEMPTS };
	}

	// Check if account is locked
	if (user.lockedUntil && user.lockedUntil > new Date()) {
		return {
			allowed: false,
			locked: true,
			attemptsRemaining: 0
		};
	}

	// Clear lockout if expired
	if (user.lockedUntil && user.lockedUntil <= new Date()) {
		await db
			.update(users)
			.set({
				failedLoginAttempts: 0,
				lockedUntil: null
			})
			.where(eq(users.username, username));
		return { allowed: true, attemptsRemaining: MAX_ATTEMPTS };
	}

	// Calculate delay: 2^count seconds (1s, 2s, 4s, 8s, 16s)
	// Only apply delay AFTER first failed attempt (0 attempts = no delay)
	const delay = user.failedLoginAttempts > 0
		? Math.min(Math.pow(2, user.failedLoginAttempts) * 1000, MAX_DELAY)
		: undefined;
	const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - user.failedLoginAttempts);

	return {
		allowed: true,
		delay,
		attemptsRemaining
	};
}

/**
 * Record a failed login attempt in the database.
 * Locks account after MAX_ATTEMPTS failed attempts.
 */
export async function recordFailedAttempt(username: string): Promise<void> {
	// Get current attempt count
	const user = await db.query.users.findFirst({
		where: eq(users.username, username),
		columns: {
			failedLoginAttempts: true
		}
	});

	if (!user) {
		// User doesn't exist - we can't record attempts for non-existent users
		// This is fine - the checkRateLimit will return allowed:true for non-existent users
		return;
	}

	const newCount = user.failedLoginAttempts + 1;

	// Lock account after MAX_ATTEMPTS failed attempts
	if (newCount >= MAX_ATTEMPTS) {
		await db
			.update(users)
			.set({
				failedLoginAttempts: newCount,
				lockedUntil: new Date(Date.now() + LOCKOUT_DURATION)
			})
			.where(eq(users.username, username));
	} else {
		await db
			.update(users)
			.set({
				failedLoginAttempts: newCount
			})
			.where(eq(users.username, username));
	}
}

/**
 * Clear failed login attempts after successful authentication.
 */
export async function recordSuccessfulAttempt(username: string): Promise<void> {
	await db
		.update(users)
		.set({
			failedLoginAttempts: 0,
			lockedUntil: null
		})
		.where(eq(users.username, username));
}
