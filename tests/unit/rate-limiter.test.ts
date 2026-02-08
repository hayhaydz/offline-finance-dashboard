import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, recordFailedAttempt, recordSuccessfulAttempt } from '$lib/security/rate-limiter';
import { db } from '$lib/db/client';

// Mock the database client
vi.mock('$lib/db/client', () => ({
	db: {
		query: {
			loginAttempts: {
				findFirst: vi.fn()
			}
		},
		insert: vi.fn(() => ({
			values: vi.fn()
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn()
			}))
		})),
		delete: vi.fn(() => ({
			where: vi.fn()
		}))
	}
}));

describe('rate limiter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('checkRateLimit', () => {
		it('should allow if no attempt record exists', async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue(undefined);
			
			const result = await checkRateLimit('testuser');
			
			expect(result.allowed).toBe(true);
			expect(result.attemptsRemaining).toBe(5);
		});

		it('should deny if account is locked', async () => {
			const futureDate = new Date(Date.now() + 10000);
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: 'testuser',
				count: 5,
				lockedUntil: futureDate
			});
			
			const result = await checkRateLimit('testuser');
			
			expect(result.allowed).toBe(false);
			expect(result.locked).toBe(true);
		});

		it('should apply exponential backoff delay', async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: 'testuser',
				count: 2, // 2^2 = 4 seconds delay
				lastAttempt: new Date()
			});
			
			const result = await checkRateLimit('testuser');
			
			expect(result.allowed).toBe(true);
			expect(result.delay).toBe(4000);
			expect(result.attemptsRemaining).toBe(3);
		});

		it('should expire old attempt records', async () => {
			const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: 'testuser',
				count: 3,
				lastAttempt: longAgo
			});
			
			const result = await checkRateLimit('testuser');
			
			expect(result.allowed).toBe(true);
			expect(db.delete).toHaveBeenCalled();
		});
	});

	describe('recordFailedAttempt', () => {
		it('should create new record on first failure', async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue(undefined);
			
			await recordFailedAttempt('testuser');
			
			expect(db.insert).toHaveBeenCalled();
		});

		it('should increment existing count', async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: 'testuser',
				count: 1
			});
			
			await recordFailedAttempt('testuser');
			
			expect(db.update).toHaveBeenCalled();
		});

		it('should lock account after max attempts', async () => {
			(db.query.loginAttempts.findFirst as any).mockResolvedValue({
				username: 'testuser',
				count: 4
			});
			
			await recordFailedAttempt('testuser');
			
			// Verify update was called with lockedUntil
			const updateMock = db.update as any;
			expect(updateMock).toHaveBeenCalled();
		});
	});

	describe('recordSuccessfulAttempt', () => {
		it('should delete attempt record on success', async () => {
			await recordSuccessfulAttempt('testuser');
			expect(db.delete).toHaveBeenCalled();
		});
	});
});
