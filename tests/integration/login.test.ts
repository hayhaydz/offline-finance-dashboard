import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mfa from "$lib/auth/mfa";
import * as password from "$lib/auth/password";
import { db } from "$lib/db/client";
import * as rateLimiter from "$lib/security/rate-limiter";
import { actions } from "../../src/routes/(auth)/login/+page.server";

// Mock dependencies
vi.mock("$lib/db/client", () => {
	const mockDb = {
		query: {
			users: {
				findFirst: vi.fn(),
			},
			backupCodes: {
				findMany: vi.fn(),
			},
		},
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockResolvedValue(true),
		}),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(true),
			}),
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(true),
		}),
	};
	return { db: mockDb };
});

vi.mock("$lib/auth/mfa", async () => {
	const actual = await vi.importActual<typeof mfa>("$lib/auth/mfa");
	return {
		...actual,
		verifyTOTP: vi.fn(),
		decryptTOTPSecret: vi.fn(() => "plain_secret"),
		verifyBackupCode: vi.fn(),
	};
});

vi.mock("$lib/auth/password", () => ({
	verifyPassword: vi.fn(),
}));

vi.mock("$lib/security/rate-limiter", () => ({
	checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
	recordFailedAttempt: vi.fn(),
	recordSuccessfulAttempt: vi.fn(),
}));

describe("Login Action Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long-!!!";
	});

	const mockCookies = {
		set: vi.fn(),
		get: vi.fn(),
		delete: vi.fn(),
		serialize: vi.fn(),
		getAll: vi.fn(),
	};

	it("should successfully log in with correct TOTP", async () => {
		// Setup mocks
		const mockUser = {
			id: 1,
			username: "testuser",
			passwordHash: "hashed_password",
			totpSecret: "encrypted_secret",
			totpSecretIV: "iv",
		};
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(true);
		(mfa.verifyTOTP as any).mockResolvedValue(true);

		// Prepare request
		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");
		formData.append("totpCode", "123456");

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		// Execute action
		try {
			await (actions.default as any)({ request, cookies: mockCookies });
			expect.fail("Action should have thrown a redirect");
		} catch (e: any) {
			if (e.status === 302) {
				expect(e.location).toBe("/");
				expect(mockCookies.set).toHaveBeenCalledWith(
					"session",
					expect.any(String),
					expect.any(Object),
				);
				expect(rateLimiter.recordSuccessfulAttempt).toHaveBeenCalledWith(
					"testuser",
				);
			} else {
				throw e;
			}
		}
	});

	it("should successfully log in with backup code", async () => {
		// Setup mocks
		const mockUser = {
			id: 1,
			username: "testuser",
			passwordHash: "hashed_password",
			totpSecret: "encrypted_secret",
			totpSecretIV: "iv",
		};
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(true);
		(mfa.verifyTOTP as any).mockResolvedValue(false); // TOTP fails

		const mockBackupCodes = [
			{ id: 101, code: "hashed_backup_1", used: false },
			{ id: 102, code: "hashed_backup_2", used: true },
		];
		(db.query.backupCodes.findMany as any).mockResolvedValue(mockBackupCodes);
		(mfa.verifyBackupCode as any).mockResolvedValue("hashed_backup_1");

		// Prepare request
		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");
		formData.append("totpCode", "ABC12345"); // Backup code

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		// Execute action
		try {
			await (actions.default as any)({ request, cookies: mockCookies });
			expect.fail("Action should have thrown a redirect");
		} catch (e: any) {
			if (e.status === 302) {
				expect(e.location).toBe("/");
				// Should have invalidated the backup code
				expect(db.update).toHaveBeenCalled();
			} else {
				throw e;
			}
		}
	});

	it("should fail with incorrect password", async () => {
		const mockUser = {
			id: 1,
			username: "testuser",
			passwordHash: "hashed_password",
		};
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(false);

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "WrongPassword!");
		formData.append("totpCode", "123456");

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		const result = await (actions.default as any)({
			request,
			cookies: mockCookies,
		});

		expect(result.status).toBe(401);
		expect(result.data.error).toBe("Invalid credentials");
		expect(rateLimiter.recordFailedAttempt).toHaveBeenCalledWith("testuser");
	});

	it("should fail if account is locked", async () => {
		(rateLimiter.checkRateLimit as any).mockResolvedValue({ locked: true });

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");
		formData.append("totpCode", "123456");

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		const result = await (actions.default as any)({
			request,
			cookies: mockCookies,
		});

		expect(result.status).toBe(429);
		expect(result.data.locked).toBe(true);
	});
});
