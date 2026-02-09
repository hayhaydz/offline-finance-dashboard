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
import { nanoid } from 'nanoid';

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

  // 6. Check if test accounts already exist
  const existingAccounts = await db.query.accounts.findMany({
    where: eq(schema.accounts.userId, userId)
  });
  if (existingAccounts.length > 0) {
    console.log('⚠️  Test accounts already exist. Skipping account creation.');
    console.log('\n✅ Seed complete!');
    process.exit(0);
  }

  // 7. Helper function for date generation
  function generateDate(offsetDays: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - offsetDays);
    date.setHours(0, 0, 0, 0); // UTC midnight
    return date;
  }

  // 8. Create accounts with realistic test data
  console.log('\n📊 Creating test accounts...');

  const accountsToCreate = [
    // Current Accounts
    {
      name: 'Main Current',
      institution: 'HSBC',
      type: 'current' as const,
      taxWrapper: 'none' as const,
      category: 'asset' as const,
      liquidity: 'instant' as const,
      balances: [
        { balanceInCents: 245000, daysAgo: 90, notes: 'Monthly statement' },
        { balanceInCents: 280000, daysAgo: 60, notes: 'Salary credited' },
        { balanceInCents: 310000, daysAgo: 30, notes: 'After bills payment' },
        { balanceInCents: 320000, daysAgo: 0, notes: 'Current balance' }
      ]
    },
    {
      name: 'Bills Current',
      institution: 'Barclays',
      type: 'current' as const,
      taxWrapper: 'none' as const,
      category: 'asset' as const,
      liquidity: 'instant' as const,
      balances: [
        { balanceInCents: 85000, daysAgo: 60, notes: 'Monthly statement' },
        { balanceInCents: 95000, daysAgo: 30, notes: 'After direct debits' },
        { balanceInCents: 110000, daysAgo: 0, notes: 'Current balance' }
      ]
    },
    // Savings Accounts
    {
      name: 'Emergency Fund',
      institution: 'Nationwide',
      type: 'savings' as const,
      taxWrapper: 'none' as const,
      category: 'asset' as const,
      liquidity: 'instant' as const,
      balances: [
        { balanceInCents: 1500000, daysAgo: 365, notes: 'Initial deposit' },
        { balanceInCents: 1650000, daysAgo: 180, notes: 'After contribution' },
        { balanceInCents: 1780000, daysAgo: 90, notes: 'Monthly interest' },
        { balanceInCents: 1850000, daysAgo: 0, notes: 'Current balance' }
      ]
    },
    {
      name: 'ISA Saver',
      institution: 'Santander',
      type: 'savings' as const,
      taxWrapper: 'isa' as const,
      category: 'asset' as const,
      liquidity: 'instant' as const,
      balances: [
        { balanceInCents: 820000, daysAgo: 365, notes: 'ISA opening balance' },
        { balanceInCents: 950000, daysAgo: 270, notes: 'After contribution' },
        { balanceInCents: 1080000, daysAgo: 180, notes: 'Monthly interest' },
        { balanceInCents: 1150000, daysAgo: 90, notes: 'After contribution' },
        { balanceInCents: 1200000, daysAgo: 0, notes: 'Current balance' }
      ]
    },
    // Investment Account
    {
      name: 'Stocks & Shares ISA',
      institution: 'Vanguard',
      type: 'investment' as const,
      taxWrapper: 'isa' as const,
      category: 'asset' as const,
      liquidity: 'delayed' as const,
      balances: [
        { balanceInCents: 2500000, daysAgo: 365, notes: 'Initial investment' },
        { balanceInCents: 2750000, daysAgo: 270, notes: 'Market growth' },
        { balanceInCents: 2900000, daysAgo: 180, notes: 'Dividend reinvested' },
        { balanceInCents: 3050000, daysAgo: 90, notes: 'Market growth' },
        { balanceInCents: 3200000, daysAgo: 0, notes: 'Current valuation' }
      ]
    },
    // Credit Cards (Liabilities)
    {
      name: 'Visa Gold',
      institution: 'HSBC',
      type: 'credit-card' as const,
      taxWrapper: 'none' as const,
      category: 'liability' as const,
      liquidity: null,
      balances: [
        { balanceInCents: -120000, daysAgo: 90, notes: 'Monthly statement' },
        { balanceInCents: -160000, daysAgo: 60, notes: 'After purchases' },
        { balanceInCents: -210000, daysAgo: 30, notes: 'After holiday spending' },
        { balanceInCents: -240000, daysAgo: 0, notes: 'Current balance' }
      ]
    },
    {
      name: 'Mastercard',
      institution: 'Barclays',
      type: 'credit-card' as const,
      taxWrapper: 'none' as const,
      category: 'liability' as const,
      liquidity: null,
      balances: [
        { balanceInCents: -80000, daysAgo: 60, notes: 'Monthly statement' },
        { balanceInCents: -65000, daysAgo: 30, notes: 'After payment' },
        { balanceInCents: -45000, daysAgo: 0, notes: 'Current balance (being paid down)' }
      ]
    },
    // Loan (Liability)
    {
      name: 'Car Loan',
      institution: 'Tesco Bank',
      type: 'loan' as const,
      taxWrapper: 'none' as const,
      category: 'liability' as const,
      liquidity: 'locked' as const,
      balances: [
        { balanceInCents: -1200000, daysAgo: 365, notes: 'Loan start' },
        { balanceInCents: -1180000, daysAgo: 270, notes: 'After payment' },
        { balanceInCents: -1160000, daysAgo: 180, notes: 'After payment' },
        { balanceInCents: -1140000, daysAgo: 90, notes: 'After payment' },
        { balanceInCents: -1120000, daysAgo: 0, notes: 'Current balance (being paid down)' }
      ]
    }
  ];

  // Insert all accounts
  const createdAccounts = [];
  for (const accountData of accountsToCreate) {
    const accountSlug = nanoid(16);
    const now = new Date();
    const created = await db.insert(schema.accounts).values({
      slug: accountSlug,
      userId,
      name: accountData.name,
      institution: accountData.institution,
      type: accountData.type,
      taxWrapper: accountData.taxWrapper,
      category: accountData.category,
      liquidity: accountData.liquidity,
      excludedFromNetWorth: false,
      closedAt: null,
      createdAt: now,
      updatedAt: now
    }).returning();
    createdAccounts.push({ account: created[0], balances: accountData.balances });
    console.log(`  ✓ Created: ${accountData.name} (${accountData.institution})`);
  }

  // Insert all balance entries
  console.log('\n📈 Creating balance history entries...');
  let totalBalanceEntries = 0;
  let totalNetWorth = 0;

  for (const { account, balances } of createdAccounts) {
    for (const balanceData of balances) {
      const balanceSlug = nanoid(16);
      const asOfDate = generateDate(balanceData.daysAgo);
      const now = new Date();
      await db.insert(schema.accountBalances).values({
        slug: balanceSlug,
        accountId: account.id,
        balanceInCents: balanceData.balanceInCents,
        asOfDate,
        notes: balanceData.notes,
        createdAt: now,
        updatedAt: now
      });
      totalBalanceEntries++;

      // Add to net worth calculation (using latest balance only)
      if (balanceData.daysAgo === 0) {
        totalNetWorth += balanceData.balanceInCents;
      }
    }
  }

  // Calculate and display net worth
  const netWorthFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(totalNetWorth / 100);

  console.log(`  ✓ Created ${totalBalanceEntries} balance entries`);
  console.log(`\n📊 Summary:`);
  console.log(`  • Accounts created: ${createdAccounts.length}`);
  console.log(`  • Balance entries: ${totalBalanceEntries}`);
  console.log(`  • Total net worth: ${netWorthFormatted}`);

  console.log('\n✅ Seed complete!');
}

main().catch((error) => {
  console.error('❌ Error seeding database:', error);
  process.exit(1);
});