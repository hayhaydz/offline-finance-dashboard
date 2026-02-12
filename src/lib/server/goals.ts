/**
 * Server-side goal progress calculation utilities
 *
 * Calculates goal progress from filtered assets, computes Emergency Fund milestones,
 * and determines unallocated assets across all goals.
 *
 * References:
 * - UKPersonalFinance: Goals as first-class entities with asset pool filtering
 * - Project: Row-level security via withUserFilter() for all queries
 */

import { db } from '$lib/db/client';
import { accounts, accountBalances, goals } from '$lib/db/schema';
import { withUserFilter } from '$lib/auth/row-security';
import { devLog } from '$lib/utils/logger';
import type { Goal, Account } from '$lib/db/schema';

/**
 * Progress result for a single goal
 */
export interface GoalProgress {
	goal: Goal;
	currentAmountInCents: number;
	targetAmountInCents: number;
	progressPercent: number;
	isComplete: boolean;
}

/**
 * Result of calculating all goals' progress
 */
export interface GoalsProgressResult {
	goals: GoalProgress[];
	totalAllocated: number; // Total assets allocated to all goals
	unallocatedAssets: number; // Assets not allocated to any goal
	totalAssets: number; // Total user assets (for reference)
}

/**
 * Milestone for Emergency Fund goals
 */
export interface EmergencyFundMilestone {
	label: string; // '1mo', '3mo', '6mo', '12mo'
	amountInCents: number;
	percent: number; // Percentage of full 12-month goal
}

/**
 * Calculate progress for a single goal by filtering user's assets
 *
 * Process:
 * 1. Parse accountTypeFilters and liquidityFilters from JSON
 * 2. Filter user's asset accounts (category === 'asset', !closedAt)
 * 3. Filter by account type and liquidity arrays
 * 4. Fetch latest balance for each filtered account
 * 5. Sum balances to get currentAmountInCents
 * 6. Calculate progress percentage (capped at 100%)
 *
 * @param params - Goal, user accounts, and database instance
 * @returns Progress data for the goal
 *
 * @example
 * const progress = await calculateGoalProgress({
 *   goal: { accountTypeFilters: '["savings","investment"]', ... },
 *   userAccounts: allUserAccounts,
 *   db
 * });
 */
export async function calculateGoalProgress(params: {
	goal: Goal;
	userAccounts: Account[];
}): Promise<GoalProgress> {
	const { goal, userAccounts } = params;

	devLog('calculateGoalProgress', 'Calculating progress for goal', {
		goalId: goal.id,
		goalName: goal.name,
		accountTypeFilters: goal.accountTypeFilters,
		liquidityFilters: goal.liquidityFilters
	});

	// Parse JSON filters
	let accountTypeFilters: string[] = [];
	let liquidityFilters: string[] = [];

	try {
		accountTypeFilters = JSON.parse(goal.accountTypeFilters);
		liquidityFilters = JSON.parse(goal.liquidityFilters);
	} catch (e) {
		devLog('calculateGoalProgress', 'Failed to parse filters', {
			goalId: goal.id,
			accountTypeFilters: goal.accountTypeFilters,
			liquidityFilters: goal.liquidityFilters,
			error: e instanceof Error ? e.message : String(e)
		});
		// Default to empty arrays if parsing fails
		accountTypeFilters = [];
		liquidityFilters = [];
	}

	// Filter user's asset accounts
	const filteredAccounts = userAccounts.filter((account) => {
		// Must be asset category and not closed
		if (account.category !== 'asset' || account.closedAt) {
			return false;
		}

		// Check account type filter
		if (accountTypeFilters.length > 0 && !accountTypeFilters.includes(account.type)) {
			return false;
		}

		// Check liquidity filter (null liquidity means no filter)
		if (liquidityFilters.length > 0 && account.liquidity) {
			if (!liquidityFilters.includes(account.liquidity)) {
				return false;
			}
		}

		return true;
	});

	devLog('calculateGoalProgress', 'Filtered accounts for goal', {
		goalId: goal.id,
		totalAccounts: userAccounts.length,
		filteredAccounts: filteredAccounts.length
	});

	// Fetch latest balance for each filtered account
	let currentAmountInCents = 0;

	if (filteredAccounts.length > 0) {
		const accountIds = filteredAccounts.map((a) => a.id);

		// Get latest balance for each account using a single query
		const latestBalances = await db.query.accountBalances.findMany({
			where: (balances, { inArray, and }) =>
				inArray(balances.accountId, accountIds),
			orderBy: (balances, { desc }) => desc(balances.asOfDate),
			limit: filteredAccounts.length // Rough limit - we'll filter client-side
		});

		// Deduplicate to get only the latest balance per account
		const latestByAccount = new Map<number, number>();
		for (const balance of latestBalances) {
			if (!latestByAccount.has(balance.accountId)) {
				latestByAccount.set(balance.accountId, balance.balanceInCents);
			}
		}

		// Sum all latest balances
		currentAmountInCents = Array.from(latestByAccount.values()).reduce((sum, amount) => sum + amount, 0);

		devLog('calculateGoalProgress', 'Summed account balances for goal', {
			goalId: goal.id,
			accountsWithBalances: latestByAccount.size,
			currentAmountInCents
		});
	}

	const targetAmountInCents = goal.targetAmountInCents;
	const progressPercent = Math.min(100, (currentAmountInCents / targetAmountInCents) * 100);
	const isComplete = progressPercent >= 100;

	devLog('calculateGoalProgress', 'Goal progress calculated', {
		goalId: goal.id,
		currentAmountInCents,
		targetAmountInCents,
		progressPercent: Math.round(progressPercent * 100) / 100,
		isComplete
	});

	return {
		goal,
		currentAmountInCents,
		targetAmountInCents,
		progressPercent: Math.round(progressPercent * 100) / 100, // Round to 2 decimal places
		isComplete
	};
}

