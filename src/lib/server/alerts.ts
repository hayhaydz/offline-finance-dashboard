import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { withUserFilter } from '$lib/auth/row-security';
import { db } from '$lib/db/client';
import { accountTransactions, accounts, goals, interestRates, monthlyReviews, snapshots, users } from '$lib/db/schema';
import {
	getActualInterestEarned,
	getISAAllowanceUsed,
	getTaxFreeStatus,
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from '$lib/server/calculations';
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from '$lib/server/derivedBalances';
import { getDebtGoalProgress } from './goals';
import type { Alert, AlertSeverity } from '$lib/types/alerts';
import { logError } from '$lib/utils/logger';

// ─── Constants ──────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PSA_BY_BAND: Record<string, number> = {
	basic: 100_000,     // £1,000 in pence
	higher: 50_000,     // £500 in pence
	additional: 0,
};

// ─── Internal types ──────────────────────────────────────────────────────────

interface TxSummary {
	latestTxDate: Date | null;
	hasPaymentThisMonth: boolean;
	hasDisbursement: boolean;
	lastAccruedDate: Date | null;  // most recent interest_accrued transaction
	lastInterestDate: Date | null; // most recent interest posted transaction
	hasIsaDepositThisTaxYear: boolean;
}

type AccountRow = typeof accounts.$inferSelect;
type RateRow = typeof interestRates.$inferSelect;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(date: Date, now: Date): number {
	return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

function daysSince(date: Date, now: Date): number {
	return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
}

function makeAccountAlert(
	type: Alert['type'],
	severity: AlertSeverity,
	title: string,
	message: string,
	account: AccountRow,
): Alert {
	return {
		id: `${type}:${account.slug}`,
		type,
		severity,
		title,
		message,
		accountSlug: account.slug,
		accountName: account.name,
		accountType: account.type,
		accountCategory: account.category,
		href: `/accounts/${account.slug}`,
		triggeredAt: Date.now(),
	};
}

function makeGlobalAlert(
	type: Alert['type'],
	severity: AlertSeverity,
	title: string,
	message: string,
	href?: string,
): Alert {
	return {
		id: `${type}:global`,
		type,
		severity,
		title,
		message,
		href,
		triggeredAt: Date.now(),
	};
}

// ─── Sync alert checkers ──────────────────────────────────────────────────────

function checkMaturityAlerts(openAccounts: AccountRow[], now: Date): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (!account.maturityDate) continue;
		const days = daysUntil(account.maturityDate, now);
		if (days <= 0) continue; // handled by checkMaturityPassedAlerts

		let type: Alert['type'];
		let severity: AlertSeverity;
		let message: string;

		if (days <= 1) {
			type = 'MATURITY_SOON_1';
			severity = 'red';
			message = `Matures ${days === 0 ? 'today' : 'tomorrow'} — ${account.maturityDate.toLocaleDateString('en-GB')}`;
		} else if (days <= 7) {
			type = 'MATURITY_SOON_7';
			severity = 'amber';
			message = `Matures in ${days} days — ${account.maturityDate.toLocaleDateString('en-GB')}`;
		} else if (days <= 30) {
			type = 'MATURITY_SOON_30';
			severity = 'amber';
			message = `Matures in ${days} days — ${account.maturityDate.toLocaleDateString('en-GB')}`;
		} else {
			continue;
		}

		alerts.push(makeAccountAlert(type, severity, 'Maturity approaching', message, account));
	}

	return alerts;
}

function checkMaturityPassedAlerts(
	openAccounts: AccountRow[],
	rateHistories: Map<number, RateRow[]>,
	now: Date,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (!account.maturityDate) continue;
		if (account.maturityDate >= now) continue;

		const rates = rateHistories.get(account.id) ?? [];
		const latestRate = rates[0];

		// Alert only if there's no rate entry after the maturity date
		if (!latestRate || latestRate.effectiveFrom < account.maturityDate) {
			alerts.push(
				makeAccountAlert(
					'MATURITY_PASSED_NO_RATE',
					'amber',
					'Matured — no new rate',
					`Matured on ${account.maturityDate.toLocaleDateString('en-GB')} but no updated rate recorded`,
					account,
				),
			);
		}
	}

	return alerts;
}

