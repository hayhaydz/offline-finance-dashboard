import fs from "node:fs";
import path from "node:path";

interface JournalEntry {
	tag: string;
}

interface Journal {
	entries: JournalEntry[];
}

export interface MigrationPreflightReport {
	ok: boolean;
	issues: string[];
	migrationsDir: string;
	journalPath: string;
	sqlFileCount: number;
	journalEntryCount: number;
}

function readJournal(journalPath: string): Journal {
	const raw = fs.readFileSync(journalPath, "utf8");
	return JSON.parse(raw) as Journal;
}

function listSqlFiles(migrationsDir: string): string[] {
	return fs
		.readdirSync(migrationsDir)
		.filter((name) => name.endsWith(".sql"))
		.sort();
}

function normalizeIdentifier(identifier: string): string {
	return identifier.replace(/[`"']/g, "").trim().toLowerCase();
}

function detectDuplicateOperations(
	sqlFiles: string[],
	migrationsDir: string,
	issues: string[],
) {
	const addColumnSeen = new Map<string, string>();
	const createTableSeen = new Map<string, string>();
	const createIndexSeen = new Map<string, string>();

	for (const fileName of sqlFiles) {
		const filePath = path.join(migrationsDir, fileName);
		const sql = fs.readFileSync(filePath, "utf8");

		for (const match of sql.matchAll(
			/ALTER\s+TABLE\s+([`"']?[A-Za-z0-9_]+[`"']?)\s+ADD\s+(?:COLUMN\s+)?([`"']?[A-Za-z0-9_]+[`"']?)/gi,
		)) {
			const table = normalizeIdentifier(match[1] ?? "");
			const column = normalizeIdentifier(match[2] ?? "");
			const key = `${table}.${column}`;
			const firstSeen = addColumnSeen.get(key);
			if (firstSeen) {
				issues.push(
					`Duplicate ADD COLUMN detected for ${key}: ${firstSeen} and ${fileName}`,
				);
			} else {
				addColumnSeen.set(key, fileName);
			}
		}

		for (const match of sql.matchAll(
			/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([`"']?[A-Za-z0-9_]+[`"']?)/gi,
		)) {
			const table = normalizeIdentifier(match[1] ?? "");
			const firstSeen = createTableSeen.get(table);
			if (firstSeen) {
				issues.push(
					`Duplicate CREATE TABLE detected for ${table}: ${firstSeen} and ${fileName}`,
				);
			} else {
				createTableSeen.set(table, fileName);
			}
		}

		for (const match of sql.matchAll(
			/CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([`"']?[A-Za-z0-9_]+[`"']?)/gi,
		)) {
			const index = normalizeIdentifier(match[1] ?? "");
			const firstSeen = createIndexSeen.get(index);
			if (firstSeen) {
				issues.push(
					`Duplicate CREATE INDEX detected for ${index}: ${firstSeen} and ${fileName}`,
				);
			} else {
				createIndexSeen.set(index, fileName);
			}
		}
	}
}

export function runMigrationPreflight(
	migrationsDir = path.resolve("src/lib/db/migrations"),
): MigrationPreflightReport {
	const issues: string[] = [];
	const journalPath = path.join(migrationsDir, "meta", "_journal.json");

	if (!fs.existsSync(migrationsDir)) {
		issues.push(`Migrations directory not found: ${migrationsDir}`);
		return {
			ok: false,
			issues,
			migrationsDir,
			journalPath,
			sqlFileCount: 0,
			journalEntryCount: 0,
		};
	}

	if (!fs.existsSync(journalPath)) {
		issues.push(`Journal file not found: ${journalPath}`);
		return {
			ok: false,
			issues,
			migrationsDir,
			journalPath,
			sqlFileCount: 0,
			journalEntryCount: 0,
		};
	}

	const journal = readJournal(journalPath);
	const sqlFiles = listSqlFiles(migrationsDir);
	const sqlFileSet = new Set(sqlFiles);

	for (const entry of journal.entries) {
		const expectedFile = `${entry.tag}.sql`;
		if (!sqlFileSet.has(expectedFile)) {
			issues.push(
				`Journal entry references missing SQL file: ${expectedFile}`,
			);
		}
	}

	const journalTags = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
	for (const fileName of sqlFiles) {
		if (!journalTags.has(fileName)) {
			issues.push(`SQL file is not referenced by journal: ${fileName}`);
		}
	}

	detectDuplicateOperations(sqlFiles, migrationsDir, issues);

	return {
		ok: issues.length === 0,
		issues,
		migrationsDir,
		journalPath,
		sqlFileCount: sqlFiles.length,
		journalEntryCount: journal.entries.length,
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const migrationsDir = process.argv[2]
		? path.resolve(process.argv[2])
		: path.resolve("src/lib/db/migrations");
	const report = runMigrationPreflight(migrationsDir);

	console.log(`migrations: ${report.migrationsDir}`);
	console.log(`journal: ${report.journalPath}`);
	console.log(`sql files: ${report.sqlFileCount}`);
	console.log(`journal entries: ${report.journalEntryCount}`);

	if (!report.ok) {
		console.error("issues:");
		for (const issue of report.issues) {
			console.error(`- ${issue}`);
		}
		process.exit(1);
	}

	console.log("status: ok");
}
