import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrationPreflight } from "../../scripts/migration-preflight";

const tempDirs: string[] = [];

function makeTempMigrationsDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-preflight-"));
	tempDirs.push(dir);
	const migrationsDir = path.join(dir, "migrations");
	fs.mkdirSync(path.join(migrationsDir, "meta"), { recursive: true });
	return migrationsDir;
}

function writeJournal(migrationsDir: string, tags: string[]) {
	const journalPath = path.join(migrationsDir, "meta", "_journal.json");
	fs.writeFileSync(
		journalPath,
		JSON.stringify(
			{
				version: "7",
				dialect: "sqlite",
				entries: tags.map((tag, idx) => ({
					idx,
					version: "6",
					when: 1 + idx,
					tag,
					breakpoints: true,
				})),
			},
			null,
			2,
		),
		"utf8",
	);
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		if (fs.existsSync(dir)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}
});

describe("migration-preflight", () => {
	it("passes when journal and SQL files are consistent", () => {
		const migrationsDir = makeTempMigrationsDir();
		writeJournal(migrationsDir, ["0000_initial"]);
		fs.writeFileSync(
			path.join(migrationsDir, "0000_initial.sql"),
			"CREATE TABLE users (id integer primary key);",
			"utf8",
		);

		const report = runMigrationPreflight(migrationsDir);

		expect(report.ok).toBe(true);
		expect(report.issues).toHaveLength(0);
	});

	it("fails when journal references a missing SQL file", () => {
		const migrationsDir = makeTempMigrationsDir();
		writeJournal(migrationsDir, ["0000_initial", "0001_missing"]);
		fs.writeFileSync(
			path.join(migrationsDir, "0000_initial.sql"),
			"CREATE TABLE users (id integer primary key);",
			"utf8",
		);

		const report = runMigrationPreflight(migrationsDir);

		expect(report.ok).toBe(false);
		expect(report.issues.join("\n")).toContain(
			"Journal entry references missing SQL file: 0001_missing.sql",
		);
	});

	it("fails on duplicate ADD COLUMN intent across migrations", () => {
		const migrationsDir = makeTempMigrationsDir();
		writeJournal(migrationsDir, ["0000_initial", "0001_add_name", "0002_add_name_again"]);
		fs.writeFileSync(
			path.join(migrationsDir, "0000_initial.sql"),
			"CREATE TABLE users (id integer primary key);",
			"utf8",
		);
		fs.writeFileSync(
			path.join(migrationsDir, "0001_add_name.sql"),
			"ALTER TABLE users ADD COLUMN full_name text;",
			"utf8",
		);
		fs.writeFileSync(
			path.join(migrationsDir, "0002_add_name_again.sql"),
			"ALTER TABLE `users` ADD `full_name` text;",
			"utf8",
		);

		const report = runMigrationPreflight(migrationsDir);

		expect(report.ok).toBe(false);
		expect(report.issues.join("\n")).toContain(
			"Duplicate ADD COLUMN detected for users.full_name",
		);
	});
});
