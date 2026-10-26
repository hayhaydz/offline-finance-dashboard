import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { taxBandHistory, users } from "$lib/db/schema";
import { getTaxFreeStatus } from "$lib/utils/tax-year-utils";
import {
	addTaxBandRow,
	applyBandVerdict,
	bandForTaxYear,
	closeTaxBandRow,
	deleteTaxBandRow,
	findBandRangeConflict,
	normalizeEffectiveFromInput,
	resolveBandFromRows,
} from "./tax-bands";

describe("Tax band resolver", () => {
	let testUserId: number;
	let createdUserIds: number[] = [];

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({
				username: `test-tax-bands-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				passwordHash: "hash",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);
	});

	afterEach(async () => {
		await db
			.delete(taxBandHistory)
			.where(
				createdUserIds.length
					? inArray(taxBandHistory.userId, createdUserIds)
					: eq(taxBandHistory.userId, -1),
			);
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		createdUserIds = [];
	});

	it("returns the covering row for a tax year", async () => {
		await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2023/24",
			toTaxYear: "2024/25",
		});
		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2025/26",
			toTaxYear: null,
		});

		const resolution = await bandForTaxYear(testUserId, "2025/26");
		expect(resolution.band).toBe("higher");
		expect(resolution.source).toBe("history");

		const openEnded = await bandForTaxYear(testUserId, "2027/28");
		expect(openEnded.band).toBe("higher");
		expect(openEnded.source).toBe("history");

		const past = await bandForTaxYear(testUserId, "2024/25");
		expect(past.band).toBe("basic");
		expect(past.source).toBe("history");
	});

	it("falls back to the nearest earlier row on a gap (assumed from history)", async () => {
		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2024/25",
			toTaxYear: "2025/26",
		});

		const resolution = await bandForTaxYear(testUserId, "2027/28");
		expect(resolution.band).toBe("higher");
		expect(resolution.source).toBe("assumed-earlier");
		expect(resolution.fromTaxYear).toBe("2024/25");
	});

	it("falls back to the legacy enum when no history covers the year", async () => {
		await db
			.update(users)
			.set({ taxBand: "higher" })
			.where(eq(users.id, testUserId));

		const resolution = await bandForTaxYear(testUserId, "2020/21");
		expect(resolution.band).toBe("higher");
		expect(resolution.source).toBe("legacy");
	});

	it("rejects overlapping ranges with an error naming the conflict", async () => {
		await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2023/24",
			toTaxYear: "2025/26",
		});

		const conflicting = await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2025/26",
			toTaxYear: null,
		});
		expect(conflicting.ok).toBe(false);
		if (!conflicting.ok) {
			expect(conflicting.error).toContain("2023/24");
			expect(conflicting.error).toContain("2025/26");
		}

		// No row was written for the rejected add
		const rows = await db.query.taxBandHistory.findMany({
			where: eq(taxBandHistory.userId, testUserId),
		});
		expect(rows).toHaveLength(1);
	});

	it("normalises mid-year input to the containing tax year (July 2026 → 2026/27)", () => {
		expect(normalizeEffectiveFromInput("2026-07")).toBe("2026/27");
		expect(normalizeEffectiveFromInput("2026-07-15")).toBe("2026/27");
		expect(normalizeEffectiveFromInput("2026/27")).toBe("2026/27");
		expect(normalizeEffectiveFromInput("2026-27")).toBe("2026/27");
		expect(normalizeEffectiveFromInput("2026-04")).toBe("2026/27");
		expect(normalizeEffectiveFromInput("2026-03")).toBe("2025/26");
		expect(normalizeEffectiveFromInput("not-a-date")).toBeNull();
	});

	it("applies the past-year band to PSA: 2025/26 higher → £500", async () => {
		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2024/25",
			toTaxYear: "2025/26",
		});
		await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2026/27",
			toTaxYear: null,
		});

		const past = await bandForTaxYear(testUserId, "2025/26");
		expect(getTaxFreeStatus(0, past.band).allowance).toBe(500_00);

		const current = await bandForTaxYear(testUserId, "2026/27");
		expect(getTaxFreeStatus(0, current.band).allowance).toBe(1_000_00);
	});

	it("syncs the legacy enum cache when the latest row changes", async () => {
		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2025/26",
			toTaxYear: null,
		});

		const row = await db.query.users.findFirst({
			where: eq(users.id, testUserId),
			columns: { taxBand: true },
		});
		expect(row?.taxBand).toBe("higher");
	});

	it("applyBandVerdict closes the open earlier row and inserts the new band", async () => {
		await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2024/25",
			toTaxYear: null,
		});

		const result = await applyBandVerdict(testUserId, "2026/27", "higher");
		expect(result.ok).toBe(true);

		const rows = await db.query.taxBandHistory.findMany({
			where: eq(taxBandHistory.userId, testUserId),
		});
		expect(rows).toHaveLength(2);

		const basic = rows.find((r) => r.band === "basic");
		const higher = rows.find((r) => r.band === "higher");
		expect(basic?.toTaxYear).toBe("2025/26");
		expect(higher?.fromTaxYear).toBe("2026/27");
		expect(higher?.toTaxYear).toBeNull();

		const cache = await db.query.users.findFirst({
			where: eq(users.id, testUserId),
			columns: { taxBand: true },
		});
		expect(cache?.taxBand).toBe("higher");
	});

	it("applyBandVerdict rejects when a closed row explicitly covers the year", async () => {
		await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2025/26",
			toTaxYear: "2027/28",
		});

		const result = await applyBandVerdict(testUserId, "2026/27", "higher");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("basic");
		}

		// Nothing was written or mutated
		const rows = await db.query.taxBandHistory.findMany({
			where: eq(taxBandHistory.userId, testUserId),
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].toTaxYear).toBe("2027/28");
	});

	it("applyBandVerdict is a no-op when the covering band matches", async () => {
		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2025/26",
			toTaxYear: null,
		});

		const result = await applyBandVerdict(testUserId, "2026/27", "higher");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.message).toContain("already in effect");
		}

		const rows = await db.query.taxBandHistory.findMany({
			where: eq(taxBandHistory.userId, testUserId),
		});
		expect(rows).toHaveLength(1);
	});

	it("closing and deleting rows respects ownership and ranges", async () => {
		const added = await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2024/25",
			toTaxYear: null,
		});
		expect(added.ok).toBe(true);

		const row = await db.query.taxBandHistory.findFirst({
			where: eq(taxBandHistory.userId, testUserId),
		});
		if (!row) throw new Error("Expected band row");

		const closed = await closeTaxBandRow(testUserId, row.id, "2025/26");
		expect(closed.ok).toBe(true);

		const invalidClose = await closeTaxBandRow(testUserId, row.id, "2023/24");
		expect(invalidClose.ok).toBe(false);

		const [otherUser] = await db
			.insert(users)
			.values({
				username: `other-${Date.now()}`,
				passwordHash: "hash",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		createdUserIds.push(otherUser.id);

		const foreign = await deleteTaxBandRow(otherUser.id, row.id);
		expect(foreign.ok).toBe(false);

		const deleted = await deleteTaxBandRow(testUserId, row.id);
		expect(deleted.ok).toBe(true);
	});

	it("findBandRangeConflict detects adjacency boundaries correctly (pure)", () => {
		const existing = [
			{ band: "basic" as const, fromTaxYear: "2023/24", toTaxYear: "2024/25" },
		];

		// Adjacent ranges do NOT conflict
		expect(
			findBandRangeConflict(existing, {
				fromTaxYear: "2025/26",
				toTaxYear: null,
			}),
		).toBeNull();

		// Touching the end boundary DOES conflict (inclusive years)
		expect(
			findBandRangeConflict(existing, {
				fromTaxYear: "2024/25",
				toTaxYear: null,
			}),
		).not.toBeNull();

		// Fully separate
		expect(
			findBandRangeConflict(existing, {
				fromTaxYear: "2020/21",
				toTaxYear: "2022/23",
			}),
		).toBeNull();
	});

	it("resolveBandFromRows prefers the latest covering row (pure)", () => {
		const rows = [
			{ band: "basic" as const, fromTaxYear: "2020/21", toTaxYear: null },
			{ band: "higher" as const, fromTaxYear: "2024/25", toTaxYear: null },
		];
		const resolution = resolveBandFromRows(rows, "2025/26", "basic");
		expect(resolution.band).toBe("higher");
		expect(resolution.source).toBe("history");
	});
});

describe("Snapshot tax position resolves per-year band (audit #7 regression)", () => {
	let testUserId: number;
	let createdUserIds: number[] = [];

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({
				username: `test-snapshot-band-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				passwordHash: "hash",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);
	});

	afterEach(async () => {
		await db
			.delete(taxBandHistory)
			.where(
				createdUserIds.length
					? inArray(taxBandHistory.userId, createdUserIds)
					: eq(taxBandHistory.userId, -1),
			);
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		createdUserIds = [];
	});

	it("uses the resolver's band for the snapshot's tax year, not hardcoded basic", async () => {
		const { calculateSnapshotData } = await import(
			"$lib/server/snapshot-utils"
		);

		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2025/26",
			toTaxYear: null,
		});

		// Snapshot dated Jan 2026 → tax year 2025/26 → higher → £500 PSA
		const data = await calculateSnapshotData(
			testUserId,
			new Date("2026-01-15T12:00:00Z"),
		);

		expect(data.interestBreakdownDetail.taxPosition.taxBand).toBe("higher");
		expect(
			data.interestBreakdownDetail.taxPosition.personalSavingsAllowance
				.allowance,
		).toBe(500_00);
	});
});
