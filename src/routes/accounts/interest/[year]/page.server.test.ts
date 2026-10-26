import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import { taxBandHistory, users } from "$lib/db/schema";
import { addTaxBandRow } from "$lib/server/tax-bands";
import { taxYearSlugFromCanonical } from "$lib/utils/tax-year-utils";
import { load } from "./+page.server";

describe("Interest year page — per-year band resolution", () => {
	let testUserId: number;
	let createdUserIds: number[] = [];
	type LoadInput = Parameters<typeof load>[0];

	beforeEach(async () => {
		const timestamp = Date.now();
		const [user] = await db
			.insert(users)
			.values({
				username: `test-interest-year-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
				passwordHash: "hash",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);

		// Persona: higher in 2025/26 (closed), basic from 2026/27 (open)
		await addTaxBandRow(testUserId, {
			band: "higher",
			fromTaxYear: "2025/26",
			toTaxYear: "2025/26",
		});
		await addTaxBandRow(testUserId, {
			band: "basic",
			fromTaxYear: "2026/27",
			toTaxYear: null,
		});
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

	function makeInput(year: string): LoadInput {
		const locals = { user: { id: testUserId } as User };
		return {
			locals,
			params: { year },
			url: new URL("http://localhost"),
		} as unknown as LoadInput;
	}

	async function loadPage(year: string) {
		const result = await load(makeInput(year));
		if (!result) throw new Error("Expected load data");
		return result;
	}

	it("applies the past-year band: 2025/26 higher → £500 PSA", async () => {
		const result = await loadPage("2025-26");

		expect(result.bandInfo.band).toBe("higher");
		expect(result.bandInfo.psaAllowanceInCents).toBe(500_00);
		expect(result.forecast.psaStatusNow.allowance).toBe(500_00);
		expect(result.bandInfo.bandChangedFromPriorYear).toBe(true);
	});

	it("applies the current open row's band for later years", async () => {
		const result = await loadPage("2026-27");

		expect(result.bandInfo.band).toBe("basic");
		expect(result.forecast.psaStatusNow.allowance).toBe(1_000_00);
		expect(result.bandInfo.bandChangedFromPriorYear).toBe(true); // higher → basic
	});

	it("labels the in-progress tax year as current (expected framing)", async () => {
		const now = new Date();
		const startYear = now.getUTCFullYear();
		const startOfTaxYear = new Date(Date.UTC(startYear, 3, 6));
		const currentStartYear = now >= startOfTaxYear ? startYear : startYear - 1;
		const slug = taxYearSlugFromCanonical(
			`${currentStartYear}/${String(currentStartYear + 1).slice(-2)}`,
		);

		const result = await loadPage(slug);
		expect(result.bandInfo.isCurrentTaxYear).toBe(true);
	});

	it("marks gap fallback as assumed from history", async () => {
		// Close the basic row so 2028/29 has no covering row — nearest
		// earlier (basic 2026/27) applies with an assumption marker.
		const rows = await db.query.taxBandHistory.findMany({
			where: eq(taxBandHistory.userId, testUserId),
		});
		const basicRow = rows.find((r) => r.band === "basic");
		if (!basicRow) throw new Error("Expected basic row");
		await db
			.update(taxBandHistory)
			.set({ toTaxYear: "2026/27" })
			.where(eq(taxBandHistory.id, basicRow.id));

		const result = await loadPage("2028-29");

		expect(result.bandInfo.band).toBe("basic");
		expect(result.bandInfo.source).toBe("assumed-earlier");
		expect(result.bandInfo.assumedFromTaxYear).toBe("2026/27");
		expect(result.forecast.psaStatusNow.allowance).toBe(1_000_00);
	});
});
