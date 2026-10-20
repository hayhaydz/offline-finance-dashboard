import { beforeEach, describe, expect, it, vi } from "vitest";
import * as password from "$lib/auth/password";
import { db } from "$lib/db/client";
import * as rateLimiter from "$lib/security/rate-limiter";
import * as enroll from "$lib/server/crypto/enroll";
import * as keyring from "$lib/server/crypto/keyring";
import { actions } from "../../src/routes/(auth)/login/+page.server";

// Mock dependencies
vi.mock("$lib/db/client", () => {
	const mockDb = {
		query: {
			users: {
				findFirst: vi.fn(),
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

vi.mock("$lib/auth/password", () => ({
	hashPassword: vi.fn(() => Promise.resolve("dummy-hash-for-timing")),
	verifyPassword: vi.fn(),
}));

vi.mock("$lib/security/rate-limiter", () => ({
	checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
	recordFailedAttempt: vi.fn(),
	recordSuccessfulAttempt: vi.fn(),
}));

// Envelope keyring: mock unwrap + unlock so the ceremony can be exercised
// without real Argon2/GCM work.
vi.mock("$lib/server/crypto/enroll", () => ({
	hasEnvelope: vi.fn(() => Promise.resolve(true)),
	unwrapPasswordSlot: vi.fn(() => Promise.resolve(Buffer.alloc(32, 7))),
}));

vi.mock("$lib/server/crypto/keyring", () => ({
	unlockKeyring: vi.fn(),
	sealKeyring: vi.fn(),
}));

describe("Login Action Integration (L1 unlock ceremony)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: enrolled envelope, successful unwrap
		(enroll.hasEnvelope as any).mockResolvedValue(true);
		(enroll.unwrapPasswordSlot as any).mockResolvedValue(Buffer.alloc(32, 7));
	});

	const mockCookies = {
		set: vi.fn(),
		get: vi.fn(),
		delete: vi.fn(),
		serialize: vi.fn(),
		getAll: vi.fn(),
	};

	const mockUser = {
		id: 1,
		username: "testuser",
		passwordHash: "hashed_password",
		passwordSalt: "a".repeat(32),
	};

	it("should log in AND unlock with the correct password", async () => {
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(true);

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		try {
			await (actions.default as any)({
				request,
				cookies: mockCookies,
				url: new URL("http://localhost/login"),
			});
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
				// Ceremony: password slot unwrapped → DataKey unlocked in memory
				expect(enroll.unwrapPasswordSlot).toHaveBeenCalledTimes(1);
				expect(keyring.unlockKeyring).toHaveBeenCalledWith(
					1,
					expect.any(Buffer),
				);
			} else {
				throw e;
			}
		}
	});

	it("should return to the preserved redirectTo after re-auth (audit #21)", async () => {
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(true);

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		try {
			await (actions.default as any)({
				request,
				cookies: mockCookies,
				url: new URL(
					"http://localhost/login?reason=expired&redirectTo=%2Foverview%2Fbudgets%2F2026-10%3Ftab%3Dx",
				),
			});
			expect.fail("Action should have thrown a redirect");
		} catch (e: any) {
			if (e.status === 302) {
				expect(e.location).toBe("/overview/budgets/2026-10?tab=x");
			} else {
				throw e;
			}
		}
	});

	it("wrong password NEVER reaches the slot unwrap (design D2)", async () => {
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(false);

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "WrongPassword!");

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
		// The auth-hash gate rejected BEFORE any unwrap attempt
		expect(enroll.unwrapPasswordSlot).not.toHaveBeenCalled();
		expect(keyring.unlockKeyring).not.toHaveBeenCalled();
	});

	it("routes legacy (pre-envelope) users to the one-shot migration", async () => {
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(true);
		(enroll.hasEnvelope as any).mockResolvedValue(false);

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");

		const request = new Request("http://localhost/login", {
			method: "POST",
			body: formData,
		});

		try {
			await (actions.default as any)({
				request,
				cookies: mockCookies,
				url: new URL("http://localhost/login"),
			});
			expect.fail("Action should have thrown a redirect");
		} catch (e: any) {
			if (e.status === 302) {
				expect(e.location).toBe("/migrate");
			} else {
				throw e;
			}
		}
	});

	it("unwrap failure is treated as a credential failure", async () => {
		(db.query.users.findFirst as any).mockResolvedValue(mockUser);
		(password.verifyPassword as any).mockResolvedValue(true);
		const { EnvelopeError } = await import("$lib/server/crypto/envelope");
		(enroll.unwrapPasswordSlot as any).mockRejectedValue(
			new EnvelopeError("TAMPERED", "nope"),
		);

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");

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
		expect(keyring.unlockKeyring).not.toHaveBeenCalled();
	});

	it("should fail if account is locked", async () => {
		(rateLimiter.checkRateLimit as any).mockResolvedValue({ locked: true });

		const formData = new FormData();
		formData.append("username", "testuser");
		formData.append("password", "Password123!");

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
