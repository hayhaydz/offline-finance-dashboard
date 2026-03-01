#!/usr/bin/env node
/**
 * Dev Database Reset Script
 *
 * Wipes the dev database and re-seeds it from scratch.
 * ONLY for development — never run against production.
 *
 * Usage:
 *   npm run db:reset                     # wipe + push schema + seed:standard
 *   npm run db:reset -- --mode=edge      # wipe + push schema + seed:edge
 *   npm run db:reset -- --mode=stress    # wipe + push schema + seed:stress
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

// 2. Push schema
console.log("⟳  Pushing schema...");
execSync("npm run db:push", { stdio: "inherit", env });

// 3. Seed
console.log(`⟳  Seeding (mode: ${mode})...`);
execSync(`npm run seed:${mode}`, { stdio: "inherit", env });

console.log("✓ Reset complete");
