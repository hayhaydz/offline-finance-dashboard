import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { loginAttempts } from "$lib/db/schema";
import { MS_PER_DAY } from "$lib/utils/time-constants";

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
 * Check rate limit for a username using login_attempts table.
 * This works identically for existent and non-existent users.
 */
export async function checkRateLimit(
	username: string,
): Promise<RateLimitResult> {
	// Look up attempt record for this username
	const attempt = await db.query.loginAttempts.findFirst({
		where: eq(loginAttempts.username, username),
	});

	// If no attempt record, allow
	if (!attempt) {
		return { allowed: true, attemptsRemaining: MAX_ATTEMPTS };
	}

	// Check if account is locked
	if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
		return {
			allowed: false,
			locked: true,
			attemptsRemaining: 0,
		};
	}

	// Clear lockout/attempts if expired (last attempt > 24h ago)
	const twentyFourHoursAgo = new Date(Date.now() - MS_PER_DAY);
	if (attempt.lastAttempt < twentyFourHoursAgo) {
		await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
		return { allowed: true, attemptsRemaining: MAX_ATTEMPTS };
	}

	// Calculate delay: 2^count seconds (1s, 2s, 4s, 8s, 16s)
	const delay =
		attempt.count > 0
			? Math.min(2 ** attempt.count * 1000, MAX_DELAY)
			: undefined;
	const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attempt.count);

	return {
		allowed: true,
		delay,
		attemptsRemaining,
	};
}

/**
 * Record a failed login attempt.
 */
export async function recordFailedAttempt(username: string): Promise<void> {
	const attempt = await db.query.loginAttempts.findFirst({
		where: eq(loginAttempts.username, username),
	});

	if (!attempt) {
		// Create new attempt record
		await db.insert(loginAttempts).values({
			username,
			count: 1,
			lastAttempt: new Date(),
		});
		return;
	}

	const newCount = attempt.count + 1;

	if (newCount >= MAX_ATTEMPTS) {
		await db
			.update(loginAttempts)
			.set({
				count: newCount,
				lastAttempt: new Date(),
				lockedUntil: new Date(Date.now() + LOCKOUT_DURATION),
			})
			.where(eq(loginAttempts.username, username));
	} else {
		await db
			.update(loginAttempts)
			.set({
				count: newCount,
				lastAttempt: new Date(),
			})
			.where(eq(loginAttempts.username, username));
	}
}

/**
 * Clear login attempts after successful authentication.
 */
export async function recordSuccessfulAttempt(username: string): Promise<void> {
	await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
}
