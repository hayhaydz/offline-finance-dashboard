import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
import 'dotenv/config';

const dbPath = process.env.DATABASE_URL || 'storage/database.db';
const encryptionKey = process.env.ENCRYPTION_KEY;

// Ensure storage directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
	fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const sqlite = new Database(dbPath);

// Warn if encryption key not configured
if (!encryptionKey) {
	console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Database will NOT be encrypted at rest.');
	console.warn('⚠️  Set ENCRYPTION_KEY in .env to enable database encryption.');
} else {
	// Apply encryption pragmas (MUST be first operations on database)
	// Note: SQLCipher default is aes-256-cbc, no need to specify cipher explicitly
	sqlite.pragma('key = "' + encryptionKey + '"');
	sqlite.pragma('cipher_page_size = 4096');
	sqlite.pragma('cipher_memory_security = ON');
	console.log('✅ Database encryption enabled with AES-256-CBC');
}

// Enable foreign keys
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
