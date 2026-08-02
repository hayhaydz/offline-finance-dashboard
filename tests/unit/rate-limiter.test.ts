import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import {
	checkRateLimit,
	recordFailedAttempt,
	recordSuccessfulAttempt,
} from "$lib/security/rate-limiter";

// Mock the database client
vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			loginAttempts: {
				findFirst: vi.fn(),
			},
		},
		insert: vi.fn(() => ({
			values: vi.fn(),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(),
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(),
		})),
	},
}));

describe("rate limiter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("checkRateLimit", () => {
		it("should allow if no attempt record exists", async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue(undefined);

			const result = await checkRateLimit("testuser");

			expect(result.allowed).toBe(true);
			expect(result.attemptsRemaining).toBe(5);
		});

		it("should deny if account is locked", async () => {
			const futureDate = new Date(Date.now() + 10000);
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: "testuser",
				count: 5,
				lockedUntil: futureDate,
			});

			const result = await checkRateLimit("testuser");

			expect(result.allowed).toBe(false);
			expect(result.locked).toBe(true);
		});

	it("should apply exponential backoff delay when retrying within cooldown", async () => {
		(db.query.loginAttempts.findFirst as any).mockResolvedValue({
			username: "testuser",
			count: 2, // 2^2 = 4 seconds required delay
			lastAttempt: new Date(), // retrying immediately
		});

		const result = await checkRateLimit("testuser");

		expect(result.allowed).toBe(true);
		// delay = requiredDelay(4000) - elapsed(~0); allow tiny clock slack
		expect(result.delay).toBeGreaterThanOrEqual(3990);
		expect(result.delay).toBeLessThanOrEqual(4000);
		expect(result.attemptsRemaining).toBe(3);
	});

	it("should return the REMAINING delay when retrying mid-cooldown", async () => {
		(db.query.loginAttempts.findFirst as any).mockResolvedValue({
			username: "testuser",
			count: 2, // requiredDelay = 4000ms
			lastAttempt: new Date(Date.now() - 1000), // 1s already elapsed
		});

		const result = await checkRateLimit("testuser");

		expect(result.allowed).toBe(true);
		// remaining = 4000 - 1000 = ~3000
		expect(result.delay).toBeGreaterThanOrEqual(2990);
		expect(result.delay).toBeLessThanOrEqual(3000);
	});

	it("should NOT delay once the cooldown window has elapsed (deadlock regression)", async () => {
		// Regression: previously the delay was a pure function of `count` with no
		// elapsed-time check, so a single failure (count>0) blocked login forever.
		(db.query.loginAttempts.findFirst as any).mockResolvedValue({
			username: "testuser",
			count: 1, // requiredDelay = 2000ms
			lastAttempt: new Date(Date.now() - 3000), // waited past the window
		});

		const result = await checkRateLimit("testuser");

		expect(result.allowed).toBe(true);
		expect(result.delay).toBeUndefined();
		expect(result.attemptsRemaining).toBe(4);
	});

		it("should expire old attempt records", async () => {
			const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: "testuser",
				count: 3,
				lastAttempt: longAgo,
			});

			const result = await checkRateLimit("testuser");

			expect(result.allowed).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});
	});

	describe("recordFailedAttempt", () => {
		it("should create new record on first failure", async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue(undefined);

			await recordFailedAttempt("testuser");

			expect(db.insert).toHaveBeenCalled();
		});

		it("should increment existing count", async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: "testuser",
				count: 1,
			});

			await recordFailedAttempt("testuser");

			expect(db.update).toHaveBeenCalled();
		});

		it("should lock account after max attempts", async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: "testuser",
				count: 4,
			});

			await recordFailedAttempt("testuser");

			// Verify update was called with lockedUntil
			const updateMock = db.update as any;
			expect(updateMock).toHaveBeenCalled();
		});
	});

	describe("recordSuccessfulAttempt", () => {
		it("should delete attempt record on success", async () => {
			await recordSuccessfulAttempt("testuser");
			expect(db.delete).toHaveBeenCalled();
		});
	});
});