function rateChangeLabel(effectiveFrom: Date, now: Date): string {
	const isUpcoming = effectiveFrom > now;
	if (isUpcoming) {
		const days = daysUntil(effectiveFrom, now);
		return `in ${days}d — effective ${effectiveFrom.toLocaleDateString('en-GB')}`;
	}
	return `${daysSince(effectiveFrom, now)}d ago`;
}

function checkRateChangeAlerts(
	openAccounts: AccountRow[],
	rateHistories: Map<number, RateRow[]>,
	now: Date,
): Alert[] {
	const alerts: Alert[] = [];
	const cutoff = now.getTime() - 30 * MS_PER_DAY;

	for (const account of openAccounts) {
		const rates = rateHistories.get(account.id) ?? [];
		if (rates.length < 2) continue;

		const [latest, previous] = rates;
		// Skip if the change is older than 30 days; always include future-dated changes
		if (latest.effectiveFrom.getTime() < cutoff) continue;

		const isUpcoming = latest.effectiveFrom > now;
		const label = rateChangeLabel(latest.effectiveFrom, now);

		if (account.category === 'asset' && account.type !== 'current') {
			if (latest.rate < previous.rate) {
				const from = (previous.rate / 100).toFixed(2);
				const to = (latest.rate / 100).toFixed(2);
				alerts.push(
					makeAccountAlert(
						'RATE_DECREASED_SAVINGS',
						'amber',
						isUpcoming ? 'Savings rate cut incoming' : 'Savings rate cut',
						`${from}% → ${to}% (${label}) — you will earn less interest`,
						account,
					),
				);
			}
		} else if (account.category === 'liability') {
			if (latest.rate > previous.rate) {
				const from = (previous.rate / 100).toFixed(2);
				const to = (latest.rate / 100).toFixed(2);
				alerts.push(
					makeAccountAlert(
						'RATE_INCREASED_LIABILITY',
						'red',
						isUpcoming ? 'Liability rate rise incoming' : 'Liability rate rise',
						`${from}% → ${to}% (${label}) — your repayments will increase`,
						account,
					),
				);
			}
		}
	}

	return alerts;
}

function checkNoRateAlerts(
	openAccounts: AccountRow[],
	rateHistories: Map<number, RateRow[]>,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.category !== 'asset' || account.type === 'current') continue;
		const rates = rateHistories.get(account.id) ?? [];
		if (rates.length === 0) {
			alerts.push(
				makeAccountAlert('NO_RATE_SET', 'info', 'No interest rate', 'No rate has been set for this account', account),
			);
		}
	}

	return alerts;
}

function checkStaleBalanceAlerts(
	openAccounts: AccountRow[],
	latestTxDates: Map<number, Date | null>,
	now: Date,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.liquidity === 'locked') continue;
		if (account.maturityDate && account.maturityDate > now) continue;

		const threshold = account.type === 'current' ? 14 : 60;
		const latest = latestTxDates.get(account.id) ?? null;

		if (!latest || daysSince(latest, now) >= threshold) {
			const days = latest ? daysSince(latest, now) : null;
			const message = days !== null
				? `No transactions in ${days} days`
				: 'No transactions recorded';
			alerts.push(makeAccountAlert('STALE_BALANCE', 'info', 'Balance stale', message, account));
		}
	}

	return alerts;
}

function checkCreditAlerts(
	openAccounts: AccountRow[],
	balances: Map<number, number>,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (!account.creditLimit || account.creditLimit <= 0) continue;
		const balance = balances.get(account.id) ?? 0;
		const utilisation = Math.abs(balance) / account.creditLimit;

		if (utilisation > 0.95) {
			const pct = Math.round(utilisation * 100);
			alerts.push(
				makeAccountAlert('CREDIT_LIMIT_NEAR_MAX', 'red', 'Credit near max', `${pct}% utilised`, account),
			);
		} else if (utilisation > 0.80) {
			const pct = Math.round(utilisation * 100);
			alerts.push(
				makeAccountAlert('CREDIT_LIMIT_APPROACHING', 'amber', 'Credit limit approaching', `${pct}% utilised`, account),
			);
		}
	}

	return alerts;
}

