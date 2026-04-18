// ─── Account & net-worth async alert checkers ─────────────────────────

import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { withUserFilter } from '$lib/auth/row-security';
import { db } from '$lib/db/client';
import { accountTransactions, accounts, interestRates, settings, snapshots } from '$lib/db/schema';
import { getCurrentBalancesForAccounts } from '$lib/server/derivedBalances';
import type { Alert } from '$lib/types/alerts';
import { MS_PER_DAY } from '$lib/utils/time-constants';
import { makeAccountAlert, makeGlobalAlert } from './constants';
import { devLog } from '$lib/server/logger';
import { formatCents } from '$lib/utils/formatting';

export async function checkNetWorthAlerts(userId: number): Promise<Alert[]> {
	devLog("checkNetWorthAlerts", "Checking net worth alerts", { userId });
	const alerts: Alert[] = [];

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
				`Decreased by ${formatCents(diff)} since last snapshot (${prev.snapshotDate})`,
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
					`Monthly payment (${formatCents(Math.round(avgMonthlyPayment))}) doesn't cover interest (${formatCents(Math.round(monthlyInterest))})`,
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
			const formattedAmount = formatCents(Math.abs(tx.amount));
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
