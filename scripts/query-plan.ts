import Database from "better-sqlite3";

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

const dbPath = process.argv[2] || getDatabasePath();
const sqlite = new Database(dbPath, { readonly: true });

const queries = [
	{
		name: "homepage-accounts",
		sql: "SELECT id, type, excluded_from_net_worth, closed_at FROM accounts WHERE user_id = ?",
	},
	{
		name: "goals-list",
		sql: "SELECT id, slug, sort_order FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order LIMIT 10 OFFSET 0",
	},
	{
		name: "latest-balance-by-account",
		sql: "SELECT id, as_of_date FROM account_balances WHERE account_id = ? ORDER BY as_of_date DESC LIMIT 1",
	},
];

try {
	for (const query of queries) {
		const params = query.name === "latest-balance-by-account" ? [1] : [1];
		const plan = sqlite
			.prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
			.all(...params);
		console.log(`\n[${query.name}]`);
		for (const row of plan) {
			console.log(JSON.stringify(row));
		}
	}
} finally {
	sqlite.close();
}
