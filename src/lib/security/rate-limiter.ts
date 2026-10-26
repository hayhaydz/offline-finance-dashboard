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

	// Lockout has expired — give user a fresh start
	if (attempt.lockedUntil && attempt.lockedUntil <= new Date()) {
		await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
		return { allowed: true, attemptsRemaining: MAX_ATTEMPTS };
	}

	// Clear attempts if last attempt > 24h ago
	const twentyFourHoursAgo = new Date(Date.now() - MS_PER_DAY);
	if (attempt.lastAttempt < twentyFourHoursAgo) {
		await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
		return { allowed: true, attemptsRemaining: MAX_ATTEMPTS };
	}

	// Exponential backoff that DECAYS as time passes since the last attempt.
	// The delay only applies while the user is retrying within the cooldown
	// window; once it elapses, the request proceeds to credential verification.
	// Without the elapsed-time check, a single failure froze count>0 and the
	// delay was returned forever, blocking login (deadlock).
	const elapsed = Date.now() - attempt.lastAttempt.getTime();
	const requiredDelay =
		attempt.count > 0 ? Math.min(2 ** attempt.count * 1000, MAX_DELAY) : 0;
	const delay = elapsed < requiredDelay ? requiredDelay - elapsed : undefined;
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

// ---------------------------------------------------------------------------
// Registration — IP-scoped, in-memory, ~10/hour sliding window
// (auth-session-hardening). Deliberately NOT the username limiter: there is
// no username before the account exists. Best-effort client IP (localhost
// app: every request is local; the cap bounds automated account spam).
// ---------------------------------------------------------------------------

const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REGISTRATION_MAX_ATTEMPTS = 10;
const registrationAttempts = new Map<string, number[]>();

function pruneRegistrationWindow(ip: string, now: number): void {
	const stamps = registrationAttempts.get(ip);
	if (!stamps) return;
	const fresh = stamps.filter((t) => now - t < REGISTRATION_WINDOW_MS);
	if (fresh.length === 0) registrationAttempts.delete(ip);
	else registrationAttempts.set(ip, fresh);
}

/** True when the IP is still under the hourly registration cap. */
export function checkRegistrationRateLimit(
	ip: string,
	now = Date.now(),
): boolean {
	pruneRegistrationWindow(ip, now);
	return (
		(registrationAttempts.get(ip)?.length ?? 0) < REGISTRATION_MAX_ATTEMPTS
	);
}

/** Count a registration attempt against the IP's hourly window. */
export function recordRegistrationAttempt(ip: string, now = Date.now()): void {
	pruneRegistrationWindow(ip, now);
	const stamps = registrationAttempts.get(ip) ?? [];
	stamps.push(now);
	registrationAttempts.set(ip, stamps);
}

/** Test access: clear the in-memory registration windows. */
export function resetRegistrationRateLimit(): void {
	registrationAttempts.clear();
}