/**
 * Calculate progress for all user goals and determine unallocated assets
 *
 * Process:
 * 1. Fetch user's asset accounts with latest balances
 * 2. For each goal, call calculateGoalProgress
 * 3. Calculate total allocated assets (sum of all goal currents)
 * 4. Calculate total user assets (sum of all asset account balances)
 * 5. Calculate unallocated: totalAssets - totalAllocated
 *
 * @param params - User ID, goals array, and database instance
 * @returns Progress data for all goals with allocation summary
 *
 * @example
 * const result = await calculateAllGoalsProgress({
 *   userId: locals.user.id,
 *   goals: userGoals,
 *   db
 * });
 */
export async function calculateAllGoalsProgress(params: {
	userId: number;
	userGoals: Goal[];
}): Promise<GoalsProgressResult> {
	const { userId, userGoals } = params;

	devLog('calculateAllGoalsProgress', 'Calculating progress for all goals', {
		userId,
		goalCount: userGoals.length
	});

	// Fetch user's asset accounts with balances
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
		with: {
			balances: {
				orderBy: (balances, { desc }) => desc(balances.asOfDate),
				limit: 1
			}
		}
	});

	// Filter to only asset accounts
	const assetAccounts = userAccounts.filter((a) => a.category === 'asset' && !a.closedAt);

	devLog('calculateAllGoalsProgress', 'Fetched user asset accounts', {
		userId,
		totalAccounts: userAccounts.length,
		assetAccounts: assetAccounts.length
	});

	// Calculate progress for each goal
	const goalsProgress: GoalProgress[] = [];
	for (const goal of userGoals) {
		const progress = await calculateGoalProgress({
			goal,
			userAccounts: assetAccounts
		});
		goalsProgress.push(progress);
	}

	// Calculate total allocated (sum of all goal current amounts)
	const totalAllocated = goalsProgress.reduce((sum, gp) => sum + gp.currentAmountInCents, 0);

	// Calculate total user assets (sum of all asset account latest balances)
	const totalAssets = assetAccounts.reduce((sum, account) => {
		return sum + (account.balances[0]?.balanceInCents || 0);
	}, 0);

	// Calculate unallocated
	const unallocatedAssets = totalAssets - totalAllocated;

	devLog('calculateAllGoalsProgress', 'Calculated allocation summary', {
		userId,
		totalGoals: goalsProgress.length,
		totalAllocated,
		totalAssets,
		unallocatedAssets
	});

	return {
		goals: goalsProgress,
		totalAllocated,
		unallocatedAssets,
		totalAssets
	};
}

/**
 * Calculate Emergency Fund milestones from monthly expenses
 *
 * Emergency Fund goals have tiered milestones based on monthly expenses:
 * - 1 month: 100% of monthly expenses
 * - 3 months: 300% of monthly expenses
 * - 6 months: 600% of monthly expenses
 * - 12 months: 1200% of monthly expenses (full goal)
 *
 * @param monthlyExpensesInCents - Monthly essential expenses amount
 * @returns Array of milestone data
 *
 * @example
 * const milestones = calculateMilestones(200000); // £2000/month
 * // Returns:
 * // [
 * //   { label: '1mo', amountInCents: 200000, percent: 8.33 },
 * //   { label: '3mo', amountInCents: 600000, percent: 25 },
 * //   { label: '6mo', amountInCents: 1200000, percent: 50 },
 * //   { label: '12mo', amountInCents: 2400000, percent: 100 }
 * // ]
 */
export function calculateMilestones(monthlyExpensesInCents: number): EmergencyFundMilestone[] {
	if (monthlyExpensesInCents <= 0) {
		return [];
	}

	return [
		{
			label: '1mo',
			amountInCents: monthlyExpensesInCents,
			percent: 8.33
		},
		{
			label: '3mo',
			amountInCents: monthlyExpensesInCents * 3,
			percent: 25
		},
		{
			label: '6mo',
			amountInCents: monthlyExpensesInCents * 6,
			percent: 50
		},
		{
			label: '12mo',
			amountInCents: monthlyExpensesInCents * 12,
			percent: 100
		}
	];
}
