import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock database client
vi.mock("$lib/db/client", () => {
	const mockDb = {
		query: {
			users: { findFirst: vi.fn() },
			loginAttempts: { findFirst: vi.fn() },
			backupCodes: { findMany: vi.fn() },
			sessions: { findFirst: vi.fn() },
		},
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		}),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}),
		delete: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		}),
	};
	return { db: mockDb };
});

// Mock MFA utilities
vi.mock("$lib/auth/mfa", () => ({
	decryptTOTPSecret: vi.fn(() => "plaintext-secret"),
	generateBackupCodes: vi.fn(() => [
		"A1B2C3D4", "E5F6G7H8", "I9J0K1L2", "M3N4O5P6", "Q7R8S9T0",
		"U1V2W3X4", "Y5Z6A7B8", "C9D0E1F2", "G3H4I5J6", "K7L8M9N0",
	]),
	generateOTPAuthURL: vi.fn(() => "otpauth://totp/Test"),
	generateQRCode: vi.fn(() => Promise.resolve("data:image/png;base64,test")),
	verifyTOTP: vi.fn(() => Promise.resolve(true)),
	verifyBackupCode: vi.fn(() => Promise.resolve(null)),
}));

// Mock password utilities
vi.mock("$lib/auth/password", () => ({
	verifyPassword: vi.fn(() => Promise.resolve(true)),
	hashPassword: vi.fn(() => Promise.resolve("hashed-value")),
}));

// Mock rate limiter
vi.mock("$lib/security/rate-limiter", () => ({
	checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
	recordFailedAttempt: vi.fn(() => Promise.resolve()),
	recordSuccessfulAttempt: vi.fn(() => Promise.resolve()),
}));

// Mock logger
vi.mock("$lib/utils/logger", () => ({
	devLog: vi.fn(),
	logError: vi.fn(),
	logFormData: vi.fn(),
}));

// Import after mocks
import { db } from "$lib/db/client";
import { actions as mfaSetupActions } from "../../src/routes/(auth)/mfa-setup/+page.server";
import { actions as loginActions } from "../../src/routes/(auth)/login/+page.server";
import { handle } from "../../src/hooks.server";
import { checkRateLimit } from "$lib/security/rate-limiter";
import { verifyTOTP } from "$lib/auth/mfa";
import { verifyPassword } from "$lib/auth/password";

