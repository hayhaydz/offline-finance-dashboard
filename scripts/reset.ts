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
 *   npm run db:reset -- --scratch        # reset storage/dev-plain.db to standard seed
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

const appEnv = process.env.APP_ENV ?? "development";

if (appEnv === "production") {
	console.error("❌ db:reset cannot run in production. Aborting.");
	process.exit(1);
}

const SCRATCH_DB_PATH = "storage/dev-plain.db";
const scratchMode = process.argv.includes("--scratch");

if (scratchMode) {
	// Scratch mode: reproducible plain dev DB only. Abort on anything that
	// smells like encrypted mode or a live/prod configured path.
	if (process.env.ENCRYPTION_KEY) {
		console.error(
			"❌ --scratch refuses to run with ENCRYPTION_KEY set (encrypted mode).",
		);
		console.error(
			"   Scratch sessions use the plain dev DB. Unset ENCRYPTION_KEY and retry.",
		);
		process.exit(1);
	}
	if (
		process.env.DATABASE_URL &&
		path.resolve(process.env.DATABASE_URL) !== path.resolve(SCRATCH_DB_PATH)
	) {
		console.error(
			`❌ --scratch refuses to run: DATABASE_URL points at ${process.env.DATABASE_URL}`,
		);
		console.error(
			"   (a configured live DB). Scratch always targets storage/dev-plain.db.",
		);
		process.exit(1);
	}
	console.log(
		"🧪 Scratch mode: resetting storage/dev-plain.db to standard seed",
	);
}

// Mirror getDatabasePath logic without importing client.ts (which has side effects)
const DB_PATH = scratchMode
	? SCRATCH_DB_PATH
	: (process.env.DATABASE_URL ??
		(appEnv === "test"
			? "storage/test.db"
			: process.env.ENCRYPTION_KEY
				? "storage/dev-encrypted.db"
				: "storage/dev-plain.db"));

const modeArg = process.argv.find((a) => a.startsWith("--mode="));
const mode = modeArg?.split("=")[1] ?? null;

const validModes = ["standard", "edge", "stress"];
if (mode && !validModes.includes(mode)) {
	console.error(`❌ Unknown mode: "${mode}". Use standard | edge | stress`);
	process.exit(1);
}
if (scratchMode && mode) {
	console.error("❌ --scratch and --mode are mutually exclusive.");
	process.exit(1);
}

// Anonymise-style live-path guard (data-layer-integrity task 6.6): the
// unlink below only ever runs against the known dev/test defaults, or a
// DATABASE_URL path that provably lives inside <repo>/storage/ and is not
// the production file.
const DEFAULT_DB_PATHS = new Set(
	["storage/dev-plain.db", "storage/dev-encrypted.db", "storage/test.db"].map(
		(p) => path.resolve(REPO_ROOT, p),
	),
);

function guardWipePath(dbPath: string): void {
	const resolved = path.resolve(dbPath);
	if (DEFAULT_DB_PATHS.has(resolved)) return;

	const storageDir = path.resolve(REPO_ROOT, "storage");
	const isProd = resolved === path.resolve(REPO_ROOT, "storage/prod.db");
	const insideStorage = resolved.startsWith(`${storageDir}${path.sep}`);
	if (isProd || !insideStorage) {
		console.error(`❌ db:reset refuses to wipe non-default path: ${resolved}`);
		console.error(
			"   Defaults: storage/dev-plain.db | storage/dev-encrypted.db | storage/test.db",
		);
		console.error(
			"   A custom DATABASE_URL target must live inside <repo>/storage/ and never be prod.db.",
		);
		process.exit(1);
	}
}

guardWipePath(DB_PATH);

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

// 3. Seed (only if mode provided, or scratch which always seeds standard)
const seedMode = scratchMode ? "standard" : mode;
if (seedMode) {
	console.log(`⟳  Seeding (mode: ${seedMode})...`);
	execSync(`npm run seed:${seedMode}`, { stdio: "inherit" });
} else {
	console.log("ℹ  No --mode provided, skipping seed (empty database)");
}

console.log(
	scratchMode
		? "✓ Scratch reset complete — storage/dev-plain.db is at standard seed"
		: "✓ Reset complete",
);
