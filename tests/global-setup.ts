import fs from "node:fs";
import path from "node:path";

export default async function globalSetup() {
	process.env.APP_ENV = "test";

	const dbPath = path.resolve("storage/test.db");
	if (fs.existsSync(dbPath)) {
		fs.unlinkSync(dbPath);
	}

	const { createDb } = await import("../src/lib/db/client");
	const { runMigrations } = await import("../src/lib/db/migrate");

	const db = createDb(dbPath);
	await runMigrations(db);
}
