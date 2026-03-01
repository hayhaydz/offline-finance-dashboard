import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../src/lib/db/schema.js';
import fs from 'fs';

const appEnv = process.env.APP_ENV || 'development';
const dbPath = appEnv === 'test' ? 'storage/test.db' : 'storage/dev.db';

export function setupDb() {
	if (appEnv === 'production') {
		console.error('❌ Seeding is not allowed in production!');
		process.exit(1);
	}

	if (!fs.existsSync(dbPath)) {
		console.error(`❌ Database not found: ${dbPath}`);
		console.error('Run: npm run db:push');
		process.exit(1);
	}

	const sqlite = new Database(dbPath);
	const encryptionKey = process.env.ENCRYPTION_KEY;

	if (encryptionKey) {
		try {
			sqlite.pragma(`key = '${encryptionKey}'`);
			sqlite.pragma('cipher_page_size = 4096');
			sqlite.pragma('cipher_memory_security = ON');
			sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
			console.log('🔓 Database opened with encryption.');
		} catch (e) {
			if (appEnv === 'development') {
				console.error('❌ Encryption key rejected. Remove ENCRYPTION_KEY from .env for plain-text dev DB.');
				process.exit(1);
			}
			throw e;
		}
	} else {
		console.log('📂 Database opened in plain text mode.');
	}

	const db = drizzle(sqlite, { schema });
	return { db, appEnv };
}

export type DB = ReturnType<typeof setupDb>['db'];
