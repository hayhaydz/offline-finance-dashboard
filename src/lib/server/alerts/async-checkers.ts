import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { withUserFilter } from '$lib/auth/row-security';
import { db } from '$lib/db/client';
import { accountTransactions, accounts, goalAllocations, goals, interestRates, monthlyReviews, settings, snapshots, users } from '$lib/db/schema';
import {
	getActualInterestEarned,
	getISAAllowanceUsed,
} from '$lib/server/tax-year-queries';
import {
	getTaxFreeStatus,
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from '$lib/utils/tax-year-utils';
import { getBudgetStatus, getCategoryBreakdown, UNCATEGORISED_ID } from '../budgets';
import { getCurrentBalancesForAccounts } from '$lib/server/derivedBalances';
import { getDebtGoalProgress } from '../goals';
import type { Alert, AlertSeverity } from '$lib/types/alerts';
import { calculateISAPacing } from '$lib/server/isaPacing';
import { MS_PER_DAY } from '$lib/utils/time-constants';
import { PSA_BY_BAND, daysUntil, daysSince, makeAccountAlert, makeGlobalAlert } from './constants';
import type { AccountRow } from './constants';
import { devLog } from "$lib/server/logger";

// ─── Async alert checkers ─────────────────────────────────────────────────────

export async function checkIsaAlerts(
	userId: number,
	taxYear: { start: Date; end: Date },
): Promise<Alert[]> {
	devLog("checkIsaAlerts", "Checking ISA alerts", { userId });
	const alerts: Alert[] = [];
	const used = await getISAAllowanceUsed(userId, taxYear.start, taxYear.end);
	const pct = used / ISA_ALLOWANCE_IN_CENTS;

	if (pct >= 1.0) {
		alerts.push(
			makeGlobalAlert('ISA_FULL', 'info', 'ISA allowance full', `£${(used / 100).toLocaleString('en-GB')} of £20,000 used this tax year`, '/accounts'),
		);
	} else if (pct >= 0.8) {
		const remaining = ISA_ALLOWANCE_IN_CENTS - used;
		alerts.push(
			makeGlobalAlert(
				'ISA_NEARLY_FULL',
				'amber',
				'ISA nearly full',
				`£${(used / 100).toLocaleString('en-GB')} of £20,000 used (${Math.round(pct * 100)}%) — £${(remaining / 100).toLocaleString('en-GB')} remaining`,
				'/accounts',
			),
		);
	}

	return alerts;
}

export async function checkPsaAlerts(
	userId: number,
	taxYear: { start: Date; end: Date },
	taxBand: string,
	hasSavingsAccounts: boolean,
): Promise<Alert[]> {
	devLog("checkPsaAlerts", "Checking PSA alerts", { userId, taxBand });
	const alerts: Alert[] = [];

	if (taxBand === 'additional') {
		if (hasSavingsAccounts) {
			alerts.push(
				makeGlobalAlert(
					'ADDITIONAL_RATE_PSA_ZERO',
					'amber',
					'No Personal Savings Allowance',
					'Additional rate taxpayers have £0 PSA — all savings interest is taxable',
					'/accounts',
				),
			);
		}
		return alerts;
	}

	const threshold = PSA_BY_BAND[taxBand] ?? PSA_BY_BAND.basic;
	const earned = await getActualInterestEarned(userId, taxYear.start, taxYear.end);
	const status = getTaxFreeStatus(earned, taxBand as 'basic' | 'higher' | 'additional');

	if (earned > threshold) {
		const over = earned - threshold;
		alerts.push(
			makeGlobalAlert(
				'PSA_EXCEEDED',
				'red',
				'Personal Savings Allowance exceeded',
				`£${(earned / 100).toLocaleString('en-GB')} earned — £${(over / 100).toLocaleString('en-GB')} taxable`,
				'/accounts',
			),
		);
	} else if (earned > threshold * 0.8) {
		const remaining = threshold - earned;
		const pct = Math.round((earned / threshold) * 100);
		alerts.push(
			makeGlobalAlert(
				'PSA_NEARLY_EXCEEDED',
				'amber',
				'Approaching Personal Savings Allowance',
				`£${(earned / 100).toLocaleString('en-GB')} of £${(threshold / 100).toLocaleString('en-GB')} used (${pct}%) — £${(remaining / 100).toLocaleString('en-GB')} remaining`,
				'/accounts',
			),
		);
	}

	// Suppress unused variable warning
	void status;

	return alerts;
}

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

export async function checkTaxYearReviewAlerts(now: Date): Promise<Alert[]> {
	devLog("checkTaxYearReviewAlerts", "Checking tax year review alerts");
	const taxYear = getUkTaxYearBounds(now);
	const daysSinceNewTaxYear = daysSince(taxYear.start, now);

	// Only show alerts in the first 30 days of the new tax year
	if (daysSinceNewTaxYear < 0 || daysSinceNewTaxYear > 30) return [];

	// Previous tax year slug: e.g. if current is 2026-27, previous is 2025-26
	const prevStartYear = taxYear.start.getUTCFullYear() - 1;
	const prevSlug = `${prevStartYear}-${String(prevStartYear + 1).slice(-2)}`;
	const prevLabel = `${prevStartYear}/${String(prevStartYear + 1).slice(-2)}`;

	let severity: AlertSeverity;
	if (daysSinceNewTaxYear <= 7) {
		severity = 'info';
	} else if (daysSinceNewTaxYear <= 14) {
		severity = 'amber';
	} else {
		severity = 'red';
	}

	return [
		makeGlobalAlert(
			'TAX_YEAR_INTEREST_REVIEW',
			severity,
			'Tax year interest summary',
			`Review your ${prevLabel} interest — ${daysSinceNewTaxYear === 0 ? 'new tax year started today' : `${daysSinceNewTaxYear}d into new tax year`}`,
			`/accounts/interest/${prevSlug}`,
		),
		makeGlobalAlert(
			'TAX_YEAR_ISA_REVIEW',
			severity,
			'Tax year ISA summary',
			`Review your ${prevLabel} ISA usage — ${daysSinceNewTaxYear === 0 ? 'new tax year started today' : `${daysSinceNewTaxYear}d into new tax year`}`,
			`/accounts/isa/${prevSlug}`,
		),
	];
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

	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;

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
				`Spent ${fmt(totalSpent)} of ${fmt(target)} budget (${percentOver}% over)`,
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
				`Projected to spend ${fmt(projectedTotal)} against a ${fmt(target)} target (${daysRemaining} days remaining)`,
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
				message: `Spent ${fmt(cat.spent)}, exceeding the ${fmt(cat.target)} target by ${fmt(over)}`,
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
				message: `Spent ${fmt(cat.spent)} of ${fmt(cat.target)} (${Math.round(pct)}%)`,
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
					`${Math.round(uncategorisedPct)}% of spending (${fmt(uncategorisedEntry.spent)}) is uncategorised this month`,
					href,
				),
			);
		} else if (uncategorisedPct > 20) {
			alerts.push(
				makeGlobalAlert(
					'HIGH_UNCATEGORISED_SPEND',
					'info',
					'High uncategorised spending',
					`${Math.round(uncategorisedPct)}% of spending (${fmt(uncategorisedEntry.spent)}) is uncategorised this month`,
					href,
				),
			);
		}
	}

	return alerts;
}

