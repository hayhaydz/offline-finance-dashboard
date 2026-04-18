// ─── Goal & budget async alert checkers ─────────────────────────

import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { withUserFilter } from '$lib/auth/row-security';
import { db } from '$lib/db/client';
import { goalAllocations, goals, monthlyReviews, snapshots } from '$lib/db/schema';
import { getBudgetStatus, getCategoryBreakdown, UNCATEGORISED_ID } from '../budgets';
import { getCurrentBalancesForAccounts } from '$lib/server/derivedBalances';
import { getDebtGoalProgress } from '../goals';
import type { Alert, AlertSeverity } from '$lib/types/alerts';
import { daysUntil, daysSince, makeGlobalAlert } from './constants';
import type { AccountRow } from './constants';
import { devLog } from "$lib/server/logger";
import { formatCents } from "$lib/utils/formatting";

export async function checkGoalAlerts(userId: number): Promise<Alert[]> {
	devLog("checkGoalAlerts", "Checking goal alerts", { userId });
	const alerts: Alert[] = [];
	const now = new Date();

	const userGoals = await db.query.goals.findMany({
		where: and(withUserFilter(userId, goals), isNull(goals.deletedAt)),
	});

	// Batch-fetch current balances for debt goals
	const debtGoalAccountIds = userGoals
		.filter(g => g.goalType === 'debt' && g.linkedAccountId !== null)
		.map(g => g.linkedAccountId!);

	const debtBalances = debtGoalAccountIds.length > 0
		? await getCurrentBalancesForAccounts(debtGoalAccountIds)
		: new Map<number, number>();

	for (const goal of userGoals) {
		if (goal.currentAllocation < 0 && goal.goalType !== 'debt') {
			alerts.push({
				id: `GOAL_NEGATIVE_BALANCE:goal:${goal.slug}`,
				type: 'GOAL_NEGATIVE_BALANCE',
				severity: 'red',
				title: 'Goal has negative balance',
				message: `"${goal.name}" allocation has gone negative`,
				href: '/goals',
				triggeredAt: Date.now(),
			});
		}

		if (goal.targetDate) {
			const days = daysUntil(goal.targetDate, now);
			if (days <= 30 && days > 0) {
				let progress: number;
				if (goal.goalType === 'debt' && goal.linkedAccountId !== null) {
					const currentBalance = debtBalances.get(goal.linkedAccountId) ?? 0;
					const debtProgress = getDebtGoalProgress({
						startingBalanceInCents: goal.startingBalanceInCents ?? 0,
						currentBalanceInCents: currentBalance,
					});
					progress = debtProgress.percent / 100;
				} else {
					progress = goal.targetAmountInCents > 0
						? goal.currentAllocation / goal.targetAmountInCents
						: 1;
				}
				if (progress < 0.9) {
					const pct = Math.round(progress * 100);
					alerts.push({
						id: `GOAL_DEADLINE_APPROACHING:goal:${goal.slug}`,
						type: 'GOAL_DEADLINE_APPROACHING',
						severity: 'amber',
						title: 'Goal deadline approaching',
						message: `"${goal.name}" — ${pct}% funded, deadline in ${days} day${days === 1 ? '' : 's'}`,
						href: '/goals',
						triggeredAt: Date.now(),
					});
				}
			}
		}

		// Check for debt that grew beyond starting balance
		if (goal.goalType === 'debt' && goal.startingBalanceInCents !== null && goal.linkedAccountId !== null) {
			const currentBalance = debtBalances.get(goal.linkedAccountId);
			if (currentBalance !== undefined && Math.abs(currentBalance) > Math.abs(goal.startingBalanceInCents)) {
				alerts.push({
					id: `DEBT_GREW_BEYOND_STARTING:goal:${goal.slug}`,
					type: 'DEBT_GREW_BEYOND_STARTING',
					severity: 'red',
					title: 'Debt increased',
					message: `"${goal.name}" balance has exceeded the starting balance`,
					href: '/goals',
					triggeredAt: Date.now(),
				});
			}
		}
	}

	return alerts;
}

