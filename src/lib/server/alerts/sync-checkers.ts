import type { Alert, AlertSeverity } from '$lib/types/alerts';
import { MS_PER_DAY } from '$lib/utils/time-constants';
import type { AccountRow, RateRow, TxSummary } from './constants';
import { daysUntil, daysSince, makeAccountAlert } from './constants';

// ─── Sync alert checkers ──────────────────────────────────────────────────────

export function checkMaturityAlerts(openAccounts: AccountRow[], now: Date): Alert[] {
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

export function checkMaturityPassedAlerts(
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

export function checkRateChangeAlerts(
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

export function checkNoRateAlerts(
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

export function checkStaleBalanceAlerts(
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

export function checkCreditAlerts(
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

export function checkLiabilityPaymentAlerts(
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

export function checkInterestAccruedAlerts(
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

export function checkZeroBalanceAlerts(
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

export function checkPremiumBondsAlerts(
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

export function checkNoDisbursementAlerts(
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

export function checkUnusedIsaAlerts(
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

export function checkClosedWithBalanceAlerts(
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
