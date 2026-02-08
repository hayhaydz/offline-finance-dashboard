#!/usr/bin/env node
/**
 * Database Initialization Script (SQLCipher Encrypted)
 *
 * Creates the database schema using the app's encrypted database client.
 * This ensures proper SQLCipher encryption is applied from the start.
 *
 * Usage: node scripts/init-db.ts
 */

import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.DATABASE_URL || 'storage/database.db';
const encryptionKey = process.env.ENCRYPTION_KEY;

function main() {
	console.log('🔐 Database Initialization (SQLCipher Encrypted)\n');

	// Verify encryption key
	if (!encryptionKey) {
		console.error('❌ ENCRYPTION_KEY not set in .env!');
		console.error('Database encryption is required for this application.');
		process.exit(1);
	}
	console.log('✅ ENCRYPTION_KEY found');

	// Check for existing database
	if (fs.existsSync(dbPath)) {
		const stats = fs.statSync(dbPath);
		console.log(`📁 Existing database: ${dbPath} (${stats.size} bytes)`);
		console.log('');
		console.log('⚠️  Database already exists. To recreate:');
		console.log(`   rm ${dbPath}`);
		console.log('   node scripts/init-db.ts');
		process.exit(0);
	}

	// Ensure storage directory exists
	const dbDir = path.dirname(dbPath);
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true });
	}

	console.log('📁 Creating database: ' + dbPath);

	// Initialize database with encryption
	const sqlite = new Database(dbPath);

	// Apply encryption (MUST be first operations)
	sqlite.pragma('key = "' + encryptionKey + '"');
	sqlite.pragma('cipher_page_size = 4096');
	sqlite.pragma('cipher_memory_security = ON');
	console.log('✅ Encryption enabled (AES-256-CBC)');

	// Enable foreign keys
	sqlite.pragma('foreign_keys = ON');

	console.log('📋 Creating tables...\n');

	try {
		// Create users table
		sqlite.exec(`
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				totp_secret TEXT NOT NULL,
				totp_secret_iv TEXT NOT NULL,
				password_salt TEXT NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
			)
		`);
		console.log('   ✓ users table');

		// Create sessions table
		sqlite.exec(`
			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				token TEXT NOT NULL UNIQUE,
				user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
				last_activity INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
			)
		`);
		console.log('   ✓ sessions table');

		// Create backup_codes table
		sqlite.exec(`
			CREATE TABLE backup_codes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				code TEXT NOT NULL,
				used INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
			)
		`);
		console.log('   ✓ backup_codes table');

		// Create login_attempts table
		sqlite.exec(`
			CREATE TABLE login_attempts (
				username TEXT PRIMARY KEY,
				count INTEGER NOT NULL DEFAULT 0,
				last_attempt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
				locked_until INTEGER
			)
		`);
		console.log('   ✓ login_attempts table');

		// Create indexes
		sqlite.exec('CREATE INDEX idx_sessions_user_id ON sessions(user_id)');
		sqlite.exec('CREATE INDEX idx_sessions_last_activity ON sessions(last_activity)');
		sqlite.exec('CREATE INDEX idx_sessions_token ON sessions(token)');
		sqlite.exec('CREATE INDEX idx_backup_codes_user_id ON backup_codes(user_id)');
		sqlite.exec('CREATE INDEX idx_login_attempts_locked_until ON login_attempts(locked_until)');
		console.log('   ✓ indexes');

		// Verify
		const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
		console.log(`\n📊 Database created with ${tables.length} tables:`);
		tables.forEach((t: any) => console.log(`   - ${t.name}`));

		console.log('\n✅ Database initialized successfully!');
		console.log('\n🔒 Database is encrypted with ENCRYPTION_KEY from .env');

	} catch (error: any) {
		console.error('\n❌ Error creating tables:', error.message);
		// Clean up failed database
		sqlite.close();
		if (fs.existsSync(dbPath)) {
			fs.unlinkSync(dbPath);
			console.log('🧹 Cleaned up incomplete database file');
		}
		process.exit(1);
	} finally {
		sqlite.close();
	}
}

main();
