#!/usr/bin/env node
/**
 * Database Seeding Script for Development
 *
 * Creates an admin user with test data for development purposes.
 * Usage: node --loader ts-node/esm scripts/seed.ts
 */

import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/lib/db/schema.js';
import { hashPassword } from '../src/lib/auth/password.js';
import { generateTOTPSecret, encryptTOTPSecret } from '../src/lib/auth/mfa.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Check environment
const appEnv = process.env.APP_ENV;

if (appEnv === 'production') {
	console.error('❌ ERROR: Seeding should NOT be run in production!');
	console.error('This script creates test data with weak credentials.');
	process.exit(1);
}

// Get database path based on environment
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

const dbPath = getDatabasePath(appEnv || 'development');

// Check if database exists
if (!fs.existsSync(dbPath)) {
	console.error(`❌ Database not found: ${dbPath}`);
	console.error('Run database migrations first: npm run db:push');
	process.exit(1);
}

// Initialize database connection
const sqlite = new Database(dbPath);

// Apply encryption if key exists
const encryptionKey = process.env.ENCRYPTION_KEY;
if (encryptionKey) {
	sqlite.pragma('key = "' + encryptionKey + '"');
	sqlite.pragma('cipher_page_size = 4096');
	sqlite.pragma('cipher_memory_security = ON');
}

const db = drizzle(sqlite, { schema });

async function main() {
	console.log(`🌱 Seeding development database (${appEnv} mode)\n`);

	// Check if admin user already exists
	const existingAdmin = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.username, 'admin')
	});

	if (existingAdmin) {
		console.log('⚠️  Admin user already exists. Skipping seed.');
		console.log('   To recreate: DELETE FROM users WHERE username = "admin";');
		process.exit(0);
	}

	// Generate TOTP secret
	const totpSecret = generateTOTPSecret();
	const systemKey = process.env.ENCRYPTION_KEY;
	const encryptionResult = encryptTOTPSecret(totpSecret, systemKey);

	// Generate password salt
	const passwordSalt = crypto.randomBytes(16).toString('hex');

	// Hash password (password: "password")
	const passwordHash = await hashPassword('password');

	// Create admin user
	const newUser = await db
		.insert(users)
		.values({
			username: 'admin',
			passwordHash,
			totpSecret: encryptionResult.encrypted,
			totpSecretIV: encryptionResult.iv,
			passwordSalt,
			createdAt: new Date()
		})
		.returning();

	const userId = newUser[0].id;
	console.log('✅ Created admin user');
	console.log('   Username: admin');
	console.log('   Password: password');
	console.log(`   TOTP Secret: ${totpSecret}`);
	console.log(`   TOTP URL: otpauth://totp/Offline%20Finance%20Dashboard:admin?secret=${totpSecret}&issuer=Offline%20Finance%20Dashboard`);

	// Mark MFA as verified (simulate completed setup)
	// In real flow, this would be set after MFA setup page
	console.log(`   User ID: ${userId}`);

	// Generate backup codes
	const backupCodesValues: typeof backupCodes.$inferInsert[] = [];
	const plainBackupCodes = [];

	for (let i = 0; i < 10; i++) {
		const code = crypto.randomBytes(4).toString('hex').toUpperCase();
		plainBackupCodes.push(code);
		const hashedCode = await hashPassword(code);

		backupCodesValues.push({
			userId,
			code: hashedCode,
			used: false,
			createdAt: new Date()
		});
	}

	await db.insert(backupCodes).values(backupCodesValues);
	console.log('✅ Generated 10 backup codes:');
	for (let i = 0; i < 10; i++) {
		console.log(`   ${plainBackupCodes[i]}`);
	}

	// Create a session for auto-login (development convenience)
	const sessionToken = crypto.randomBytes(16).toString('hex');
	await db.insert(sessions).values({
		token: sessionToken,
		userId,
		createdAt: new Date(),
		lastActivity: new Date()
	});
	console.log(`\n✅ Created session for auto-login`);
	console.log(`   Session token: ${sessionToken}`);

	console.log('\n✅ Development database seeded successfully!');
	console.log('\n📝 Notes:');
	console.log('   - Use the TOTP secret above with your authenticator app');
	console.log('   - Or use one of the backup codes for login');
	console.log('   - This data should NEVER be used in production!');
}

main().catch((error) => {
	console.error('❌ Error seeding database:', error);
	process.exit(1);
});