function checkLiabilityPaymentAlerts(
	openAccounts: AccountRow[],
	txSummaries: Map<number, TxSummary>,
	now: Date,
): Alert[] {
	// Grace period: don't fire before the 7th of the month
	if (now.getUTCDate() <= 7) return [];

	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.category !== 'liability') continue;
		const summary = txSummaries.get(account.id);
		if (!summary?.hasPaymentThisMonth) {
			alerts.push(
				makeAccountAlert('NO_LIABILITY_PAYMENT', 'amber', 'No payment this month', 'No payment or deposit recorded this calendar month', account),
			);
		}
	}

	return alerts;
}

function checkInterestAccruedAlerts(
	openAccounts: AccountRow[],
	txSummaries: Map<number, TxSummary>,
	now: Date,
): Alert[] {
	const alerts: Alert[] = [];
	const ninetyDaysAgo = new Date(now.getTime() - 90 * MS_PER_DAY);

	for (const account of openAccounts) {
		const summary = txSummaries.get(account.id);
		if (!summary?.lastAccruedDate) continue;

		const { lastAccruedDate, lastInterestDate } = summary;

		// Alert if: accrual is older than 90 days AND no interest posted after that accrual
		const accruedIsOld = lastAccruedDate < ninetyDaysAgo;
		const noInterestAfterAccrual = !lastInterestDate || lastAccruedDate > lastInterestDate;

		if (accruedIsOld && noInterestAfterAccrual) {
			const days = daysSince(lastAccruedDate, now);
			alerts.push(
				makeAccountAlert('INTEREST_ACCRUED_UNPOSTED', 'info', 'Accrued interest unposted', `Interest accrued ${days} days ago with no posted interest since`, account),
			);
		}
	}

	return alerts;
}

function checkZeroBalanceAlerts(
	openAccounts: AccountRow[],
	balances: Map<number, number>,
	latestTxDates: Map<number, Date | null>,
	now: Date,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.category !== 'asset') continue;
		if (account.type !== 'current' && account.type !== 'savings') continue;

		const balance = balances.get(account.id) ?? 0;
		if (balance !== 0) continue;

		const latest = latestTxDates.get(account.id) ?? null;
		if (!latest || daysSince(latest, now) >= 30) {
			const days = latest ? daysSince(latest, now) : null;
			const message = days !== null ? `Balance at £0 for ${days}+ days` : 'Balance at £0 — no transactions recorded';
			alerts.push(makeAccountAlert('ZERO_BALANCE_ACTIVE', 'info', 'Zero balance', message, account));
		}
	}

	return alerts;
}

function checkPremiumBondsAlerts(
	openAccounts: AccountRow[],
	balances: Map<number, number>,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.taxWrapper !== 'premium-bonds') continue;
		const balance = balances.get(account.id) ?? 0;
		if (balance > 5_000_000) { // £50,000 in pence
			alerts.push(
				makeAccountAlert('PREMIUM_BONDS_OVER_LIMIT', 'red', 'Over Premium Bonds limit', `Balance of £${(balance / 100).toLocaleString('en-GB')} exceeds £50,000 NS&I maximum`, account),
			);
		}
	}

	return alerts;
}

function checkNoDisbursementAlerts(
	openAccounts: AccountRow[],
	txSummaries: Map<number, TxSummary>,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.type !== 'loan' && account.type !== 'mortgage') continue;
		const summary = txSummaries.get(account.id);
		if (!summary?.hasDisbursement) {
			alerts.push(
				makeAccountAlert('NO_DISBURSEMENT', 'amber', 'No disbursement recorded', 'No loan or mortgage disbursement transaction found', account),
			);
		}
	}

	return alerts;
}

