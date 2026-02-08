import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { parseCurrency } from '$lib/utils/currency';
import { devLog } from '$lib/utils/logger';
import { eq, and, gte, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Account } from '$lib/db/schema';

export interface BalanceEntryInput {
	accountId: number;
	balanceStr: string;
	asOfDate: Date;
	notes?: string | null;
}

export interface BalanceEntryResult {
	type: 'success';
	success: string;
	balanceSlug: string;
	balanceInCents: number;
}

export interface BalanceConflictResult {
	type: 'conflict';
	error: string;
	existingBalanceId: number;
	existingBalance: number;
	existingSlug: string;
	proposedBalance: number;
}

export type BalanceEntryResultOrConflict = BalanceEntryResult | BalanceConflictResult;

/**
 * Shared function to add a balance entry to an account.
 * Handles validation, conflict detection, and insertion.
 *
 * @param input - Balance entry data
 * @param account - Account object (for slug and access validation)
 * @returns Result object with success or conflict details
 */
export async function addBalanceEntry(
	input: BalanceEntryInput,
	account: Account
): Promise<BalanceEntryResultOrConflict> {
	const { accountId, balanceStr, asOfDate, notes } = input;

	// Parse balance to cents
	let balanceInCents: number;
	try {
		balanceInCents = parseCurrency(balanceStr);
	} catch (e) {
		devLog('addBalanceEntry', 'parseCurrency validation failed', {
			input: balanceStr,
			accountId,
			error: e instanceof Error ? e.message : String(e)
		});
		throw new Error('Invalid balance format. Enter amount like 123.45 or 123');
	}

	devLog('addBalanceEntry', 'Checking for existing balance entry', {
		accountId,
		asOfDate: asOfDate.toISOString(),
		asOfTimestamp: asOfDate.getTime()
	});

	// Calculate day range for comparison (more reliable than exact Date equality)
	const startOfDay = new Date(asOfDate);
	startOfDay.setUTCHours(0, 0, 0, 0);
	const endOfDay = new Date(startOfDay);
	endOfDay.setUTCHours(23, 59, 59, 999);

	devLog('addBalanceEntry', 'Date range for conflict check', {
		startOfDay: startOfDay.toISOString(),
		startTimestamp: startOfDay.getTime(),
		endOfDay: endOfDay.toISOString(),
		endTimestamp: endOfDay.getTime()
	});

	// Check for existing entry for this account and date (using range query)
	const existing = await db.query.accountBalances.findFirst({
		where: and(
			eq(accountBalances.accountId, accountId),
			gte(accountBalances.asOfDate, startOfDay),
			lt(accountBalances.asOfDate, new Date(endOfDay.getTime() + 1)) // Start of next day
		)
	});

	devLog('addBalanceEntry', 'Existing entry check result', {
		accountId,
		found: !!existing,
		existingId: existing?.id,
		existingSlug: existing?.slug,
		existingAsOfDate: existing?.asOfDate.toISOString(),
		existingTimestamp: existing?.asOfDate.getTime()
	});

	if (existing) {
		devLog('addBalanceEntry', 'Conflict detected - existing entry for date', {
			accountId,
			existingBalanceId: existing.id,
			existingBalanceSlug: existing.slug,
			existingBalance: existing.balanceInCents,
			proposedBalance: balanceInCents,
			asOfDate: asOfDate.toISOString()
		});
		return {
			type: 'conflict',
			error: `A balance entry already exists for ${asOfDate.toISOString().split('T')[0]}. [Edit the existing entry](/accounts/${account.slug}/balances/${existing.slug}/edit) or choose a different date.`,
			existingBalanceId: existing.id,
			existingBalance: existing.balanceInCents,
			existingSlug: existing.slug,
			proposedBalance: balanceInCents
		};
	}

	// Insert new balance entry with slug
	const balanceSlug = nanoid(16);
	await db.insert(accountBalances).values({
		accountId,
		slug: balanceSlug,
		balanceInCents,
		asOfDate,
		notes: notes?.trim() || null
	});

	// Update account's updatedAt timestamp
	await db
		.update(accounts)
		.set({ updatedAt: new Date() })
		.where(eq(accounts.id, accountId));

	devLog('addBalanceEntry', 'Balance entry created successfully', {
		accountId,
		balanceSlug,
		balanceInCents,
		asOfDate: asOfDate.toISOString()
	});

	return {
		type: 'success',
		success: 'Balance entry added',
		balanceSlug,
		balanceInCents
	};
}