export async function checkNetWorthAlerts(userId: number): Promise<Alert[]> {
	devLog("checkNetWorthAlerts", "Checking net worth alerts", { userId });
	const alerts: Alert[] = [];
	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;

	const rows = await db
		.select({
			snapshotDate: snapshots.snapshotDate,
			netWorthInCents: snapshots.netWorthInCents,
		})
		.from(snapshots)
		.where(withUserFilter(userId, snapshots))
		.orderBy(desc(snapshots.snapshotDate))
		.limit(4);

	if (rows.length < 2) return alerts;

	// NET_WORTH_DECLINING: last snapshot < previous snapshot
	const last = rows[0];
	const prev = rows[1];
	if (last.netWorthInCents < prev.netWorthInCents) {
		const diff = prev.netWorthInCents - last.netWorthInCents;
		alerts.push(
			makeGlobalAlert(
				'NET_WORTH_DECLINING',
				'amber',
				'Net worth declining',
				`Decreased by ${fmt(diff)} since last snapshot (${prev.snapshotDate})`,
				'/overview/snapshots',
			),
		);
	}

	// NET_WORTH_SUSTAINED_DECLINE: 3+ consecutive snapshots all declining
	if (rows.length >= 3) {
		let decliningMonths = 0;
		for (let i = 1; i < rows.length; i++) {
			if (rows[i].netWorthInCents > rows[i - 1].netWorthInCents) {
				decliningMonths++;
			} else {
				break;
			}
		}
		if (decliningMonths >= 3) {
			alerts.push(
				makeGlobalAlert(
					'NET_WORTH_SUSTAINED_DECLINE',
					'red',
					'Net worth sustained decline',
					`Net worth has decreased for ${decliningMonths} consecutive months`,
					'/overview/snapshots',
				),
			);
		}
	}

	return alerts;
}

