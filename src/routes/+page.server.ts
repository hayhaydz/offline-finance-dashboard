import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts, goals } from '$lib/db/schema';
import { withUserFilter } from '$lib/auth/row-security';
import { desc, and, inArray, isNull, sql, type SQL, asc } from 'drizzle-orm';
import { devLog, logError } from '$lib/utils/logger';
import { getStaleness } from '$lib/utils/staleness';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog('homePage', 'Unauthenticated access, redirecting to login');
		redirect(302, '/login');
	}

	devLog('homePage', 'Loading net worth data for user', { userId: locals.user.id });

	// Fetch all user accounts with their latest balance
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		with: {
			balances: {
				orderBy: (balances, { desc }) => desc(balances.asOfDate),
				limit: 1
			}
		}
	});

	devLog('homePage', 'Fetched user accounts', { accountCount: userAccounts.length });

	// Fetch goals for homepage preview
	const userGoals = await db.query.goals.findMany({
		where: withUserFilter(locals.user.id, goals),
		orderBy: [desc(goals.isEmergencyFund), asc(goals.sortOrder)],
		with: {
			allocations: {
				columns: {
					accountId: true,
					amount: true
				}
			}
		},
		columns: {
			id: true,
			slug: true,
			name: true,
			targetAmountInCents: true,
			currentAllocation: true,
			targetDate: true,
			isEmergencyFund: true,
			deletedAt: true,
			updatedAt: true
		}
	});

	// Filter out soft-deleted goals
	const activeGoals = userGoals.filter(g => !g.deletedAt);

	devLog('homePage', 'Fetched user goals', { goalCount: activeGoals.length });

	// Calculate net worth totals
	// Filter included accounts: not excluded AND not closed
	const includedAccounts = userAccounts.filter(
		(a) => !a.excludedFromNetWorth && !a.closedAt
	);

	// Filter excluded accounts: excluded AND not closed
	const excludedAccounts = userAccounts.filter(
		(a) => a.excludedFromNetWorth && !a.closedAt
	);

	// Calculate totals from included accounts
	// If an asset account has a negative balance it is effectively a liability,
	// so we split each asset balance on sign: positive → assets, negative → liabilities.
	// Liability account balances are always negative (debt) and go straight to totalLiabilities.
	let totalAssets = 0;
	let totalLiabilities = 0;
	for (const a of includedAccounts) {
		const balance = a.balances[0]?.balanceInCents ?? 0;
		if (a.category === 'asset') {
			if (balance >= 0) {
				totalAssets += balance;
			} else {
				totalLiabilities += balance; // negative, so adds to debt
			}
		} else {
			totalLiabilities += balance;
		}
	}

	// Calculate excluded amounts (same sign-split logic for consistency)
	let excludedAssets = 0;
	let excludedLiabilities = 0;
	for (const a of excludedAccounts) {
		const balance = a.balances[0]?.balanceInCents ?? 0;
		if (a.category === 'asset') {
			if (balance >= 0) {
				excludedAssets += balance;
			} else {
				excludedLiabilities += balance;
			}
		} else {
			excludedLiabilities += balance;
		}
	}

	// Net worth = assets + liabilities (liabilities stored as negative values)
	const netWorth = totalAssets + totalLiabilities;

	// Determine date range: find oldest and newest asOfDate across all balances
	const allBalances = userAccounts.flatMap((a) => a.balances);
	let oldestDate = new Date();
	let newestDate = new Date();

	if (allBalances.length > 0) {
		const dates = allBalances.map((b) => b.asOfDate.getTime());
		oldestDate = new Date(Math.min(...dates));
		newestDate = new Date(Math.max(...dates));
	}

	devLog('homePage', 'Calculated date range', {
		oldest: oldestDate.toISOString(),
		newest: newestDate.toISOString()
	});

	// Check for stale data (30+ days old)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

	const staleAccounts = includedAccounts.filter((a) => {
		const latestBalance = a.balances[0];
		return latestBalance && latestBalance.asOfDate < thirtyDaysAgo;
	});

	const hasStaleData = staleAccounts.length > 0;

	if (hasStaleData) {
		devLog('homePage', 'Found stale accounts', { staleCount: staleAccounts.length });
	}

	// Count excluded TYPES (not individual accounts)
	// A type is "excluded" only when ALL open accounts of that type are excluded
	// (matches the modal's all-or-nothing toggle logic; closed accounts are ignored)
	const openAccounts = userAccounts.filter((a) => !a.closedAt);
	const typeMap = new Map<string, { total: number; excluded: number }>();
	for (const a of openAccounts) {
		const entry = typeMap.get(a.type) ?? { total: 0, excluded: 0 };
		entry.total++;
		if (a.excludedFromNetWorth) entry.excluded++;
		typeMap.set(a.type, entry);
	}
	const excludedTypes = new Set(
		Array.from(typeMap.entries())
			.filter(([, { total, excluded }]) => total > 0 && excluded === total)
			.map(([type]) => type)
	);
	const exclusionCount = excludedTypes.size;

	devLog('homePage', 'Exclusion count calculated', {
		excludedTypes: Array.from(excludedTypes),
		exclusionCount
	});

	devLog('homePage', 'Net worth calculation complete', {
		netWorth,
		totalAssets,
		totalLiabilities,
		excludedAssets,
		excludedLiabilities,
		hasStaleData,
		exclusionCount
	});

	// Calculate staleness based on newest balance date
	const staleness = getStaleness(newestDate);

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		},
		netWorth,
		totalAssets,
		totalLiabilities,
		excludedAssets,
		excludedLiabilities,
		dateRange: {
			oldest: oldestDate,
			newest: newestDate
		},
		hasStaleData,
		exclusionCount,
		accounts: userAccounts,
		goals: activeGoals,
		staleness
	};
};

