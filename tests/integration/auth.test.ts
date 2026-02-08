import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from '../../src/routes/(auth)/register/+page.server';
import { db } from '$lib/db/client';

// Mock dependencies
vi.mock('$lib/db/client', () => {
	const mockDb = {
		query: {
			users: {
				findFirst: vi.fn()
			}
		},
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: 1 }])
			})
		})
	};
	return { db: mockDb };
});

vi.mock('$lib/auth/password', () => ({
	hashPassword: vi.fn(() => Promise.resolve('hashed_password'))
}));

describe('Registration Action Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long-!!!';
	});

	it('should successfully register a new user', async () => {
		// Setup mocks
		(db.query.users.findFirst as any).mockResolvedValue(null);

		// Prepare request
		const formData = new FormData();
		formData.append('username', 'newuser');
		formData.append('password', 'StrongPassword123!');
		formData.append('confirmPassword', 'StrongPassword123!');

		const cookies = {
			set: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn(),
			getAll: vi.fn()
		};

		const request = new Request('http://localhost/register', {
			method: 'POST',
			body: formData
		});

		// Execute action
		try {
			await (actions.default as any)({ request, cookies });
			expect.fail('Action should have thrown a redirect');
		} catch (e: any) {
			// SvelteKit uses throws for redirects
			if (e.status === 302) {
				expect(e.location).toBe('/mfa-setup');
				expect(cookies.set).toHaveBeenCalledWith(
					'mfa-setup-token',
					expect.any(String),
					expect.any(Object)
				);
			} else {
				throw e;
			}
		}
	});

	it('should fail if passwords do not match', async () => {
		const formData = new FormData();
		formData.append('username', 'newuser');
		formData.append('password', 'Password123!');
		formData.append('confirmPassword', 'Different123!');

		const cookies = {} as any;
		const request = new Request('http://localhost/register', {
			method: 'POST',
			body: formData
		});

		const result = await (actions.default as any)({ request, cookies });
		
		expect(result.status).toBe(400);
		expect(result.data.error).toBe('Passwords do not match');
	});

	it('should fail if username is already taken', async () => {
		(db.query.users.findFirst as any).mockResolvedValue({ id: 1, username: 'existinguser' });

		const formData = new FormData();
		formData.append('username', 'existinguser');
		formData.append('password', 'Password123!');
		formData.append('confirmPassword', 'Password123!');

		const cookies = {} as any;
		const request = new Request('http://localhost/register', {
			method: 'POST',
			body: formData
		});

		const result = await (actions.default as any)({ request, cookies });
		
		expect(result.status).toBe(400);
		expect(result.data.error).toBe('Username already taken');
	});
});
