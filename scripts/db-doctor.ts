import fs from "node:fs";
import Database from "better-sqlite3";

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

function getDatabasePath(): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

	switch (process.env.APP_ENV) {
		case "development":
			return "storage/dev.db";
		case "test":
			return "storage/test.db";
		case "production":
			return "storage/prod.db";
		default:
			return "storage/database.db";
	}
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

	const sqlite = new Database(dbPath, { readonly: true });
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
