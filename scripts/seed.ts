#!/usr/bin/env node
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
import { seedStandard } from "./seed/modes/standard.js";
import { seedEdge } from "./seed/modes/edge.js";
import { seedStress } from "./seed/modes/stress.js";

const mode =
	process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ??
	"standard";
const { db } = setupDb();
const userId = await ensureAdminUser(db);

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
