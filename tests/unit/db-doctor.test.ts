import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { doctorDatabase } from "../../scripts/db-doctor";

const created: string[] = [];

afterEach(() => {
	for (const file of created.splice(0)) {
		if (fs.existsSync(file)) fs.unlinkSync(file);
	}
});

describe("db-doctor", () => {
	it("reports ok for healthy migration metadata", () => {
		const dbFile = path.resolve(`storage/doctor-ok-${Date.now()}.db`);
		created.push(dbFile);
		const db = new Database(dbFile);
		db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)");
		db.exec(
			"CREATE TABLE __drizzle_migrations (id INTEGER, hash TEXT, created_at INTEGER)",
		);
		db.exec(
			"INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (1, 'abc', 123)",
		);
		db.close();

		const report = doctorDatabase(dbFile);
		expect(report.ok).toBe(true);
		expect(report.issues).toHaveLength(0);
	});

	it("reports drift when app tables exist but migration rows are empty", () => {
		const dbFile = path.resolve(`storage/doctor-drift-${Date.now()}.db`);
		created.push(dbFile);
		const db = new Database(dbFile);
		db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)");
		db.exec(
			"CREATE TABLE __drizzle_migrations (id INTEGER, hash TEXT, created_at INTEGER)",
		);
		db.close();

		const report = doctorDatabase(dbFile);
		expect(report.ok).toBe(false);
		expect(report.issues.join("\n")).toContain("migration drift");
	});
});
