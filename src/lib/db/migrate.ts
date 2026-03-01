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

		await ensureGoalAllocationTrigger(db);
		await ensureClosedAccountTriggers(db);

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

/**
 * Creates a DB-level trigger that prevents inserts into goal_allocations
 * when the referenced goal has been archived (deleted_at is set).
 */
async function ensureGoalAllocationTrigger(db = defaultDb) {
	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS prevent_allocation_on_archived_goal
		BEFORE INSERT ON goal_allocations
		BEGIN
			SELECT RAISE(ABORT, 'Cannot allocate to an archived goal')
			WHERE (SELECT deleted_at FROM goals WHERE id = NEW.goal_id) IS NOT NULL;
		END
	`);
}

/**
 * Creates DB-level triggers that prevent inserting or updating balance entries
 * on a closed account, and prevent editing a closed account's own fields.
 */
async function ensureClosedAccountTriggers(db = defaultDb) {
	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS prevent_balance_insert_on_closed_account
		BEFORE INSERT ON account_balances
		BEGIN
			SELECT RAISE(ABORT, 'Cannot add balance to a closed account')
			WHERE (SELECT closed_at FROM accounts WHERE id = NEW.account_id) IS NOT NULL;
		END
	`);

	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS prevent_balance_update_on_closed_account
		BEFORE UPDATE ON account_balances
		BEGIN
			SELECT RAISE(ABORT, 'Cannot edit balance of a closed account')
			WHERE (SELECT closed_at FROM accounts WHERE id = NEW.account_id) IS NOT NULL;
		END
	`);

	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS prevent_edit_closed_account
		BEFORE UPDATE ON accounts
		WHEN OLD.closed_at IS NOT NULL AND NEW.closed_at IS NOT NULL
		BEGIN
			SELECT RAISE(ABORT, 'Cannot edit a closed account');
		END
	`);
}