export const actions: Actions = {
	updateExclusions: async ({ request, locals }) => {
		if (!locals.user) {
			logError('updateExclusions', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();

		// Extract type-level updates (e.g., "type_savings=0", "type_current=1")
		const typeUpdates: Map<string, boolean> = new Map();

		for (const [key, value] of formData.entries()) {
			if (key.startsWith('type_')) {
				const accountType = key.replace('type_', '');
				const excluded = value === '1';
				typeUpdates.set(accountType, excluded);
			}
		}

		if (typeUpdates.size === 0) {
			devLog('updateExclusions', 'No valid type updates in form data');
			return fail(400, { error: 'No account types selected' });
		}

		devLog('updateExclusions', 'Processing type-level exclusion updates', {
			userId: locals.user.id,
			typeCount: typeUpdates.size,
			typeUpdates: Array.from(typeUpdates.entries()).map(([type, excluded]) => ({ type, excluded }))
		});

		// Log current state BEFORE update
		const beforeUpdate = await db.query.accounts.findMany({
			where: withUserFilter(locals.user.id, accounts),
			columns: { id: true, type: true, excludedFromNetWorth: true }
		});
		devLog('updateExclusions', 'Database state BEFORE update', {
			accountsExcludedByType: beforeUpdate.reduce((acc, a) => {
				if (a.excludedFromNetWorth) {
					acc[a.type] = (acc[a.type] || 0) + 1;
				}
				return acc;
			}, {} as Record<string, number>),
			totalExcludedTypes: new Set(beforeUpdate.filter(a => a.excludedFromNetWorth).map(a => a.type)).size
		});

		try {
			// Fetch user's open (non-closed) accounts to get their IDs by type
			// Closed accounts must be excluded to avoid the prevent_edit_closed_account trigger
			const userAccounts = await db.query.accounts.findMany({
				where: and(withUserFilter(locals.user.id, accounts), isNull(accounts.closedAt)),
				columns: { id: true, type: true }
			});

			// Group account IDs by type
			const accountsByType = new Map<string, number[]>();
			for (const account of userAccounts) {
				if (!accountsByType.has(account.type)) {
					accountsByType.set(account.type, []);
				}
				accountsByType.get(account.type)!.push(account.id);
			}

			// Build CASE statement for bulk update by type
			const sqlChunks: SQL[] = [];
			const ids: number[] = [];

			sqlChunks.push(sql` (case`);
			for (const [type, excluded] of typeUpdates.entries()) {
				const typeAccountIds = accountsByType.get(type) ?? [];
				for (const accountId of typeAccountIds) {
					sqlChunks.push(sql` when ${accounts.id} = ${accountId} then ${excluded ? 1 : 0}`);
					ids.push(accountId);
				}
			}
			sqlChunks.push(sql` end)`);

			const finalSql: SQL = sql.join(sqlChunks, sql.raw(' '));

			// Perform bulk update with row-level security
			await db
				.update(accounts)
				.set({ excludedFromNetWorth: finalSql })
				.where(and(withUserFilter(locals.user.id, accounts), inArray(accounts.id, ids)));

			devLog('updateExclusions', 'Type-based bulk update successful', {
				userId: locals.user.id,
				affectedRows: ids.length,
				typesUpdated: Array.from(typeUpdates.keys())
			});

			// Log state AFTER update to verify
			const afterUpdate = await db.query.accounts.findMany({
				where: withUserFilter(locals.user.id, accounts),
				columns: { id: true, type: true, excludedFromNetWorth: true }
			});
			devLog('updateExclusions', 'Database state AFTER update', {
				accountsExcludedByType: afterUpdate.reduce((acc, a) => {
					if (a.excludedFromNetWorth) {
						acc[a.type] = (acc[a.type] || 0) + 1;
					}
					return acc;
				}, {} as Record<string, number>),
				totalExcludedTypes: new Set(afterUpdate.filter(a => a.excludedFromNetWorth).map(a => a.type)).size
			});

			return { success: 'Exclusions updated successfully' };
		} catch (error) {
			logError('updateExclusions', 'Database error during bulk update', error);
			return fail(500, { error: 'Failed to update exclusions' });
		}
	}
};