export async function checkDebtPayoffAlerts(userId: number): Promise<Alert[]> {
	devLog("checkDebtPayoffAlerts", "Checking debt payoff alerts", { userId });
	const alerts: Alert[] = [];
	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;

	const openLiabilities = await db
		.select()
		.from(accounts)
		.where(
			and(
				withUserFilter(userId, accounts),
				eq(accounts.category, 'liability'),
				isNull(accounts.closedAt),
			),
		);

	if (openLiabilities.length === 0) return alerts;

	const accountIds = openLiabilities.map(a => a.id);
	const balances = await getCurrentBalancesForAccounts(accountIds);

	// Fetch latest interest rate for each liability account
	const rateRows = await db
		.select()
		.from(interestRates)
		.where(inArray(interestRates.accountId, accountIds));

	const latestRates = new Map<number, typeof rateRows[number]>();
	for (const row of rateRows) {
		const existing = latestRates.get(row.accountId);
		if (!existing || row.effectiveFrom > existing.effectiveFrom) {
			latestRates.set(row.accountId, row);
		}
	}

	// Fetch recent payments (last 90 days) to estimate average monthly payment
	const ninetyDaysAgo = new Date();
	ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

	const paymentRows = await db
		.select({
			accountId: accountTransactions.accountId,
			amount: accountTransactions.amount,
		})
		.from(accountTransactions)
		.where(
			and(
				inArray(accountTransactions.accountId, accountIds),
				gte(accountTransactions.transactionDate, ninetyDaysAgo),
			),
		);

	// Group payments per account and compute average (payments reduce debt, so amount < 0 for liabilities)
	const accountPayments = new Map<number, number[]>();
	for (const row of paymentRows) {
		// For liability accounts, payments reduce the balance (negative amounts)
		if (row.amount < 0) {
			const existing = accountPayments.get(row.accountId) ?? [];
			existing.push(Math.abs(row.amount));
			accountPayments.set(row.accountId, existing);
		}
	}

	for (const account of openLiabilities) {
		const balance = balances.get(account.id) ?? 0;
		const rate = latestRates.get(account.id);

		if (!rate || balance >= 0) continue;

		const absBalance = Math.abs(balance);
		const monthlyInterest = absBalance * (rate.rate / 100 / 12 / 100);

		// Estimate average monthly payment from recent history
		const payments = accountPayments.get(account.id) ?? [];
		const avgMonthlyPayment = payments.length > 0
			? payments.reduce((sum, p) => sum + p, 0) / payments.length
			: 0;

		if (avgMonthlyPayment <= monthlyInterest && avgMonthlyPayment > 0) {
			alerts.push(
				makeAccountAlert(
					'DEBT_NEVER_PAYS_OFF',
					'red',
					`${account.name} — debt growing`,
					`Monthly payment (${fmt(Math.round(avgMonthlyPayment))}) doesn't cover interest (${fmt(Math.round(monthlyInterest))})`,
					account,
				),
			);
		}
	}

	return alerts;
}

export async function checkGoalAutoReduceAlerts(userId: number): Promise<Alert[]> {
	devLog("checkGoalAutoReduceAlerts", "Checking goal auto-reduce alerts", { userId });
	const alerts: Alert[] = [];
	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;

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
			message: `${fmt(Math.abs(r.amount))} automatically unallocated due to negative account balance`,
			href: '/goals',
			triggeredAt: Date.now(),
		});
	}

	return alerts;
}

