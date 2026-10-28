#!/usr/bin/env node
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sealKeyring } from "../src/lib/server/crypto/keyring.js";
import { DEFAULT_CATEGORIES } from "../src/lib/utils/category-colours.js";
import * as schema from "../src/lib/db/schema/index.js";
/**
 * Database Seeding Script for Development
 *
 * Usage:
 *   npx tsx scripts/seed.ts                  # default: standard
 *   npx tsx scripts/seed.ts --mode=standard
 *   npx tsx scripts/seed.ts --mode=edge
 *   npx tsx scripts/seed.ts --mode=stress
 */
import { setupDb } from "./seed/lib/db.js";
import { ensureAdminUser } from "./seed/lib/user.js";
import { seedEdge } from "./seed/modes/edge.js";
import { seedStandard } from "./seed/modes/standard.js";
import { seedStress } from "./seed/modes/stress.js";

const mode =
	process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ??
	"standard";
const { db } = setupDb();
const userId = await ensureAdminUser(db);

try {
	switch (mode) {
		case "standard":
			await seedStandard(db, userId);
			break;
		case "edge":
			await seedEdge(db, userId);
			break;
		case "stress":
			await seedStress(db, userId);
			break;
		default:
			console.error(`❌ Unknown mode: "${mode}". Use standard | edge | stress`);
			process.exit(1);
	}
	// #14: starter spending categories for the admin user (wipe removed
	// any previous set). Mirrors ensureDefaultCategories server-side.
	const existingCategories = await db.query.spendingCategories.findMany({
		where: eq(schema.spendingCategories.userId, userId),
		columns: { id: true },
	});
	if (existingCategories.length === 0) {
		for (const cat of DEFAULT_CATEGORIES) {
			await db.insert(schema.spendingCategories).values({
				slug: nanoid(16),
				userId,
				name: cat.name,
				key: cat.key,
				colour: cat.colour,
				isDefault: true,
			});
		}
		console.log(`Seeded ${DEFAULT_CATEGORIES.length} default spending categories`);
	}
} finally {
	// Key hygiene: the seed unlocked the keyring for fixture writes —
	// zeroize the in-memory DataKey before exiting.
	sealKeyring("seed-exit");
}