export async function checkSnapshotAlerts(userId: number): Promise<Alert[]> {
	devLog("checkSnapshotAlerts", "Checking snapshot alerts", { userId });
	const [row] = await db
		.select({ maxDate: sql<string | null>`max(${snapshots.snapshotDate})` })
		.from(snapshots)
		.where(withUserFilter(userId, snapshots));

	const maxDate = row?.maxDate;
	if (!maxDate) {
		return [makeGlobalAlert('NO_SNAPSHOT_RECENTLY', 'info', 'No net worth snapshot', 'No snapshot has been taken yet', '/snapshots')];
	}

	const daysSinceSnapshot = daysSince(new Date(maxDate), new Date());
	if (daysSinceSnapshot > 30) {
		return [
			makeGlobalAlert(
				'NO_SNAPSHOT_RECENTLY',
				'info',
				'No recent snapshot',
				`Last snapshot was ${daysSinceSnapshot} days ago`,
				'/snapshots',
			),
		];
	}

	return [];
}

export async function checkMonthlyReviewAlerts(userId: number): Promise<Alert[]> {
	devLog("checkMonthlyReviewAlerts", "Checking monthly review alerts", { userId });
	const now = new Date();
	const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

	const existing = await db.query.monthlyReviews.findFirst({
		where: and(
			withUserFilter(userId, monthlyReviews),
			eq(monthlyReviews.yearMonth, yearMonth),
		),
	});

	if (existing) return [];

	const dayOfMonth = now.getUTCDate();
	const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

	let severity: AlertSeverity;
	let message: string;

	if (dayOfMonth <= 7) {
		severity = 'info';
		message = `No review yet for ${monthLabel}`;
	} else if (dayOfMonth <= 14) {
		severity = 'amber';
		message = `Review overdue for ${monthLabel}`;
	} else {
		severity = 'red';
		message = `Review urgently needed for ${monthLabel}`;
	}

	return [makeGlobalAlert('NO_MONTHLY_REVIEW', severity, 'Monthly review', message, '/reviews')];
}