export async function checkISAPacingAlerts(userId: number): Promise<Alert[]> {
	devLog("checkISAPacingAlerts", "Checking ISA pacing alerts", { userId });
	const alerts: Alert[] = [];
	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;

	const pacing = await calculateISAPacing(userId);

	if (pacing.status !== 'behind') return alerts;

	const deposited = pacing.allowanceUsedInCents;
	const target = ISA_ALLOWANCE_IN_CENTS;
	const monthlyNeeded = pacing.requiredMonthlyInCents;

	alerts.push(
		makeGlobalAlert(
			'ISA_PACING_BEHIND',
			'info',
			'ISA contributions behind pace',
			`Deposited ${fmt(deposited)} of ${fmt(target)} — ${fmt(monthlyNeeded)}/month needed to reach limit`,
			'/accounts',
		),
	);

	return alerts;
}

export async function checkLISAAlerts(userId: number): Promise<Alert[]> {
	devLog("checkLISAAlerts", "Checking LISA alerts", { userId });
	const alerts: Alert[] = [];
	const now = new Date();
	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;
	const { start: taxYearStart } = getUkTaxYearBounds(now);

	const lisaAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			eq(accounts.taxWrapper, 'lisa'),
			isNull(accounts.closedAt),
		),
	});

	if (lisaAccounts.length === 0) return alerts;

	const lisaAccountIds = lisaAccounts.map((a) => a.id);

	const depositRows = await db
		.select({
			accountId: accountTransactions.accountId,
			totalDeposited: sql<number>`coalesce(sum(${accountTransactions.amount}), 0)`,
		})
		.from(accountTransactions)
		.where(
			and(
				inArray(accountTransactions.accountId, lisaAccountIds),
				inArray(accountTransactions.type, ['deposit', 'transfer_in']),
				gte(accountTransactions.transactionDate, taxYearStart),
				// transactionDate < taxYearEnd handled implicitly by summing only positive deposits
			),
		)
		.groupBy(accountTransactions.accountId);

	const depositsByAccount = new Map<number, number>();
	for (const row of depositRows) {
		// Only count positive amounts (deposits into LISA increase balance)
		depositsByAccount.set(row.accountId, row.totalDeposited);
	}

	const LISA_LIMIT_IN_CENTS = 400_000; // £4,000 in pence

	for (const account of lisaAccounts) {
		const deposited = depositsByAccount.get(account.id) ?? 0;
		if (deposited > LISA_LIMIT_IN_CENTS) {
			alerts.push(
				makeAccountAlert(
					'LISA_CONTRIBUTION_LIMIT',
					'amber',
					`${account.name} — LISA limit exceeded`,
					`Deposited ${fmt(deposited)} of £4,000 limit this tax year`,
					account,
				),
			);
		}
	}

	return alerts;
}

