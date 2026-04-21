import "dotenv/config";
import fs from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDatabasePath } from "../../../src/lib/db/client";
import * as schema from "../../../src/lib/db/schema/index";

const appEnv = process.env.APP_ENV || "development";
const dbPath = getDatabasePath(appEnv);

export function setupDb() {
	if (appEnv === "production") {
		console.error("❌ Seeding is not allowed in production!");
		process.exit(1);
	}

	if (!fs.existsSync(dbPath)) {
		console.error(`❌ Database not found: ${dbPath}`);
		console.error("Run: npm run db:migrate");
		process.exit(1);
	}

	const sqlite = new Database(dbPath);
	const encryptionKey = process.env.ENCRYPTION_KEY;

	if (encryptionKey) {
		try {
			sqlite.pragma(`key = '${encryptionKey}'`);
			sqlite.pragma("cipher_page_size = 4096");
			sqlite.pragma("cipher_memory_security = ON");
			sqlite.prepare("SELECT count(*) FROM sqlite_master").get();
			console.log("🔓 Database opened with encryption.");
		} catch (e) {
			if (appEnv === "development") {
				console.error(
					"❌ Encryption key rejected. Remove ENCRYPTION_KEY from .env for plain-text dev DB.",
				);
				process.exit(1);
			}
			throw e;
		}
	} else {
		console.log("📂 Database opened in plain text mode.");
	}

	const db = drizzle(sqlite, { schema });

	// Apply DB-level triggers (idempotent)
	sqlite.exec(`
		CREATE TRIGGER IF NOT EXISTS prevent_allocation_on_archived_goal
		BEFORE INSERT ON goal_allocations
		BEGIN
			SELECT RAISE(ABORT, 'Cannot allocate to an archived goal')
			WHERE (SELECT deleted_at FROM goals WHERE id = NEW.goal_id) IS NOT NULL;
		END
	`);

	sqlite.exec(`
		CREATE TRIGGER IF NOT EXISTS prevent_transaction_insert_on_closed_account
		BEFORE INSERT ON account_transactions
		BEGIN
			SELECT RAISE(ABORT, 'Cannot add transaction to a closed account')
			WHERE (SELECT closed_at FROM accounts WHERE id = NEW.account_id) IS NOT NULL;
		END
	`);

	sqlite.exec(`
		CREATE TRIGGER IF NOT EXISTS prevent_edit_closed_account
		BEFORE UPDATE ON accounts
		WHEN OLD.closed_at IS NOT NULL AND NEW.closed_at IS NOT NULL
		BEGIN
			SELECT RAISE(ABORT, 'Cannot edit a closed account');
		END
	`);

	return { db, appEnv };
}

export type DB = ReturnType<typeof setupDb>["db"];
