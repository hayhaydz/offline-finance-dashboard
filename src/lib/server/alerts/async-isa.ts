// ─── ISA-related async alert checkers ─────────────────────────

import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { withUserFilter } from '$lib/auth/row-security';
import { db } from '$lib/db/client';
import { accountTransactions, accounts } from '$lib/db/schema';
import {
	getActualInterestEarned,
	getISAAllowanceUsed,
} from '$lib/server/tax-year-queries';
import {
	getTaxFreeStatus,
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from '$lib/utils/tax-year-utils';
import { calculateISAPacing } from '$lib/server/isaPacing';
import type { Alert, AlertSeverity } from '$lib/types/alerts';
import { PSA_BY_BAND, daysSince, makeAccountAlert, makeGlobalAlert } from './constants';
import type { AccountRow } from './constants';
import { devLog } from "$lib/server/logger";
import { formatCents } from "$lib/utils/formatting";

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

export async function checkISAPacingAlerts(userId: number): Promise<Alert[]> {
	devLog("checkISAPacingAlerts", "Checking ISA pacing alerts", { userId });
	const alerts: Alert[] = [];

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
			`Deposited ${formatCents(deposited)} of ${formatCents(target)} — ${formatCents(monthlyNeeded)}/month needed to reach limit`,
			'/accounts',
		),
	);

	return alerts;
}

export async function checkLISAAlerts(userId: number): Promise<Alert[]> {
	devLog("checkLISAAlerts", "Checking LISA alerts", { userId });
	const alerts: Alert[] = [];
	const now = new Date();
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
					`Deposited ${formatCents(deposited)} of £4,000 limit this tax year`,
					account,
				),
			);
		}
	}

	return alerts;
}