describe("Authentication Bypass Prevention", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long-!!!";
		process.env.APP_ENV = "test";
	});

	// ─── Scenario 1: MFA setup finalize without setup completion flag ───

	describe("MFA Setup Bypass Prevention", () => {
		it("should reject MFA finalize without setup initiation flag", async () => {
			const formData = new FormData();
			formData.append("totpCode", "123456");

			// Simulate bypass: has setup token but skipped the QR code page
			const cookies = {
				get: vi.fn((name: string) => {
					if (name === "mfa-setup-token") return "some-token";
					return undefined; // mfa-setup-initiated NOT set
				}),
				set: vi.fn(),
				delete: vi.fn(),
				serialize: vi.fn(),
				getAll: vi.fn(),
			};

			const request = new Request("http://localhost/mfa-setup", {
				method: "POST",
				body: formData,
			});

			const result = await (mfaSetupActions.default as any)({
				request,
				cookies,
			});

			expect(result.status).toBe(403);
			expect(result.data.error).toContain("MFA setup not initiated");
		});

		it("should allow MFA finalize when setup was properly completed", async () => {
			(db.query.users.findFirst as any).mockResolvedValue({
				id: 1,
				username: "testuser",
				totpSecret: "PLAIN:testsecret",
				totpSecretIV: "00000000000000000000000000000000",
			});

			const formData = new FormData();
			formData.append("totpCode", "123456");

			// Simulate proper flow: user saw QR code, has both cookies
			const cookies = {
				get: vi.fn((name: string) => {
					if (name === "mfa-setup-initiated") return "true";
					if (name === "mfa-setup-token") return "valid-setup-token";
					return undefined;
				}),
				set: vi.fn(),
				delete: vi.fn(),
				serialize: vi.fn(),
				getAll: vi.fn(),
			};

			const request = new Request("http://localhost/mfa-setup", {
				method: "POST",
				body: formData,
			});

			const result = await (mfaSetupActions.default as any)({
				request,
				cookies,
			});

			expect(result.success).toBe(true);
			expect(result.backupCodes).toBeDefined();
			expect(result.backupCodes).toHaveLength(10);
			// Verify auto-login session was created
			expect(cookies.set).toHaveBeenCalledWith(
				"session",
				expect.any(String),
				expect.objectContaining({ httpOnly: true }),
			);
			// Verify setup cookies were cleaned up
			expect(cookies.delete).toHaveBeenCalledWith("mfa-setup-token", {
				path: "/",
			});
			expect(cookies.delete).toHaveBeenCalledWith("mfa-setup-initiated", {
				path: "/mfa-setup",
			});
		});
	});

	// ─── Scenario 3: MFA verification rate limiting ───

	describe("MFA Verification Rate Limiting", () => {
		it("should block login when account is locked from too many failures", async () => {
			(checkRateLimit as any).mockResolvedValue({
				allowed: false,
				locked: true,
				attemptsRemaining: 0,
			});

			const formData = new FormData();
			formData.append("username", "testuser");
			formData.append("password", "password123");
			formData.append("totpCode", "123456");

			const cookies = {
				set: vi.fn(),
				get: vi.fn(),
				delete: vi.fn(),
				serialize: vi.fn(),
				getAll: vi.fn(),
			};

			const request = new Request("http://localhost/login", {
				method: "POST",
				body: formData,
			});

			const result = await (loginActions.default as any)({
				request,
				cookies,
			});

			expect(result.status).toBe(429);
			expect(result.data.locked).toBe(true);
			expect(result.data.error).toContain("too many failed attempts");
		});

		it("should apply rate limit delay between attempts", async () => {
			(checkRateLimit as any).mockResolvedValue({
				allowed: true,
				delay: 8000,
				attemptsRemaining: 1,
			});

			const formData = new FormData();
			formData.append("username", "testuser");
			formData.append("password", "password123");
			formData.append("totpCode", "123456");

			const cookies = {
				set: vi.fn(),
				get: vi.fn(),
				delete: vi.fn(),
				serialize: vi.fn(),
				getAll: vi.fn(),
			};

			const request = new Request("http://localhost/login", {
				method: "POST",
				body: formData,
			});

			const result = await (loginActions.default as any)({
				request,
				cookies,
			});

			expect(result.status).toBe(429);
			expect(result.data.delay).toBe(8000);
			expect(result.data.error).toContain("wait before trying again");
		});

		it("should block at MFA verification boundary when rate limit hit mid-flow", async () => {
			// First check passes (initial rate limit)
			// Second check blocks (MFA verification boundary)
			(checkRateLimit as any)
				.mockResolvedValueOnce({ allowed: true, attemptsRemaining: 3 })
				.mockResolvedValueOnce({
					allowed: false,
					locked: true,
					attemptsRemaining: 0,
				});

			(db.query.users.findFirst as any).mockResolvedValue({
				id: 1,
				username: "testuser",
				passwordHash: "hashed-password",
				totpSecret: "PLAIN:testsecret",
				totpSecretIV: "00000000000000000000000000000000",
			});

			(verifyPassword as any).mockResolvedValue(true);

			const formData = new FormData();
			formData.append("username", "testuser");
			formData.append("password", "password123");
			formData.append("totpCode", "123456");

			const cookies = {
				set: vi.fn(),
				get: vi.fn(),
				delete: vi.fn(),
				serialize: vi.fn(),
				getAll: vi.fn(),
			};

			const request = new Request("http://localhost/login", {
				method: "POST",
				body: formData,
			});

			const result = await (loginActions.default as any)({
				request,
				cookies,
			});

			expect(result.status).toBe(429);
			expect(result.data.locked).toBe(true);
			// Verify dual rate limit: initial check + MFA boundary check
			expect(checkRateLimit).toHaveBeenCalledTimes(2);
			expect(checkRateLimit).toHaveBeenNthCalledWith(1, "testuser");
			expect(checkRateLimit).toHaveBeenNthCalledWith(2, "testuser");
		});
	});

	// ─── Scenario 4: Unauthenticated access to protected routes ───

	describe("Protected Route Access Control", () => {
		const createMockEvent = (
			pathname: string,
			sessionCookie?: string,
		) => ({
			url: new URL(`http://localhost${pathname}`),
			cookies: {
				get: vi.fn((name: string) =>
					name === "session" ? sessionCookie : undefined,
				),
				delete: vi.fn(),
				set: vi.fn(),
				serialize: vi.fn(),
				getAll: vi.fn(),
			},
			getClientAddress: vi.fn(() => "127.0.0.1"),
			resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
			locals: {} as any,
		});

		it("should redirect unauthenticated users from /accounts to login", async () => {
			const event = createMockEvent("/accounts");

			try {
				await handle({ event, resolve: event.resolve } as any);
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				expect(e.status).toBe(302);
				expect(e.location).toBe("/login");
			}
		});

		it("should redirect unauthenticated users from /settings to login", async () => {
			const event = createMockEvent("/settings");

			try {
				await handle({ event, resolve: event.resolve } as any);
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				expect(e.status).toBe(302);
				expect(e.location).toBe("/login");
			}
		});

		it("should redirect users with invalid session from protected routes and clear cookie", async () => {
			(db.query.sessions.findFirst as any).mockResolvedValue(null);

			const event = createMockEvent("/accounts", "invalid-session-token");

			try {
				await handle({ event, resolve: event.resolve } as any);
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				expect(e.status).toBe(302);
				expect(e.location).toBe("/login");
			}

			// Invalid session cookie should be cleared
			expect(event.cookies.delete).toHaveBeenCalledWith("session", {
				path: "/",
			});
		});

		it("should allow unauthenticated access to auth routes (login, register)", async () => {
			const loginEvent = createMockEvent("/login");
			await handle({ event: loginEvent, resolve: loginEvent.resolve } as any);
			expect(loginEvent.resolve).toHaveBeenCalled();

			const registerEvent = createMockEvent("/register");
			await handle({ event: registerEvent, resolve: registerEvent.resolve } as any);
			expect(registerEvent.resolve).toHaveBeenCalled();
		});
	});
});
