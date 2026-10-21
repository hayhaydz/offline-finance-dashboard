import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import { actions } from "../../src/routes/(auth)/register/+page.server";

// Mock dependencies
vi.mock("$lib/db/client", () => {
	// Registration is atomic (crypto-rotation-safety 2.2): user insert +
	// password slot commit inside ONE synchronous db.transaction — the mock
	// mirrors the sync drizzle surface (.returning().all() / .run()).
	const mockTx = {
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => ({ all: () => [{ id: 1 }] })),
				run: vi.fn(),
			})),
		})),
	};
	const mockDb = {
		query: {
			users: {
				findFirst: vi.fn(),
			},
		},
		insert: mockTx.insert,
		transaction: vi.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
	};
	return { db: mockDb };
});

vi.mock("$lib/auth/password", () => ({
	hashPassword: vi.fn(() => Promise.resolve("hashed_password")),
}));

// Envelope: password slot enrollment + keyring unlock are exercised through
// mocks (real Argon2id + GCM are covered by tests/unit/envelope.test.ts).
vi.mock("$lib/server/crypto/enroll", () => ({
	enrollPasswordSlot: vi.fn(() =>
		Promise.resolve({ dataKey: Buffer.alloc(32, 3), slotId: "slot-1" }),
	),
}));

vi.mock("$lib/server/crypto/keyring", () => ({
	unlockKeyring: vi.fn(),
}));

describe("Registration Action Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long-!!!";
	});

	it("should successfully register a new user", async () => {
		// Setup mocks
		(db.query.users.findFirst as any).mockResolvedValue(null);

		// Prepare request
		const formData = new FormData();
		formData.append("username", "newuser");
		formData.append("password", "StrongPassword123!");
		formData.append("confirmPassword", "StrongPassword123!");

		const cookies = {
			set: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn(),
			getAll: vi.fn(),
		};

		const request = new Request("http://localhost/register", {
			method: "POST",
			body: formData,
		});

		// Execute action
		try {
			await (actions.default as any)({ request, cookies });
			expect.fail("Action should have thrown a redirect");
		} catch (e: any) {
			// SvelteKit uses throws for redirects
			if (e.status === 302) {
				// Registration now creates the envelope (DataKey + password
				// slot) and REQUIRES recovery enrollment in the same session.
				expect(e.location).toBe("/recovery-enroll?mode=register");
				expect(cookies.set).toHaveBeenCalledWith(
					"recovery-enroll-user",
					"1",
					expect.any(Object),
				);
			} else {
				throw e;
			}
		}
	});

	it("should fail if passwords do not match", async () => {
		const formData = new FormData();
		formData.append("username", "newuser");
		formData.append("password", "Password123!");
		formData.append("confirmPassword", "Different123!");

		const cookies = {} as any;
		const request = new Request("http://localhost/register", {
			method: "POST",
			body: formData,
		});

		const result = await (actions.default as any)({ request, cookies });

		expect(result.status).toBe(400);
		expect(result.data.error).toBe("Passwords do not match");
	});

	it("should fail if username is already taken", async () => {
		(db.query.users.findFirst as any).mockResolvedValue({
			id: 1,
			username: "existinguser",
		});

		const formData = new FormData();
		formData.append("username", "existinguser");
		formData.append("password", "Password123!");
		formData.append("confirmPassword", "Password123!");

		const cookies = {} as any;
		const request = new Request("http://localhost/register", {
			method: "POST",
			body: formData,
		});

		const result = await (actions.default as any)({ request, cookies });

		expect(result.status).toBe(400);
		expect(result.data.error).toBe("Username already taken");
	});
});
