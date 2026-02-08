#!/usr/bin/env node
/**
 * Slug Migration Script for Existing Database Records
 * Usage: npm run migrate:slugs
 *
 * Generates unique nanoid slugs for existing accounts and accountBalances
 * that don't have them yet. Handles collision detection and is idempotent.
 */
import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/lib/db/schema.js';
import { eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { devLog, logError } from '../src/lib/utils/logger.js';
import fs from 'fs';

// 1. Environment & Path Setup
const appEnv = process.env.APP_ENV || 'development';
const dbPath = appEnv === 'test' ? 'storage/test.db' : 'storage/dev.db';

if (appEnv === 'production') {
	console.error('❌ ERROR: Slug migration should NOT be run in production without a backup!');
	process.exit(1);
}

// 2. Database Connection
if (!fs.existsSync(dbPath)) {
	console.error(`❌ Database not found: ${dbPath}`);
	console.error('Run migrations first: npm run db:push');
	process.exit(1);
}

const sqlite = new Database(dbPath);
const encryptionKey = process.env.ENCRYPTION_KEY;

// Handle encryption if needed
if (encryptionKey) {
	try {
		sqlite.pragma(`key = '${encryptionKey}'`);
		sqlite.pragma('cipher_page_size = 4096');
		sqlite.pragma('cipher_memory_security = ON');
		sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
		devLog('migrate-slugs', 'Database opened with encryption');
	} catch (e) {
		if (appEnv === 'development') {
			console.log('⚠️  Encryption key rejected. Attempting plain text mode...');
			sqlite.close();
			const plainSqlite = new Database(dbPath);
			plainSqlite.prepare('SELECT count(*) FROM sqlite_master').get();
			console.error("❌ Mismatch: Your DB is plain text, but you provided an ENCRYPTION_KEY.");
			console.error("   Solution: Remove ENCRYPTION_KEY from .env for this run.");
			process.exit(1);
		} else {
			throw e;
		}
	}
} else {
	devLog('migrate-slugs', 'Database opened in plain text mode');
}

const db = drizzle(sqlite, { schema });

/**
 * Generate a unique slug with collision detection
 * @param existingSlugs Set of existing slugs to check against
 * @returns A unique slug
 */
function generateUniqueSlug(existingSlugs: Set<string>): string {
	let slug: string;
	let attempts = 0;
	const maxAttempts = 100;

	do {
		slug = nanoid(16);
		attempts++;

		if (attempts >= maxAttempts) {
			throw new Error('Failed to generate unique slug after 100 attempts');
		}
	} while (existingSlugs.has(slug));

	return slug;
}

async function migrateAccountSlugs() {
	devLog('migrate-slugs', 'Starting account slug migration...');

	// Fetch all accounts without slugs (NULL values) using raw SQL
	const accountsWithoutSlugs = await db
		.select({
			id: schema.accounts.id,
			slug: schema.accounts.slug
		})
		.from(schema.accounts)
		.where(isNull(schema.accounts.slug));

	devLog('migrate-slugs', `Found ${accountsWithoutSlugs.length} accounts without slugs`);

	if (accountsWithoutSlugs.length === 0) {
		console.log('✅ All accounts already have slugs');
		return;
	}

	// Get existing slugs for collision detection
	const allAccounts = await db.query.accounts.findMany();
	const existingSlugs = new Set(
		allAccounts.map((a) => a.slug).filter((s): s is string => s !== null)
	);

	let migrated = 0;

	for (const account of accountsWithoutSlugs) {
		try {
			const slug = generateUniqueSlug(existingSlugs);

			await db
				.update(schema.accounts)
				.set({ slug })
				.where(eq(schema.accounts.id, account.id));

			existingSlugs.add(slug);
			migrated++;

			devLog('migrate-slugs', `Migrated account ID ${account.id} -> slug: ${slug}`);
		} catch (error) {
			logError('migrate-slugs', `Failed to migrate account ID ${account.id}`, error);
		}
	}

	console.log(`✅ Migrated ${migrated} account(s) to slug-based URLs`);
}

async function migrateBalanceSlugs() {
	devLog('migrate-slugs', 'Starting balance slug migration...');

	// Fetch all balances without slugs (NULL values) using raw SQL
	const balancesWithoutSlugs = await db
		.select({
			id: schema.accountBalances.id,
			slug: schema.accountBalances.slug
		})
		.from(schema.accountBalances)
		.where(isNull(schema.accountBalances.slug));

	devLog('migrate-slugs', `Found ${balancesWithoutSlugs.length} balances without slugs`);

	if (balancesWithoutSlugs.length === 0) {
		console.log('✅ All balances already have slugs');
		return;
	}

	// Get existing slugs for collision detection
	const allBalances = await db.query.accountBalances.findMany();
	const existingSlugs = new Set(
		allBalances.map((b) => b.slug).filter((s): s is string => s !== null)
	);

	let migrated = 0;

	for (const balance of balancesWithoutSlugs) {
		try {
			const slug = generateUniqueSlug(existingSlugs);

			await db
				.update(schema.accountBalances)
				.set({ slug })
				.where(eq(schema.accountBalances.id, balance.id));

			existingSlugs.add(slug);
			migrated++;

			devLog('migrate-slugs', `Migrated balance ID ${balance.id} -> slug: ${slug}`);
		} catch (error) {
			logError('migrate-slugs', `Failed to migrate balance ID ${balance.id}`, error);
		}
	}

	console.log(`✅ Migrated ${migrated} balance(s) to slug-based URLs`);
}

async function main() {
	console.log(`🔄 Starting slug migration (${appEnv} mode)...`);
	console.log('');

	try {
		await migrateAccountSlugs();
		console.log('');

		await migrateBalanceSlugs();
		console.log('');

		console.log('✅ Slug migration complete!');
	} catch (error) {
		logError('migrate-slugs', 'Migration failed', error);
		process.exit(1);
	} finally {
		sqlite.close();
	}
}

main();
