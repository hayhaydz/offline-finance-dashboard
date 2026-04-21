import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { devLog, logError } from "$lib/server/logger";
import * as schema from "./schema";

// Load environment variables from .env file
import "dotenv/config";

/**
 * Returns the database file path for the given environment.
 *
 * - development: picks `dev-encrypted.db` when ENCRYPTION_KEY is set, otherwise `dev-plain.db`
 * - test / production: fixed paths
 * - A `customPath` or `DATABASE_URL` env var takes precedence over defaults.
 */
export function getDatabasePath(env: string, customPath?: string): string {
	if (customPath) return customPath;
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

	switch (env) {
		case "development":
			return process.env.ENCRYPTION_KEY
				? "storage/dev-encrypted.db"
				: "storage/dev-plain.db";
		case "test":
			return "storage/test.db";
		case "production":
			return "storage/prod.db";
		default:
			return "storage/database.db";
	}
}

/**
 * Creates a new database instance with proper environment-aware configuration.
 */
export function createDb(customPath?: string) {
	const appEnv = process.env.APP_ENV;

	if (!appEnv) {
		throw new Error(
			"APP_ENV not set. Please set APP_ENV=development or APP_ENV=production in your environment or .env file.",
		);
	}

	const dbPath = getDatabasePath(appEnv, customPath);
	const isTest = appEnv === "test";

	// Ensure storage directory exists
	const dbDir = path.dirname(dbPath);
	if (dbDir && !fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true });
	}

	const encryptionKey = process.env.ENCRYPTION_KEY;
	const isNewDatabase = !fs.existsSync(dbPath);

	// Initialize database
	const sqlite = new Database(dbPath);

	// Enable foreign keys (always)
	sqlite.pragma("foreign_keys = ON");

	// ============================================================================
	// ENCRYPTION LOGIC
	// ============================================================================

	if (appEnv === "production") {
		if (!encryptionKey) {
			sqlite.close();
			throw new Error("CRITICAL: ENCRYPTION_KEY not set in production");
		}

		sqlite.pragma(`key = "${encryptionKey}"`);
		sqlite.pragma("cipher_page_size = 4096");
		sqlite.pragma("cipher_memory_security = ON");
		if (!isTest)
			devLog("database", "Database encryption ENABLED (AES-256-CBC)");

		// Startup security checks (only for existing databases)
		if (!isNewDatabase) {
			try {
				const tableExists = sqlite
					.prepare(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='system_metadata'",
					)
					.get();

				if (tableExists) {
					const encryptionStatus = sqlite
						.prepare("SELECT value FROM system_metadata WHERE key = ?")
						.get("encryption_status") as { value: string } | undefined;

					if (encryptionStatus && encryptionStatus.value === "none") {
						sqlite.close();
						throw new Error("CRITICAL: Production database has no encryption!");
					}

					const plainDataCheck = sqlite
						.prepare(
							"SELECT COUNT(*) as count FROM users WHERE totp_secret LIKE 'PLAIN:%'",
						)
						.get() as { count: number };

					if (plainDataCheck.count > 0) {
						sqlite.close();
						throw new Error(
							`CRITICAL: Found ${plainDataCheck.count} user(s) with unencrypted secrets`,
						);
					}
				}
			} catch (error) {
				if (error instanceof Error && error.message.includes("CRITICAL:"))
					throw error;
				if (!isTest) {
					logError(
						"database",
						"Warning during startup security check",
						error instanceof Error ? error.message : String(error),
					);
				}
			}
		}
	} else {
		// DEVELOPMENT or TEST MODE
		if (encryptionKey) {
			sqlite.pragma(`key = "${encryptionKey}"`);
			sqlite.pragma("cipher_page_size = 4096");
			sqlite.pragma("cipher_memory_security = ON");
			if (!isTest)
				devLog(
					"database",
					`Database encryption ENABLED (${appEnv.toUpperCase()} Dev Key)`,
				);
		} else if (!isTest) {
			devLog(
				"database",
				`WARNING: Database encryption DISABLED (${appEnv.toUpperCase()} Loose Mode)`,
			);
		}
	}

	// Initialize system_metadata for new databases
	if (isNewDatabase) {
		try {
			const encryptionStatus = encryptionKey ? "sqlcipher" : "none";
			sqlite
				.prepare(
					"INSERT INTO system_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)",
				)
				.run(
					"encryption_status",
					encryptionStatus,
					"created_at",
					new Date().toISOString(),
					"created_in_env",
					appEnv,
				);
		} catch (_error) {
			// This is expected if the table doesn't exist yet (migrations not run)
		}
	}

	return drizzle(sqlite, { schema });
}

// Export a default shared instance for the application
export const db = createDb();
