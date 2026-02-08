#!/usr/bin/env node
/**
 * Database Seeding Script for Development
 * Usage: npm run db:seed
 */
import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/lib/db/schema.js';
import { hashPassword } from '../src/lib/auth/password.js';
import { generateTOTPSecret, encryptTOTPSecret } from '../src/lib/auth/mfa.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';

// 1. Environment & Path Setup
const appEnv = process.env.APP_ENV || 'development';
const dbPath = appEnv === 'test' ? 'storage/test.db' : 'storage/dev.db';

if (appEnv === 'production') {
  console.error('❌ ERROR: Seeding should NOT be run in production!');
  process.exit(1);
}

// 2. Database Connection (Smart Mode)
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  console.error('Run migrations first: npm run db:push');
  process.exit(1);
}

const sqlite = new Database(dbPath);
const encryptionKey = process.env.ENCRYPTION_KEY;

// Only apply encryption if a key exists AND we are treating it as encrypted
// If you want No Encryption in dev, ensure ENCRYPTION_KEY is unset or ignored here
if (encryptionKey) {
  try {
    sqlite.pragma(`key = '${encryptionKey}'`);
    sqlite.pragma('cipher_page_size = 4096'); 
    sqlite.pragma('cipher_memory_security = ON');
    
    // Test access to see if the key worked
    sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
    console.log('🔓 Database opened with encryption.');
  } catch (e) {
    // If opening failed, maybe it's an unencrypted dev DB?
    if (appEnv === 'development') {
      console.log('⚠️  Encryption key rejected. Attempting to open as plain text (Dev Mode)...');
      // Re-open without key
      sqlite.close();
      const plainSqlite = new Database(dbPath);
      plainSqlite.prepare('SELECT count(*) FROM sqlite_master').get();
      // Replace the sqlite instance reference or restart
      console.log('🔓 Database opened as plain text.');
      // Note: In a real script, you'd handle the variable reassignment better, 
      // but for seeding, ensuring your .env matches your DB state is better.
      console.error("❌ Mismatch: Your DB is plain text, but you provided an ENCRYPTION_KEY.");
      console.error("   Solution: Remove ENCRYPTION_KEY from .env for this run.");
      process.exit(1);
    } else {
      throw e;
    }
  }
} else {
  console.log('📂 Database opened in plain text mode (No Key provided).');
}

const db = drizzle(sqlite, { schema });

async function main() {
  console.log(`🌱 Seeding database (${appEnv} mode)...`);

  // 3. Create Admin User
  const existingAdmin = await db.query.users.findFirst({
    where: eq(schema.users.username, 'admin')
  });

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists. Skipping.');
    process.exit(0);
  }

  // TOTP Logic: Handle "Loose Mode"
  const totpSecret = generateTOTPSecret();
  let secretToStore = totpSecret;
  let ivToStore = '';
  
  if (encryptionKey) {
    // Encrypt the secret if we have a key
    const result = encryptTOTPSecret(totpSecret, encryptionKey);
    secretToStore = result.encrypted;
    ivToStore = result.iv;
  } else {
    // Loose Mode: Store with prefix so we know it's unsafe
    secretToStore = `PLAIN:${totpSecret}`;
    ivToStore = 'PLAIN';
  }

  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = await hashPassword('password');

  const newUser = await db
    .insert(schema.users)
    .values({
      username: 'admin',
      passwordHash,
      totpSecret: secretToStore,
      totpSecretIV: ivToStore,
      passwordSalt,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning();

  const userId = newUser[0].id;
  console.log('✅ Created admin user (admin / password)');

  // 4. Generate Backup Codes
  const backupCodesValues = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodesValues.push({
      userId,
      code: await hashPassword(code),
      used: false,
      createdAt: new Date()
    });
  }
  await db.insert(schema.backupCodes).values(backupCodesValues);

  // 5. Create Session
  await db.insert(schema.sessions).values({
    token: crypto.randomBytes(32).toString('hex'),
    userId,
    lastActivity: new Date(),
    createdAt: new Date()
  });

  console.log('\n✅ Seed complete!');
}

main().catch((error) => {
  console.error('❌ Error seeding database:', error);
  process.exit(1);
});