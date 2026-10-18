import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	incomeHistory,
	taxBandHistory,
	users,
} from "$lib/db/schema";
import { computeFinderYear, getBandFinderReport } from "./tax-bands";

const NOW = new Date("2026-10-18T12:00:00Z"); // current month 2026-10, tax year 2026/27

function incomeMap(entries: Record<string, number>): Map<string, number> {
	return new Map(Object.entries(entries));
}

describe("Band finder verdict states (pure computation)", () => {
	it("FIRM: all 12 months known → final verdict", () => {
		const entries: Record<string, number> = {};
		const months = [
			"2025-04",
			"2025-05",
			"2025-06",
			"2025-07",
			"2025-08",
			"2025-09",
			"2025-10",
			"2025-11",
			"2025-12",
			"2026-01",
			"2026-02",
			"2026-03",
		];
		for (const m of months) entries[m] = 5_200_00; // £62,400/yr

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("FIRM");
		expect(result.knownMonths).toHaveLength(12);
		expect(result.knownTotalInCents).toBe(62_400_00);
		expect(result.suggestedBand).toBe("higher");
		expect(result.targetThresholdInCents).toBe(50_270_00);
		expect(result.marginInCents).toBe(62_400_00 - 50_270_00);
	});

	it("FIRM under the threshold → basic", () => {
		const entries: Record<string, number> = {};
		for (let _y = 2025, start = 3; start < 15; start++) {
			const year = 2025 + Math.floor(start / 12);
			const month = (start % 12) + 1;
			entries[`${year}-${String(month).padStart(2, "0")}`] = 3_000_00;
		}

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("FIRM");
		expect(result.suggestedBand).toBe("basic");
		expect(result.marginInCents).toBe(36_000_00 - 50_270_00);
	});

	it("BOUNDED: 9 known months totalling £41,300 → missing months need ≥ £2,990/mo", () => {
		// Spec scenario: £41,300 known vs £50,270 threshold, 3 months missing
		const entries: Record<string, number> = {
			"2025-04": 4_500_00,
			"2025-05": 4_500_00,
			"2025-06": 4_500_00,
			"2025-07": 4_500_00,
			"2025-08": 4_500_00,
			"2025-09": 4_500_00,
			"2025-10": 4_500_00,
			"2025-11": 4_500_00,
			"2026-02": 5_300_00, // 8×£4,500 + £5,300 = £41,300
		};

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("BOUNDED");
		expect(result.knownTotalInCents).toBe(41_300_00);
		expect(result.missingPastMonths).toHaveLength(3);
		expect(result.overRegardless).toBe(false);
		expect(result.requiredAvgPerMissingMonthInCents).toBe(2_990_00);
		expect(result.suggestedBand).toBe("basic"); // known-only assessment under threshold
	});

	it("BOUNDED: over regardless when known income alone exceeds the threshold", () => {
		const entries: Record<string, number> = {};
		for (const m of [
			"2025-04",
			"2025-05",
			"2025-06",
			"2025-07",
			"2025-08",
			"2025-09",
			"2025-10",
			"2025-11",
			"2025-12",
			"2026-01",
		]) {
			entries[m] = 6_000_00; // £60,000 known, 2 missing
		}

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("BOUNDED");
		expect(result.overRegardless).toBe(true);
		expect(result.requiredAvgPerMissingMonthInCents).toBe(0);
		expect(result.suggestedBand).toBe("higher");
	});

	it("BOUNDED reverse-computation targets the additional threshold when higher is already passed", () => {
		const entries: Record<string, number> = {};
		for (const m of [
			"2025-04",
			"2025-05",
			"2025-06",
			"2025-07",
			"2025-08",
			"2025-09",
			"2025-10",
			"2025-11",
			"2025-12",
			"2026-01",
		]) {
			entries[m] = 15_500_00; // £155,000 known, 2 missing
		}

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("BOUNDED");
		expect(result.overRegardless).toBe(true); // ≥ higher regardless
		expect(result.targetThresholdInCents).toBe(150_000_00);
		expect(result.suggestedBand).toBe("additional");
	});

	it("EXPECTED: future months project at the last known month's rate", () => {
		const entries: Record<string, number> = {
			"2026-04": 5_200_00,
			"2026-05": 5_200_00,
			"2026-06": 5_200_00,
			"2026-07": 5_200_00,
			"2026-08": 5_200_00,
			"2026-09": 5_200_00,
		};

		const result = computeFinderYear({
			taxYear: "2026/27",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("EXPECTED");
		expect(result.projectionAssumptionSource).toBe("last-known");
		expect(result.projectionAssumptionInCents).toBe(5_200_00);
		// 6 future months (incl. current Oct) projected at £5,200
		expect(result.projectedMonths).toHaveLength(6);
		expect(result.projectedTotalInCents).toBe(31_200_00);
		expect(result.assessmentTotalInCents).toBe(62_400_00);
		expect(result.suggestedBand).toBe("higher");
	});

	it("EXPECTED: projection assumption is editable via override", () => {
		const entries: Record<string, number> = {
			"2026-04": 3_000_00,
			"2026-05": 3_000_00,
			"2026-06": 3_000_00,
			"2026-07": 3_000_00,
			"2026-08": 3_000_00,
			"2026-09": 3_000_00,
		};

		const base = computeFinderYear({
			taxYear: "2026/27",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});
		expect(base.suggestedBand).toBe("basic");

		const overridden = computeFinderYear({
			taxYear: "2026/27",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
			projectionOverrideInCents: 6_500_00, // pay rise from October
		});

		expect(overridden.projectionAssumptionSource).toBe("override");
		expect(overridden.projectionAssumptionInCents).toBe(6_500_00);
		// 18,000 + 6×6,500 = 57,000 → higher
		expect(overridden.assessmentTotalInCents).toBe(57_000_00);
		expect(overridden.suggestedBand).toBe("higher");
	});

	it("UNKNOWN: no income rows for the year", () => {
		const result = computeFinderYear({
			taxYear: "2024/25",
			incomeByMonth: new Map(),
			taxableInterestInCents: 0,
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("UNKNOWN");
		expect(result.suggestedBand).toBeNull();
	});

	it("taxable interest counts toward the threshold", () => {
		const entries: Record<string, number> = {};
		for (const m of [
			"2025-04",
			"2025-05",
			"2025-06",
			"2025-07",
			"2025-08",
			"2025-09",
			"2025-10",
			"2025-11",
			"2025-12",
			"2026-01",
			"2026-02",
			"2026-03",
		]) {
			entries[m] = 5_000_00; // £60,000 — under additional
		}

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 90_500_00, // pushes over £150,000
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.assessmentTotalInCents).toBe(150_500_00);
		expect(result.suggestedBand).toBe("additional");
		expect(result.marginInCents).toBe(500_00);
	});

	it("bounded math rounds up to the cent", () => {
		const entries: Record<string, number> = {
			"2025-04": 4_000_00,
			"2025-05": 4_000_00,
			"2025-06": 4_000_00,
			"2025-07": 4_000_00,
			"2025-08": 4_000_00,
			"2025-09": 4_000_00,
			"2025-10": 4_000_00,
			"2025-11": 4_000_00,
			"2025-12": 4_000_00,
			"2026-01": 4_000_00,
			"2026-02": 4_000_00,
		}; // £44,000 known, 1 missing; deficit 6,270.00 over 1 month

		const result = computeFinderYear({
			taxYear: "2025/26",
			incomeByMonth: incomeMap(entries),
			taxableInterestInCents: 1, // £0.01 — forces ceil rounding
			interestIncludesProjection: false,
			now: NOW,
		});

		expect(result.state).toBe("BOUNDED");
		// (50,270.00 − 44,000.01) / 1 = 6,269.99 → ceil to the cent
		expect(result.requiredAvgPerMissingMonthInCents).toBe(6_269_99);
	});
});

describe("Band finder report (DB integration)", () => {
	let testUserId: number;
	let createdUserIds: number[] = [];
	let createdAccountIds: number[] = [];

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({
				username: `test-finder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);
	});

	afterEach(async () => {
		await db
			.delete(incomeHistory)
			.where(
				createdUserIds.length
					? inArray(incomeHistory.userId, createdUserIds)
					: eq(incomeHistory.userId, -1),
			);
		await db
			.delete(taxBandHistory)
			.where(
				createdUserIds.length
					? inArray(taxBandHistory.userId, createdUserIds)
					: eq(taxBandHistory.userId, -1),
			);
		if (createdAccountIds.length > 0) {
			await db
				.delete(accountTransactions)
				.where(inArray(accountTransactions.accountId, createdAccountIds));
			for (const accountId of createdAccountIds) {
				await db.delete(accounts).where(eq(accounts.id, accountId));
			}
		}
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		createdUserIds = [];
		createdAccountIds = [];
	});

	it("excludes ISA (tax-wrappered) interest from the threshold comparison", async () => {
		const timestamp = Date.now();

		const [plainSavings] = await db
			.insert(accounts)
			.values({
				slug: `test-finder-plain-${timestamp}`,
				userId: testUserId,
				name: "Plain Savings",
				type: "savings",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		const [isaSavings] = await db
			.insert(accounts)
			.values({
				slug: `test-finder-isa-${timestamp}`,
				userId: testUserId,
				name: "ISA Savings",
				type: "savings",
				taxWrapper: "isa",
				category: "asset",
			})
			.returning();
		createdAccountIds.push(plainSavings.id, isaSavings.id);

		await db.insert(accountTransactions).values([
			{
				slug: `t1-${timestamp}`,
				accountId: plainSavings.id,
				type: "interest",
				amount: 30_000, // £300 taxable
				description: "Interest",
				transactionDate: new Date("2026-05-10T12:00:00Z"),
				createdAt: new Date(),
			},
			{
				slug: `t2-${timestamp}`,
				accountId: isaSavings.id,
				type: "interest",
				amount: 50_000, // £500 tax-free — must NOT count
				description: "ISA interest",
				transactionDate: new Date("2026-05-10T12:00:00Z"),
				createdAt: new Date(),
			},
		]);

		// All past months of the in-progress year known → EXPECTED
		const incomeRows = ["04", "05", "06", "07", "08", "09"].map((mm) => ({
			userId: testUserId,
			month: `2026-${mm}`,
			grossIncomeInCents: 3_000_00,
			note: null,
		}));
		await db.insert(incomeHistory).values(incomeRows);

		const report = await getBandFinderReport(testUserId, { now: NOW });
		const year = report.find((y) => y.taxYear === "2026/27");
		expect(year).toBeDefined();
		expect(year?.taxableInterestInCents).toBe(30_000);
		expect(year?.state).toBe("EXPECTED");
	});

	it("assembles years from income rows plus the current tax year", async () => {
		await db.insert(incomeHistory).values([
			{
				userId: testUserId,
				month: "2024-06",
				grossIncomeInCents: 3_500_00,
				note: null,
			},
			{
				userId: testUserId,
				month: "2025-11",
				grossIncomeInCents: 5_200_00,
				note: "salary change",
			},
		]);

		const report = await getBandFinderReport(testUserId, { now: NOW });
		const years = report.map((y) => y.taxYear);

		expect(years).toContain("2026/27"); // current tax year always present
		expect(years).toContain("2025/26");
		expect(years).toContain("2024/25");
		// Descending order
		expect(years[0]).toBe("2026/27");
	});
});
