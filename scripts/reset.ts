#!/usr/bin/env node
/**
 * Dev Database Reset Script
 *
 * Wipes the dev database, applies all tracked migrations, and re-seeds.
 * ONLY for development — never run against production.
 *
 * Usage:
 *   npm run db:reset                     # wipe + migrate (empty database)
 *   npm run db:reset -- --mode=standard  # wipe + migrate + seed:standard
 *   npm run db:reset -- --mode=edge      # wipe + migrate + seed:edge
 *   npm run db:reset -- --mode=stress    # wipe + migrate + seed:stress
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import "dotenv/config";

const appEnv = process.env.APP_ENV ?? "development";

if (appEnv === "production") {
	console.error("❌ db:reset cannot run in production. Aborting.");
	process.exit(1);
}

// Mirror getDatabasePath logic without importing client.ts (which has side effects)
const DB_PATH =
	process.env.DATABASE_URL ??
	(appEnv === "test"
		? "storage/test.db"
		: process.env.ENCRYPTION_KEY
			? "storage/dev-encrypted.db"
			: "storage/dev-plain.db");

const modeArg = process.argv.find((a) => a.startsWith("--mode="));
const mode = modeArg?.split("=")[1] ?? null;

const validModes = ["standard", "edge", "stress"];
if (mode && !validModes.includes(mode)) {
	console.error(`❌ Unknown mode: "${mode}". Use standard | edge | stress`);
	process.exit(1);
}

// 1. Wipe (must happen before importing client.ts which creates the DB file)
if (existsSync(DB_PATH)) {
	unlinkSync(DB_PATH);
	console.log(`✓ Wiped ${DB_PATH}`);
} else {
	console.log(`ℹ  No database found at ${DB_PATH}, skipping wipe`);
}

// 2. Apply all tracked migrations (dynamic import ensures DB is created after wipe)
console.log("⟳  Applying migrations...");
const { runMigrations } = await import("../src/lib/db/migrate");
await runMigrations();

// 3. Seed (only if mode provided)
if (mode) {
	console.log(`⟳  Seeding (mode: ${mode})...`);
	execSync(`npm run seed:${mode}`, { stdio: "inherit" });
} else {
	console.log("ℹ  No --mode provided, skipping seed (empty database)");
}

console.log("✓ Reset complete");
