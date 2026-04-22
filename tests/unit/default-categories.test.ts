import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_CATEGORIES } from "$lib/utils/category-colours";

// Mock the db module
vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			spendingCategories: {
				findMany: vi.fn(),
			},
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				run: vi.fn(),
			})),
		})),
	},
}));

import { ensureDefaultCategories } from "$lib/server/categories";
import { db } from "$lib/db/client";

describe("ensureDefaultCategories", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("seeds all 10 default categories when user has zero categories", async () => {
		// User has no categories yet — should seed all defaults
		(db.query.spendingCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

		const result = await ensureDefaultCategories(1);

		expect(result.ok).toBe(true);
		expect(db.insert).toHaveBeenCalledTimes(DEFAULT_CATEGORIES.length);
	});

	it("does nothing when user already has categories", async () => {
		// User already has categories — skip seeding entirely
		(db.query.spendingCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 1, name: "Existing", key: "existing" },
		]);

		const result = await ensureDefaultCategories(1);

		expect(result.ok).toBe(true);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("sets isDefault=true on all seeded categories", async () => {
		(db.query.spendingCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

		await ensureDefaultCategories(1);

		const insertCalls = (db.insert as ReturnType<typeof vi.fn>).mock.calls;
		expect(insertCalls.length).toBe(DEFAULT_CATEGORIES.length);

		// The first argument to db.insert is the table, so we check the .values() calls
		// by inspecting the mock chain
		for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
			const valuesCall = (db.insert as ReturnType<typeof vi.fn>).mock.results[i].value.values;
			const valuesArg = (valuesCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
			expect(valuesArg.isDefault).toBe(true);
			expect(valuesArg.name).toBe(DEFAULT_CATEGORIES[i].name);
			expect(valuesArg.key).toBe(DEFAULT_CATEGORIES[i].key);
			expect(valuesArg.colour).toBe(DEFAULT_CATEGORIES[i].colour);
			expect(valuesArg.userId).toBe(1);
		}
	});

	it("returns error if db query fails", async () => {
		(db.query.spendingCategories.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("DB connection lost"),
		);

		const result = await ensureDefaultCategories(1);

		expect(result.ok).toBe(false);
	});
});
