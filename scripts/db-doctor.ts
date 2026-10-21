import "dotenv/config";
import fs from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";

export interface DoctorReport {
	dbPath: string;
	ok: boolean;
	issues: string[];
	summary: {
		tableCount: number;
		hasMigrationsTable: boolean;
		migrationRowCount: number;
	};
}

export function getDatabasePath(
	appEnv = process.env.APP_ENV ?? "development",
): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

	switch (appEnv) {
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
 * Open a database file with the cipher-capable driver. Applies the file-
 * layer key from ENCRYPTION_KEY when set, and forces a real read so a
 * missing/wrong key fails HERE with SQLite's cipher error instead of
 * silently returning garbage later.
 */
export function openSqliteDatabase(
	dbPath: string,
	opts: { readonly?: boolean } = {},
): Database.Database {
	const sqlite = new Database(dbPath, { readonly: opts.readonly ?? false });
	const key = process.env.ENCRYPTION_KEY;
	if (key) {
		sqlite.pragma(`key = "${key}"`);
		sqlite.pragma("cipher_page_size = 4096");
		sqlite.pragma("cipher_memory_security = ON");
	}
	// Cipher-encrypted files open lazily — probe sqlite_master to surface
	// "file is not a database" while we can still explain the cause.
	sqlite.prepare("SELECT count(*) AS c FROM sqlite_master").get();
	return sqlite;
}

/** Human-readable explanation for cipher-flavoured open failures. */
export function explainOpenFailure(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (
		/file is not a database|file is encrypted|not a database/i.test(message)
	) {
		return process.env.ENCRYPTION_KEY
			? `database is encrypted but rejected ENCRYPTION_KEY (wrong key?) — check the key in .env: ${message}`
			: `database looks encrypted but ENCRYPTION_KEY is not set — add it to .env (or point at the plain dev DB): ${message}`;
	}
	return message;
}

export function doctorDatabase(dbPath: string): DoctorReport {
	const issues: string[] = [];

	if (!fs.existsSync(dbPath)) {
		issues.push(`Database file not found: ${dbPath}`);
		return {
			dbPath,
			ok: false,
			issues,
			summary: {
				tableCount: 0,
				hasMigrationsTable: false,
				migrationRowCount: 0,
			},
		};
	}

	let sqlite: Database.Database;
	try {
		sqlite = openSqliteDatabase(dbPath, { readonly: true });
	} catch (error) {
		return {
			dbPath,
			ok: false,
			issues: [`Cannot open database: ${explainOpenFailure(error)}`],
			summary: {
				tableCount: 0,
				hasMigrationsTable: false,
				migrationRowCount: 0,
			},
		};
	}

	try {
		const tableNames = sqlite
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
			)
			.all()
			.map((row) => (row as { name: string }).name);

		const hasMigrationsTable = tableNames.includes("__drizzle_migrations");
		const migrationRowCount = hasMigrationsTable
			? Number(
					(
						sqlite
							.prepare("SELECT COUNT(*) as count FROM __drizzle_migrations")
							.get() as { count: number }
					).count,
				)
			: 0;

		const hasAppTables = tableNames.some((name) =>
			[
				"users",
				"accounts",
				"account_transactions",
				"goals",
				"sessions",
			].includes(name),
		);

		if (hasAppTables && !hasMigrationsTable) {
			issues.push("Schema exists but __drizzle_migrations table is missing.");
		}

		if (hasAppTables && hasMigrationsTable && migrationRowCount === 0) {
			issues.push(
				"Schema exists but __drizzle_migrations has 0 rows (migration drift).",
			);
		}

		return {
			dbPath,
			ok: issues.length === 0,
			issues,
			summary: {
				tableCount: tableNames.length,
				hasMigrationsTable,
				migrationRowCount,
			},
		};
	} finally {
		sqlite.close();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const dbPath = process.argv[2] || getDatabasePath();
	const report = doctorDatabase(dbPath);

	console.log(`db: ${report.dbPath}`);
	console.log(`tables: ${report.summary.tableCount}`);
	console.log(`__drizzle_migrations: ${report.summary.hasMigrationsTable}`);
	console.log(`migration rows: ${report.summary.migrationRowCount}`);

	if (!report.ok) {
		console.error("issues:");
		for (const issue of report.issues) {
			console.error(`- ${issue}`);
		}
		process.exit(1);
	}

	console.log("status: ok");
}
