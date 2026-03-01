import { defineConfig } from "drizzle-kit";

// Get database path based on environment
const getDatabasePath = (): string => {
	const appEnv = process.env.APP_ENV;

	switch (appEnv) {
		case "development":
			return "storage/dev.db";
		case "test":
			return "storage/test.db";
		case "production":
			return "storage/prod.db";
		default:
			// Fallback to DATABASE_URL or default
			return process.env.DATABASE_URL || "storage/database.db";
	}
};

export default defineConfig({
	schema: "./src/lib/db/schema.ts",
	out: "./src/lib/db/migrations",
	dialect: "sqlite",
	dbCredentials: {
		url: getDatabasePath(),
	},
});