export async function checkBudgetAlerts(userId: number): Promise<Alert[]> {
	devLog("checkBudgetAlerts", "Checking budget alerts", { userId });
	const alerts: Alert[] = [];
	const now = new Date();
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth() + 1;
	const monthSlug = `${year}-${String(month).padStart(2, '0')}`;
	const href = `/overview/budgets/${monthSlug}`;

	const status = await getBudgetStatus(userId, year, month);

	// No budget configured for current month — skip entirely
	if (!status.budget) return [];

	const { totalSpent, daysElapsed, totalDays, projectedTotal } = status;
	const daysRemaining = totalDays - daysElapsed;
	const target = status.budget.totalTargetInCents;

	// 1. BUDGET_OVERSPEND (red): actual totalSpent > target
	if (totalSpent > target) {
		const percentOver = Math.round(((totalSpent - target) / target) * 100);
		alerts.push(
			makeGlobalAlert(
				'BUDGET_OVERSPEND',
				'red',
				'Monthly budget exceeded',
				`Spent ${formatCents(totalSpent)} of ${formatCents(target)} budget (${percentOver}% over)`,
				href,
			),
		);
	}

	// 2. BUDGET_PROJECTED_OVERSPEND (amber): projectedTotal > target AND daysElapsed >= 7
	if (projectedTotal > target && daysElapsed >= 7) {
		alerts.push(
			makeGlobalAlert(
				'BUDGET_PROJECTED_OVERSPEND',
				'amber',
				'Budget overspend projected',
				`Projected to spend ${formatCents(projectedTotal)} against a ${formatCents(target)} target (${daysRemaining} days remaining)`,
				href,
			),
		);
	}

	// 3 & 4. Category-level alerts
	const categories = await getCategoryBreakdown(userId, year, month, status.budget);

	for (const cat of categories) {
		if (cat.id === UNCATEGORISED_ID) continue; // handled separately below
		if (cat.target === null || cat.target <= 0) continue;

		const pct = (cat.spent / cat.target) * 100;

		// CATEGORY_BUDGET_EXCEEDED (amber): spent > target
		if (cat.spent > cat.target) {
			const over = cat.spent - cat.target;
			alerts.push({
				id: `CATEGORY_BUDGET_EXCEEDED:${cat.id}`,
				type: 'CATEGORY_BUDGET_EXCEEDED',
				severity: 'amber',
				title: `${cat.name} over budget`,
				message: `Spent ${formatCents(cat.spent)}, exceeding the ${formatCents(cat.target)} target by ${formatCents(over)}`,
				href,
				triggeredAt: Date.now(),
			});
		}
		// CATEGORY_BUDGET_APPROACHING (info): spent > 80% of target (but not yet exceeded)
		else if (pct > 80) {
			alerts.push({
				id: `CATEGORY_BUDGET_APPROACHING:${cat.id}`,
				type: 'CATEGORY_BUDGET_APPROACHING',
				severity: 'info',
				title: `${cat.name} approaching budget`,
				message: `Spent ${formatCents(cat.spent)} of ${formatCents(cat.target)} (${Math.round(pct)}%)`,
				href,
				triggeredAt: Date.now(),
			});
		}
	}

	// 5. HIGH_UNCATEGORISED_SPEND (info -> amber)
	const uncategorisedEntry = categories.find(c => c.id === UNCATEGORISED_ID);
	if (uncategorisedEntry && totalSpent > 0) {
		const uncategorisedPct = (uncategorisedEntry.spent / totalSpent) * 100;
		if (uncategorisedPct > 40) {
			alerts.push(
				makeGlobalAlert(
					'HIGH_UNCATEGORISED_SPEND',
					'amber',
					'High uncategorised spending',
					`${Math.round(uncategorisedPct)}% of spending (${formatCents(uncategorisedEntry.spent)}) is uncategorised this month`,
					href,
				),
			);
		} else if (uncategorisedPct > 20) {
			alerts.push(
				makeGlobalAlert(
					'HIGH_UNCATEGORISED_SPEND',
					'info',
					'High uncategorised spending',
					`${Math.round(uncategorisedPct)}% of spending (${formatCents(uncategorisedEntry.spent)}) is uncategorised this month`,
					href,
				),
			);
		}
	}

	return alerts;
}

export async function checkGoalAutoReduceAlerts(userId: number): Promise<Alert[]> {
	devLog("checkGoalAutoReduceAlerts", "Checking goal auto-reduce alerts", { userId });
	const alerts: Alert[] = [];

	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

	const reductions = await db
		.select({
			allocationId: goalAllocations.id,
			amount: goalAllocations.amount,
			goalName: goals.name,
			goalSlug: goals.slug,
		})
		.from(goalAllocations)
		.innerJoin(goals, eq(goalAllocations.goalId, goals.id))
		.where(
			and(
				withUserFilter(userId, goals),
				eq(goalAllocations.type, 'AUTO_REDUCE_NEGATIVE_BALANCE'),
				gte(goalAllocations.createdAt, sevenDaysAgo),
			),
		);

	for (const r of reductions) {
		alerts.push({
			id: `GOAL_AUTO_REDUCE_TRIGGERED:${r.goalSlug}:${r.allocationId}`,
			type: 'GOAL_AUTO_REDUCE_TRIGGERED',
			severity: 'red',
			title: `${r.goalName} allocation reduced`,
			message: `${formatCents(Math.abs(r.amount))} automatically unallocated due to negative account balance`,
			href: '/goals',
			triggeredAt: Date.now(),
		});
	}

	return alerts;
}
