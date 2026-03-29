#!/usr/bin/env node
/**
 * Dev Database Reset Script
 *
 * Wipes the dev database, applies all tracked migrations, and re-seeds.
 * ONLY for development — never run against production.
 *
 * Usage:
 *   npm run db:reset                     # wipe + migrate + seed:standard
 *   npm run db:reset -- --mode=edge      # wipe + migrate + seed:edge
 *   npm run db:reset -- --mode=stress    # wipe + migrate + seed:stress
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const appEnv = process.env.APP_ENV ?? "development";

if (appEnv === "production") {
	console.error("❌ db:reset cannot run in production. Aborting.");
	process.exit(1);
}

const DB_PATH = appEnv === "test" ? "storage/test.db" : "storage/dev.db";

const mode =
	process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ??
	"standard";

const validModes = ["standard", "edge", "stress"];
if (!validModes.includes(mode)) {
	console.error(`❌ Unknown mode: "${mode}". Use standard | edge | stress`);
	process.exit(1);
}

// 1. Wipe
if (existsSync(DB_PATH)) {
	unlinkSync(DB_PATH);
	console.log(`✓ Wiped ${DB_PATH}`);
} else {
	console.log(`ℹ  No database found at ${DB_PATH}, skipping wipe`);
}

const env = { ...process.env, APP_ENV: appEnv };

// 2. Apply all tracked migrations
console.log("⟳  Applying migrations...");
execSync("npm run db:migrate", { stdio: "inherit", env });

// 3. Seed
console.log(`⟳  Seeding (mode: ${mode})...`);
execSync(`npm run seed:${mode}`, { stdio: "inherit", env });

console.log("✓ Reset complete");