function checkUnusedIsaAlerts(
	openAccounts: AccountRow[],
	txSummaries: Map<number, TxSummary>,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of openAccounts) {
		if (account.taxWrapper !== 'isa' && account.taxWrapper !== 'lisa') continue;
		const summary = txSummaries.get(account.id);
		if (!summary?.hasIsaDepositThisTaxYear) {
			alerts.push(
				makeAccountAlert('UNUSED_ISA_ACCOUNT', 'info', 'ISA unused this tax year', 'No deposits or transfers in during the current tax year', account),
			);
		}
	}

	return alerts;
}

function checkClosedWithBalanceAlerts(
	allAccounts: AccountRow[],
	balances: Map<number, number>,
): Alert[] {
	const alerts: Alert[] = [];

	for (const account of allAccounts) {
		if (!account.closedAt) continue;
		const balance = balances.get(account.id) ?? 0;
		if (balance !== 0) {
			const formatted = `£${Math.abs(balance / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
			alerts.push(
				makeAccountAlert('CLOSED_WITH_BALANCE', 'amber', 'Closed with non-zero balance', `Balance of ${formatted} on closed account — possible data entry error`, account),
			);
		}
	}

	return alerts;
}

// ─── Async alert checkers ─────────────────────────────────────────────────────

async function checkIsaAlerts(
	userId: number,
	taxYear: { start: Date; end: Date },
): Promise<Alert[]> {
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

async function checkPsaAlerts(
	userId: number,
	taxYear: { start: Date; end: Date },
	taxBand: string,
	hasSavingsAccounts: boolean,
): Promise<Alert[]> {
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

async function checkGoalAlerts(userId: number): Promise<Alert[]> {
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

async function checkSnapshotAlerts(userId: number): Promise<Alert[]> {
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

async function checkTaxYearReviewAlerts(now: Date): Promise<Alert[]> {
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

async function checkMonthlyReviewAlerts(userId: number): Promise<Alert[]> {
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

// ─── Bulk data fetcher ────────────────────────────────────────────────────────

async function fetchBulkData(userId: number) {
	const now = new Date();
	now.setUTCHours(0, 0, 0, 0);

	const taxYear = getUkTaxYearBounds(now);
	const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const startOfMonthUnixSeconds = Math.floor(startOfMonth.getTime() / 1000);
	const taxYearStartUnixSeconds = Math.floor(taxYear.start.getTime() / 1000);

	// Round trip 1: all accounts (open + closed)
	const allAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});

	const allAccountIds = allAccounts.map((a) => a.id);
	const openAccounts = allAccounts.filter((a) => !a.closedAt);
	const openAccountIds = openAccounts.map((a) => a.id);

	if (allAccountIds.length === 0) {
		return { allAccounts: [], openAccounts: [], rateHistories: new Map(), txSummaries: new Map(), balances: new Map(), latestTxDates: new Map(), taxYear, now, taxBand: 'basic' as string, hasSavingsAccounts: false };
	}

	// Round trip 2: latest interest rates per account (fetch all, group in-memory)
	const allRates = openAccountIds.length > 0
		? await db
			.select()
			.from(interestRates)
			.where(inArray(interestRates.accountId, openAccountIds))
			.orderBy(desc(interestRates.effectiveFrom))
		: [];

	const rateHistories = new Map<number, RateRow[]>();
	for (const rate of allRates) {
		const existing = rateHistories.get(rate.accountId) ?? [];
		if (existing.length < 2) existing.push(rate);
		rateHistories.set(rate.accountId, existing);
	}

	// Round trip 3: transaction summaries (combined aggregation)
	const txRows = allAccountIds.length > 0
		? await db
			.select({
				accountId: accountTransactions.accountId,
				hasPaymentThisMonth: sql<number>`max(case when ${accountTransactions.type} in ('payment', 'deposit') and ${accountTransactions.transactionDate} >= ${startOfMonthUnixSeconds} then 1 else 0 end)`,
				hasDisbursement: sql<number>`max(case when ${accountTransactions.type} in ('loan_disbursement', 'mortgage_disbursement') then 1 else 0 end)`,
				lastAccruedTs: sql<number | null>`max(case when ${accountTransactions.type} = 'interest_accrued' then ${accountTransactions.transactionDate} else null end)`,
				lastInterestTs: sql<number | null>`max(case when ${accountTransactions.type} = 'interest' then ${accountTransactions.transactionDate} else null end)`,
				hasIsaDepositThisTaxYear: sql<number>`max(case when ${accountTransactions.type} in ('deposit', 'transfer_in') and ${accountTransactions.transactionDate} >= ${taxYearStartUnixSeconds} then 1 else 0 end)`,
			})
			.from(accountTransactions)
			.where(inArray(accountTransactions.accountId, allAccountIds))
			.groupBy(accountTransactions.accountId)
		: [];

	const txSummaries = new Map<number, TxSummary>();
	for (const row of txRows) {
		// SQLite stores timestamps as Unix seconds; convert to ms for Date
		const toDate = (ts: number | null): Date | null =>
			ts ? new Date(Number(ts) * 1000) : null;

		txSummaries.set(row.accountId, {
			latestTxDate: null, // populated from latestTxDates below
			hasPaymentThisMonth: Number(row.hasPaymentThisMonth) === 1,
			hasDisbursement: Number(row.hasDisbursement) === 1,
			lastAccruedDate: toDate(row.lastAccruedTs),
			lastInterestDate: toDate(row.lastInterestTs),
			hasIsaDepositThisTaxYear: Number(row.hasIsaDepositThisTaxYear) === 1,
		});
	}

	// Parallel: balances + tx dates
	const [balances, latestTxDates] = await Promise.all([
		getCurrentBalancesForAccounts(allAccountIds),
		getLatestTransactionDateForAccounts(allAccountIds),
	]);

	// Merge latestTxDate into txSummaries
	for (const [accountId, summary] of txSummaries) {
		summary.latestTxDate = latestTxDates.get(accountId) ?? null;
	}

	// Get user taxBand
	const userRow = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { taxBand: true },
	});
	const taxBand = userRow?.taxBand ?? 'basic';

	const hasSavingsAccounts = openAccounts.some(
		(a) => a.category === 'asset' && a.type !== 'current',
	);

	return { allAccounts, openAccounts, rateHistories, txSummaries, balances, latestTxDates, taxYear, now, taxBand, hasSavingsAccounts };
}

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Full alert set for the homepage and /alerts page.
 * Includes user-level alerts (ISA, PSA, goals, snapshots) + all account-level.
 */
export async function getAlerts(userId: number): Promise<Alert[]> {
	try {
		const { allAccounts, openAccounts, rateHistories, txSummaries, balances, latestTxDates, taxYear, now, taxBand, hasSavingsAccounts } =
			await fetchBulkData(userId);

		// Account-level (sync)
		const accountAlerts = [
			...checkMaturityAlerts(openAccounts, now),
			...checkMaturityPassedAlerts(openAccounts, rateHistories, now),
			...checkRateChangeAlerts(openAccounts, rateHistories, now),
			...checkNoRateAlerts(openAccounts, rateHistories),
			...checkStaleBalanceAlerts(openAccounts, latestTxDates, now),
			...checkCreditAlerts(openAccounts, balances),
			...checkLiabilityPaymentAlerts(openAccounts, txSummaries, now),
			...checkInterestAccruedAlerts(openAccounts, txSummaries, now),
			...checkZeroBalanceAlerts(openAccounts, balances, latestTxDates, now),
			...checkPremiumBondsAlerts(openAccounts, balances),
			...checkNoDisbursementAlerts(openAccounts, txSummaries),
			...checkUnusedIsaAlerts(openAccounts, txSummaries),
			...checkClosedWithBalanceAlerts(allAccounts, balances),
		];

		// User-level (async, parallel)
		const [isaAlerts, psaAlerts, goalAlerts, snapshotAlerts, reviewAlerts, taxYearReviewAlerts] = await Promise.all([
			checkIsaAlerts(userId, taxYear),
			checkPsaAlerts(userId, taxYear, taxBand, hasSavingsAccounts),
			checkGoalAlerts(userId),
			checkSnapshotAlerts(userId),
			checkMonthlyReviewAlerts(userId),
			checkTaxYearReviewAlerts(now),
		]);

		return [...accountAlerts, ...isaAlerts, ...psaAlerts, ...goalAlerts, ...snapshotAlerts, ...reviewAlerts, ...taxYearReviewAlerts];
	} catch (err) {
		logError('getAlerts', 'Failed to compute alerts', { userId, err });
		return [];
	}
}

/**
 * Account-level alerts only — for the accounts list page.
 * Excludes INTEREST_ACCRUED_UNPOSTED and NO_DISBURSEMENT (detail-page only).
 */
export async function getAccountListAlerts(userId: number): Promise<Alert[]> {
	try {
		const { allAccounts, openAccounts, rateHistories, txSummaries, balances, latestTxDates, now } =
			await fetchBulkData(userId);

		return [
			...checkMaturityAlerts(openAccounts, now),
			...checkMaturityPassedAlerts(openAccounts, rateHistories, now),
			...checkRateChangeAlerts(openAccounts, rateHistories, now),
			...checkNoRateAlerts(openAccounts, rateHistories),
			...checkStaleBalanceAlerts(openAccounts, latestTxDates, now),
			...checkCreditAlerts(openAccounts, balances),
			...checkLiabilityPaymentAlerts(openAccounts, txSummaries, now),
			...checkZeroBalanceAlerts(openAccounts, balances, latestTxDates, now),
			...checkPremiumBondsAlerts(openAccounts, balances),
			...checkUnusedIsaAlerts(openAccounts, txSummaries),
			...checkClosedWithBalanceAlerts(allAccounts, balances),
		];
	} catch (err) {
		logError('getAccountListAlerts', 'Failed to compute account list alerts', { userId, err });
		return [];
	}
}

/**
 * Alerts scoped to a single account — for the account detail page.
 * Excludes user-level alerts (ISA, PSA, goals, snapshots).
 */
export async function getAlertsForAccount(accountId: number, userId: number): Promise<Alert[]> {
	try {
		const { allAccounts, openAccounts, rateHistories, txSummaries, balances, latestTxDates, now } =
			await fetchBulkData(userId);

		const allAccountAlerts = [
			...checkMaturityAlerts(openAccounts, now),
			...checkMaturityPassedAlerts(openAccounts, rateHistories, now),
			...checkRateChangeAlerts(openAccounts, rateHistories, now),
			...checkNoRateAlerts(openAccounts, rateHistories),
			...checkStaleBalanceAlerts(openAccounts, latestTxDates, now),
			...checkCreditAlerts(openAccounts, balances),
			...checkLiabilityPaymentAlerts(openAccounts, txSummaries, now),
			...checkInterestAccruedAlerts(openAccounts, txSummaries, now),
			...checkZeroBalanceAlerts(openAccounts, balances, latestTxDates, now),
			...checkPremiumBondsAlerts(openAccounts, balances),
			...checkNoDisbursementAlerts(openAccounts, txSummaries),
			...checkUnusedIsaAlerts(openAccounts, txSummaries),
			...checkClosedWithBalanceAlerts(allAccounts, balances),
		];

		// Find the target account to get its slug for filtering
		const targetAccount = allAccounts.find((a) => a.id === accountId);
		if (!targetAccount) return [];

		return allAccountAlerts.filter((a) => a.accountSlug === targetAccount.slug);
	} catch (err) {
		logError('getAlertsForAccount', 'Failed to compute account alerts', { accountId, userId, err });
		return [];
	}
}

/**
 * Goal-specific alerts only — for the goals list page.
 * Returns GOAL_DEADLINE_APPROACHING, GOAL_NEGATIVE_BALANCE, DEBT_GREW_BEYOND_STARTING.
 */
export async function getGoalListAlerts(userId: number): Promise<Alert[]> {
	try {
		return await checkGoalAlerts(userId);
	} catch (err) {
		logError('getGoalListAlerts', 'Failed to compute goal alerts', { userId, err });
		return [];
	}
}
