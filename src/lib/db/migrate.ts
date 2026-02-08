import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db as defaultDb } from './client';
import { sql } from 'drizzle-orm';
import { logError } from '$lib/utils/logger';
import path from 'path';

/**
 * Programmatically runs migrations against the provided or default database connection.
 */
export async function runMigrations(db = defaultDb) {
	// console.log('🔄 Running migrations...');

	try {
		const migrationsPath = path.resolve('src/lib/db/migrations');

		await migrate(db, {
			migrationsFolder: migrationsPath
		});

		// console.log('✅ Migrations completed successfully');

		// Ensure system_metadata is initialized if it's empty
		await ensureSystemMetadata(db);
	} catch (error) {
		logError('database', 'Migration failed', error);
		throw error;
	}
}

/**
 * Ensures system_metadata table has basic info.
 */
async function ensureSystemMetadata(db = defaultDb) {
	const appEnv = process.env.APP_ENV || 'development';
	const encryptionKey = process.env.ENCRYPTION_KEY;
	const encryptionStatus = encryptionKey ? 'sqlcipher' : 'none';

	try {
		// Check if empty
		const result = await db.values(sql`SELECT COUNT(*) FROM system_metadata`);
		const count = result[0][0] as number;

		if (count === 0) {
			await db.run(sql`
				INSERT INTO system_metadata (key, value) 
				VALUES 
					('encryption_status', ${encryptionStatus}),
					('created_at', ${new Date().toISOString()}),
					('created_in_env', ${appEnv})
			`);
		}
	} catch (error) {
		// Table might not exist yet
	}
}
