import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

// Regression net for the 2026-10-29 production boot crash: the Active-Dev
// direct-SQL path (db:generate → apply SQL) applies schema WITHOUT writing
// the migrator's journal, so the next fresh process (vite preview /
// adapter-node boot) replays the migration and dies on "table already
// exists". This test pins the invariant the migrator needs: every
// migration file's hash is journaled in the development database.
//
// Skips when the dev DB is absent (fresh clone / CI) — the invariant only
// applies to a DB the dev app actually boots against.

const DEV_DB = path.resolve("storage/dev-plain.db");
const MIGRATIONS_DIR = path.resolve("src/lib/db/migrations");

const devDbExists = fs.existsSync(DEV_DB);

describe.skipIf(!devDbExists)("migration journal stays in sync (dev DB)", () => {
	it("journals every migration file's sha256", () => {
		const db = new Database(DEV_DB, { readonly: true });
		try {
			const applied = new Set(
				(
					db
						.prepare("SELECT hash FROM __drizzle_migrations")
						.all() as { hash: string }[]
				).map((r) => r.hash),
			);

			const files = fs
				.readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();

			expect(files.length).toBeGreaterThan(0);
			const unjournaled: string[] = [];
			for (const file of files) {
				const hash = crypto
					.createHash("sha256")
					.update(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
					.digest("hex");
				if (!applied.has(hash)) unjournaled.push(file);
			}

			// If this fails: the schema was applied via the direct-SQL path
			// but the journal never learned about it — complete the journal
			// (INSERT the file's sha256 into __drizzle_migrations) or the
			// next fresh boot will crash replaying it.
			expect(unjournaled).toEqual([]);
		} finally {
			db.close();
		}
	});
});
