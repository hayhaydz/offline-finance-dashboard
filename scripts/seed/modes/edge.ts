import { eq } from 'drizzle-orm';
import * as schema from '../../../src/lib/db/schema.js';
import { loadFixture, slug, daysAgo, randomBetween } from '../lib/helpers.js';
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
	generateBalances?: { count: number; spanDays: number; baseAmount: number; variance: number };
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
		daysAgo?: number;
	}>;
}

interface SnapshotFixture {
	date: string;
	multiplier: number;
	notes: string | null;
	special?: 'excluded_accounts' | 'empty_goals' | 'force_negative';
}

export async function seedEdge(db: DB, userId: number): Promise<void> {
	console.log('\n🔬 [edge] Starting seed...');
	await wipeUserData(db, userId);

	const accounts = loadFixture<AccountFixture[]>('edge/accounts.json');
	const goals = loadFixture<GoalFixture[]>('edge/goals.json');
	const snapshots = loadFixture<SnapshotFixture[]>('edge/snapshots.json');

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

		// Insert explicit balances
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

		// Generate additional balances if requested
		if (a.generateBalances) {
			const { count, spanDays, baseAmount, variance } = a.generateBalances;
			const stepDays = Math.floor(spanDays / count);
			for (let i = 0; i < count; i++) {
				const offset = spanDays - i * stepDays;
				const amount = baseAmount + randomBetween(-variance, variance);
				await db.insert(schema.accountBalances).values({
					slug: slug(),
					accountId: account.id,
					balanceInCents: amount,
					asOfDate: daysAgo(offset + 1), // +1 to not collide with explicit daysAgo: 0
					notes: null,
					createdAt: new Date(),
					updatedAt: new Date()
				});
			}
		}

		accountByName.set(a.name, account);
		const balanceTotal = a.balances.length + (a.generateBalances?.count ?? 0);
		console.log(
			`  ✓ ${a.name} (${a.institution ?? '-'}) — ${balanceTotal} balance entries` +
				(a.closedAt ? ' [CLOSED]' : '') +
				(a.excludedFromNetWorth ? ' [EXCLUDED]' : '')
		);
	}

	// --- Goals ---
	console.log('\n🎯 Creating goals...');

	for (let i = 0; i < goals.length; i++) {
		const g = goals[i];
		const now = new Date();
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
				deletedAt: null, // set after allocations are inserted
				createdAt: now,
				updatedAt: now
			})
			.returning();

		let total = 0;
		for (const alloc of g.allocations) {
			const account = alloc.accountName ? accountByName.get(alloc.accountName) : null;
			const allocDate = daysAgo(alloc.daysAgo ?? 0);
			await db.insert(schema.goalAllocations).values({
				goalId: goal.id,
				accountId: account?.id ?? null,
				amount: alloc.amount,
				type: alloc.type,
				allocationDate: allocDate,
				createdAt: allocDate
			});
			total += alloc.amount;
		}

		await db
			.update(schema.goals)
			.set({
				currentAllocation: total,
				...(g.deletedAt ? { deletedAt: new Date(g.deletedAt) } : {})
			})
			.where(eq(schema.goals.id, goal.id));

		const isArchived = !!g.deletedAt;
		const pct = g.targetAmountInCents > 0 ? Math.round((total / g.targetAmountInCents) * 100) : 0;
		console.log(
			`  ✓ ${g.name} (${pct}%)` +
				(isArchived ? ' [ARCHIVED]' : '') +
				(g.allocations.length === 20 ? ' [20 allocations]' : '')
		);
	}

	// --- Snapshots ---
	console.log('\n📸 Creating snapshots...');

	// Collect a couple of account slugs to mark as excluded in the special snapshot
	const excludedSlugs: string[] = [];
	for (const [name, account] of accountByName) {
		if (name === 'Pension' || name === 'Crypto Wallet') {
			excludedSlugs.push(account.slug);
		}
	}

	for (const snap of snapshots) {
		const opts: Parameters<typeof createSnapshot>[5] = {};

		if (snap.special === 'excluded_accounts') opts.forceExcludeAccountSlugs = excludedSlugs;
		if (snap.special === 'empty_goals') opts.emptyGoals = true;
		if (snap.special === 'force_negative') opts.forceNegative = true;

		await createSnapshot(db, userId, snap.date, snap.multiplier, snap.notes, opts);
		console.log(`  ✓ ${snap.date}${snap.special ? ` [${snap.special}]` : ''}`);
	}

	const activeGoals = goals.filter((g) => !g.deletedAt).length;
	const archivedGoals = goals.filter((g) => g.deletedAt).length;

	console.log('\n✅ [edge] Seed complete!');
	console.log(
		`   ${accounts.length} accounts | ${activeGoals} active goals + ${archivedGoals} archived | ${snapshots.length} snapshots`
	);
}
