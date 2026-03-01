import { eq } from 'drizzle-orm';
import * as schema from '../../../src/lib/db/schema.js';
import { loadFixture, slug, daysAgo, formatGBP } from '../lib/helpers.js';
import { wipeUserData } from '../lib/wipe.js';
import { createSnapshot } from '../lib/snapshot.js';
import type { DB } from '../lib/db.js';

interface BalanceEntry {
	balanceInCents: number;
	daysAgo: number;
	notes: string | null;
}

interface AccountFixture {
	name: string;
	institution: string | null;
	type: (typeof schema.accounts.$inferInsert)['type'];
	taxWrapper: (typeof schema.accounts.$inferInsert)['taxWrapper'];
	category: 'asset' | 'liability';
	liquidity: (typeof schema.accounts.$inferInsert)['liquidity'];
	excludedFromNetWorth: boolean;
	closedAt: string | null;
	balances: BalanceEntry[];
}

interface GoalFixture {
	name: string;
	targetAmountInCents: number;
	isEmergencyFund: boolean;
	targetDate: string | null;
	deletedAt: string | null;
	allocations: Array<{
		accountName: string | null;
		amount: number;
		type: string;
	}>;
}

interface SnapshotFixture {
	date: string;
	multiplier: number;
	notes: string | null;
}

export async function seedStandard(db: DB, userId: number): Promise<void> {
	console.log('\n🌱 [standard] Starting seed...');
	await wipeUserData(db, userId);

	const accounts = loadFixture<AccountFixture[]>('standard/accounts.json');
	const goals = loadFixture<GoalFixture[]>('standard/goals.json');
	const snapshots = loadFixture<SnapshotFixture[]>('standard/snapshots.json');

	// --- Accounts ---
	console.log('\n📊 Creating accounts...');
	const accountByName = new Map<string, (typeof schema.accounts.$inferSelect)>();

	for (const a of accounts) {
		const now = new Date();
		const [account] = await db
			.insert(schema.accounts)
			.values({
				slug: slug(),
				userId,
				name: a.name,
				institution: a.institution,
				type: a.type,
				taxWrapper: a.taxWrapper,
				category: a.category,
				liquidity: a.liquidity,
				excludedFromNetWorth: a.excludedFromNetWorth,
				closedAt: a.closedAt ? new Date(a.closedAt) : null,
				createdAt: now,
				updatedAt: now
			})
			.returning();

		for (const b of a.balances) {
			await db.insert(schema.accountBalances).values({
				slug: slug(),
				accountId: account.id,
				balanceInCents: b.balanceInCents,
				asOfDate: daysAgo(b.daysAgo),
				notes: b.notes,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		accountByName.set(a.name, account);
		console.log(`  ✓ ${a.name} (${a.institution ?? '-'})`);
	}

	// --- Goals ---
	console.log('\n🎯 Creating goals...');

	for (let i = 0; i < goals.length; i++) {
		const g = goals[i];
		const [goal] = await db
			.insert(schema.goals)
			.values({
				slug: slug(),
				userId,
				name: g.name,
				targetAmountInCents: g.targetAmountInCents,
				currentAllocation: 0,
				targetDate: g.targetDate ? new Date(g.targetDate) : null,
				isEmergencyFund: g.isEmergencyFund,
				sortOrder: i,
				deletedAt: g.deletedAt ? new Date(g.deletedAt) : null,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning();

		let total = 0;
		for (const alloc of g.allocations) {
			const account = alloc.accountName ? accountByName.get(alloc.accountName) : null;
			const now = new Date();
			await db.insert(schema.goalAllocations).values({
				goalId: goal.id,
				accountId: account?.id ?? null,
				amount: alloc.amount,
				type: alloc.type,
				allocationDate: now,
				createdAt: now
			});
			total += alloc.amount;
		}

		await db.update(schema.goals).set({ currentAllocation: total }).where(eq(schema.goals.id, goal.id));

		const pct = Math.round((total / g.targetAmountInCents) * 100);
		console.log(`  ✓ ${g.name} (${pct}%)`);
	}

	// --- Snapshots ---
	console.log('\n📸 Creating snapshots...');

	for (const snap of snapshots) {
		await createSnapshot(db, userId, snap.date, snap.multiplier, snap.notes);
		console.log(`  ✓ ${snap.date}`);
	}

	const netWorth = formatGBP(
		accounts
			.flatMap((a) => a.balances.filter((b) => b.daysAgo === 0).map((b) => b.balanceInCents))
			.reduce((s, c) => s + c, 0)
	);

	console.log('\n✅ [standard] Seed complete!');
	console.log(`   ${accounts.length} accounts | ${goals.length} goals | ${snapshots.length} snapshots`);
	console.log(`   Net worth (latest balances): ${netWorth}`);
}