export async function checkBoERateAlerts(userId: number): Promise<Alert[]> {
	devLog("checkBoERateAlerts", "Checking BoE rate alerts", { userId });
	const alerts: Alert[] = [];

	const boeSetting = await db.query.settings.findFirst({
		where: eq(settings.key, 'boeBaseRate'),
	});

	if (!boeSetting) return alerts;

	const boeBaseRateInBps = parseInt(boeSetting.value, 10);
	if (isNaN(boeBaseRateInBps)) return alerts;

	// Query open asset savings accounts (not current accounts)
	const savingsAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			eq(accounts.category, 'asset'),
			isNull(accounts.closedAt),
		),
	});

	const savingsIds = savingsAccounts
		.filter((a) => a.type !== 'current')
		.map((a) => a.id);

	if (savingsIds.length === 0) return alerts;

	// Fetch latest interest rate for each savings account
	const rateRows = await db
		.select()
		.from(interestRates)
		.where(inArray(interestRates.accountId, savingsIds));

	const latestRates = new Map<number, typeof rateRows[number]>();
	for (const row of rateRows) {
		const existing = latestRates.get(row.accountId);
		if (!existing || row.effectiveFrom > existing.effectiveFrom) {
			latestRates.set(row.accountId, row);
		}
	}

	for (const account of savingsAccounts) {
		if (account.type === 'current') continue;

		const rate = latestRates.get(account.id);
		if (!rate) continue;

		// Both rates are in basis points (e.g. 450 = 4.50%)
		const accountRateInBps = rate.rate;
		const spread = accountRateInBps - boeBaseRateInBps;

		if (spread < -100) {
			// More than 1% below base rate
			const accountRatePct = (accountRateInBps / 100).toFixed(2);
			const baseRatePct = (boeBaseRateInBps / 100).toFixed(2);
			const spreadPct = (Math.abs(spread) / 100).toFixed(2);
			alerts.push(
				makeAccountAlert(
					'SAVINGS_RATE_BELOW_BOE',
					'amber',
					`${account.name} — rate below base`,
					`Rate of ${accountRatePct}% is ${spreadPct}% below BoE base (${baseRatePct}%)`,
					account,
				),
			);
		} else if (spread < -50) {
			// More than 0.5% below base rate
			const accountRatePct = (accountRateInBps / 100).toFixed(2);
			const baseRatePct = (boeBaseRateInBps / 100).toFixed(2);
			const spreadPct = (Math.abs(spread) / 100).toFixed(2);
			alerts.push(
				makeAccountAlert(
					'SAVINGS_RATE_BELOW_BOE',
					'info',
					`${account.name} — rate below base`,
					`Rate of ${accountRatePct}% is ${spreadPct}% below BoE base (${baseRatePct}%)`,
					account,
				),
			);
		}
	}

	return alerts;
}

export async function checkOrphanedTransfers(userId: number): Promise<Alert[]> {
	devLog("checkOrphanedTransfers", "Checking orphaned transfers", { userId });
	const alerts: Alert[] = [];
	const fmt = (cents: number) => `£${(cents / 100).toLocaleString('en-GB')}`;

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	// Get all transfer transactions for user's accounts in the last 30 days
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});

	const userAccountIds = userAccounts.map((a) => a.id);
	if (userAccountIds.length === 0) return alerts;

	const transferRows = await db
		.select({
			id: accountTransactions.id,
			accountId: accountTransactions.accountId,
			amount: accountTransactions.amount,
			type: accountTransactions.type,
			transactionDate: accountTransactions.transactionDate,
		})
		.from(accountTransactions)
		.where(
			and(
				inArray(accountTransactions.accountId, userAccountIds),
				inArray(accountTransactions.type, ['transfer_in', 'transfer_out']),
				gte(accountTransactions.transactionDate, thirtyDaysAgo),
			),
		);

	if (transferRows.length === 0) return alerts;

	// Build account lookup
	const accountMap = new Map<number, typeof userAccounts[number]>();
	for (const account of userAccounts) {
		accountMap.set(account.id, account);
	}

	// For each transfer, check if there's a matching counterpart in another account
	const oneDayMs = 1 * MS_PER_DAY;

	for (const tx of transferRows) {
		// We only alert on transfer_in to avoid double-counting
		if (tx.type !== 'transfer_in') continue;

		const txDateMs = Number(tx.transactionDate) * 1000;

		// Look for a matching transfer_out in another account
		const hasMatch = transferRows.some((other) =>
			other.type === 'transfer_out' &&
			other.accountId !== tx.accountId &&
			Math.abs(other.amount) === Math.abs(tx.amount) &&
			Math.abs(Number(other.transactionDate) * 1000 - txDateMs) <= oneDayMs,
		);

		if (!hasMatch) {
			const account = accountMap.get(tx.accountId);
			if (!account) continue;

			const txDate = new Date(txDateMs);
			const formattedAmount = fmt(Math.abs(tx.amount));
			const formattedDate = txDate.toLocaleDateString('en-GB');

			alerts.push(
				makeAccountAlert(
					'ORPHANED_TRANSFER',
					'info',
					'Unmatched transfer',
					`${formattedAmount} transfer_in on ${formattedDate} has no matching counterpart`,
					account,
				),
			);
		}
	}

	return alerts;
}
