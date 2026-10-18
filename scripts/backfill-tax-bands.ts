#!/usr/bin/env node
/**
 * Tax Band History Backfill
 *
 * One-time backfill for the tax_band_history table: creates a single row per
 * user from their legacy users.tax_band enum, effective from the CURRENT tax
 * year (conservative default — users edit their own history afterwards).
 *
 * Idempotent: users who already have history rows are skipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-tax-bands.ts
 */
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema/index.js";
import { taxYearLabelFromDate } from "../src/lib/utils/tax-year-utils.js";
import { setupDb } from "./seed/lib/db.js";

const { db } = setupDb();
const currentTaxYear = taxYearLabelFromDate(new Date());

const allUsers = await db.query.users.findMany({
	columns: { id: true, username: true, taxBand: true },
});

let created = 0;
let skipped = 0;

for (const user of allUsers) {
	const existing = await db.query.taxBandHistory.findFirst({
		where: eq(schema.taxBandHistory.userId, user.id),
		columns: { id: true },
	});

	if (existing) {
		skipped++;
		continue;
	}

	await db.insert(schema.taxBandHistory).values({
		userId: user.id,
		band: user.taxBand,
		fromTaxYear: currentTaxYear,
		toTaxYear: null,
	});
	created++;
	console.log(
		`  ✓ ${user.username}: ${user.taxBand} from ${currentTaxYear} (open-ended)`,
	);
}

console.log(
	`\n✅ Backfill complete — ${created} row(s) created, ${skipped} user(s) already had history`,
);
