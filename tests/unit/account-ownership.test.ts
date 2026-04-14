import { describe, expect, it, vi } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			accounts: {
				findFirst: vi.fn(),
			},
		},
	},
}));
vi.mock("$lib/auth/row-security", () => ({
	validateUserAccess: vi.fn(),
}));

import { requireAccountOwnership } from "$lib/server/account-ownership";
import { db } from "$lib/db/client";
import { validateUserAccess } from "$lib/auth/row-security";

function mockLocals(userId?: number): App.Locals {
	return { user: userId ? { id: userId } as any : undefined };
}

describe("requireAccountOwnership", () => {
	it("throws redirect when no user in locals", async () => {
		await expect(
			requireAccountOwnership(mockLocals(), "some-slug"),
		).rejects.toThrow();
	});

	it("throws 404 when account not found", async () => {
		(
			db.query.accounts.findFirst as ReturnType<typeof vi.fn>
		).mockResolvedValue(null);

		await expect(
			requireAccountOwnership(mockLocals(1), "nonexistent"),
		).rejects.toThrow();
	});

	it("throws when validateUserAccess fails", async () => {
		(
			db.query.accounts.findFirst as ReturnType<typeof vi.fn>
		).mockResolvedValue({
			id: 10,
			slug: "my-account",
			userId: 999,
		});
		(
			validateUserAccess as ReturnType<typeof vi.fn>
		).mockImplementation(() => {
			throw new Error("Forbidden");
		});

		await expect(
			requireAccountOwnership(mockLocals(1), "my-account"),
		).rejects.toThrow("Forbidden");
	});

	it("returns account when ownership is valid", async () => {
		const account = { id: 10, slug: "my-account", userId: 1 };
		(
			db.query.accounts.findFirst as ReturnType<typeof vi.fn>
		).mockResolvedValue(account);
		(
			validateUserAccess as ReturnType<typeof vi.fn>
		).mockReturnValue(undefined);

		const result = await requireAccountOwnership(
			mockLocals(1),
			"my-account",
		);

		expect(result).toEqual(account);
		expect(db.query.accounts.findFirst).toHaveBeenCalledWith({
			where: expect.anything(),
		});
		// validateUserAccess signature: (resource, user, resourceType)
		expect(validateUserAccess).toHaveBeenCalledWith(
			account,
			{ id: 1 },
			"Account",
		);
	});
});
