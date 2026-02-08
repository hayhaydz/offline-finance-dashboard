import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
import 'dotenv/config';

// ============================================================================
// ENVIRONMENT DETECTION (Fail Fast - No Default)
// ============================================================================

const appEnv = process.env.APP_ENV;

if (!appEnv) {
	throw new Error(
		'APP_ENV not set. Please set APP_ENV=development or APP_ENV=production in your environment or .env file.'
	);
}

if (appEnv !== 'development' && appEnv !== 'test' && appEnv !== 'production') {
	throw new Error(`Invalid APP_ENV value: ${appEnv}. Must be 'development', 'test', or 'production'.`);
}

// ============================================================================
// DATABASE PATH SWITCHING (Environment-Specific)
// ============================================================================

const getDatabasePath = (env: string): string => {
	switch (env) {
		case 'development':
			return 'storage/dev.db';
		case 'test':
			return 'storage/test.db';
		case 'production':
			return 'storage/prod.db';
		default:
			return 'storage/database.db';
	}
};

const dbPath = getDatabasePath(appEnv);

// Ensure storage directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
	fs.mkdirSync(dbDir, { recursive: true });
}

// ============================================================================
// DATABASE INITIALIZATION WITH TIERED SECURITY
// ============================================================================

const encryptionKey = process.env.ENCRYPTION_KEY;
const isNewDatabase = !fs.existsSync(dbPath);

// Initialize database
const sqlite = new Database(dbPath);

// Enable foreign keys (always)
sqlite.pragma('foreign_keys = ON');

// ============================================================================
// ENCRYPTION LOGIC (Environment-Aware)
// ============================================================================

if (appEnv === 'production') {
	// ========================================================================
	// PRODUCTION MODE: Strict Security Requirements
	// ========================================================================

	if (!encryptionKey) {
		sqlite.close();
		throw new Error(
			'CRITICAL: ENCRYPTION_KEY not set in production environment. Database encryption is required for production. Aborting startup.'
		);
	}

	// Apply encryption pragmas (MUST be first operations on database)
	sqlite.pragma('key = "' + encryptionKey + '"');
	sqlite.pragma('cipher_page_size = 4096');
	sqlite.pragma('cipher_memory_security = ON');
	console.log('[PROD] Database encryption ENABLED (AES-256-CBC)');

	// Startup security checks (only for existing databases)
	if (!isNewDatabase) {
		try {
			// Check if system_metadata table exists
			const tableExists = sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='system_metadata'"
				)
				.get();

			if (tableExists) {
				// Verify encryption status
				const encryptionStatus = sqlite
					.prepare('SELECT value FROM system_metadata WHERE key = ?')
					.get('encryption_status') as { value: string } | undefined;

				if (encryptionStatus && encryptionStatus.value === 'none') {
					sqlite.close();
					throw new Error(
						'CRITICAL: Production database has no encryption! Refusing to start for security reasons.'
					);
				}

				// Scan for PLAIN: prefixed data (security check)
				const plainDataCheck = sqlite
					.prepare("SELECT COUNT(*) as count FROM users WHERE totp_secret LIKE 'PLAIN:%'")
					.get() as { count: number };

				if (plainDataCheck.count > 0) {
					sqlite.close();
					throw new Error(
						`CRITICAL: Found ${plainDataCheck.count} user(s) with unencrypted TOTP secrets (PLAIN: prefix) in production database. Refusing to start for security reasons.`
					);
				}
			}
		} catch (error: any) {
			if (error.message.includes('CRITICAL:')) {
				throw error;
			}
			// Log other errors but continue (might be new database without migrations)
			console.warn('[PROD] Warning during startup security check:', error.message);
		}
	}

	// Initialize system_metadata for new databases
	if (isNewDatabase) {
		try {
			sqlite
				.prepare('INSERT INTO system_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)')
				.run(
					'encryption_status',
					'sqlcipher',
					'created_at',
					new Date().toISOString(),
					'created_in_env',
					'production'
				);
			console.log('[PROD] System metadata initialized for production database');
		} catch (error) {
			// Table might not exist yet (migrations not run), that's okay
			console.log('[PROD] Note: system_metadata table will be created by migrations');
		}
	}
} else {
	// ========================================================================
	// DEVELOPMENT MODE: Loose Encryption Requirements
	// ========================================================================

	if (encryptionKey) {
		// Key available: apply encryption
		sqlite.pragma('key = "' + encryptionKey + '"');
		sqlite.pragma('cipher_page_size = 4096');
		sqlite.pragma('cipher_memory_security = ON');
		console.log('[DEV] Database encryption ENABLED (Dev Key)');
	} else {
		// No key: loose mode (plaintext with PLAIN: prefix)
		console.log('[DEV] WARNING: Database encryption DISABLED (Loose Mode)');
		console.log('[DEV] Data will be stored with PLAIN: prefix for easy development');
		console.log('[DEV] DO NOT use this database in production!');
	}

	// Initialize system_metadata for new databases
	if (isNewDatabase) {
		try {
			const encryptionStatus = encryptionKey ? 'sqlcipher' : 'none';
			sqlite
				.prepare('INSERT INTO system_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)')
				.run(
					'encryption_status',
					encryptionStatus,
					'created_at',
					new Date().toISOString(),
					'created_in_env',
					appEnv
				);
			console.log(`[${appEnv.toUpperCase()}] System metadata initialized (${encryptionStatus})`);
		} catch (error) {
			// Table might not exist yet (migrations not run), that's okay
			console.log(`[${appEnv.toUpperCase()}] Note: system_metadata table will be created by migrations`);
		}
	}
}

// ============================================================================
// EXPORT DRIZZLE CLIENT
// ============================================================================

export const db = drizzle(sqlite, { schema });
