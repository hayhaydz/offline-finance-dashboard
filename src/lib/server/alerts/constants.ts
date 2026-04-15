import { accounts, interestRates } from '$lib/db/schema';
import type { Alert, AlertSeverity } from '$lib/types/alerts';
import { MS_PER_DAY } from '$lib/utils/time-constants';

// ─── Constants ──────────────────────────────────────────────────────────────

export const PSA_BY_BAND: Record<string, number> = {
	basic: 100_000,     // £1,000 in pence
	higher: 50_000,     // £500 in pence
	additional: 0,
};

// ─── Internal types ──────────────────────────────────────────────────────────

export interface TxSummary {
	latestTxDate: Date | null;
	hasPaymentThisMonth: boolean;
	hasDisbursement: boolean;
	lastAccruedDate: Date | null;  // most recent interest_accrued transaction
	lastInterestDate: Date | null; // most recent interest posted transaction
	hasIsaDepositThisTaxYear: boolean;
}

export type AccountRow = typeof accounts.$inferSelect;
export type RateRow = typeof interestRates.$inferSelect;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function daysUntil(date: Date, now: Date): number {
	return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

export function daysSince(date: Date, now: Date): number {
	return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
}

export function makeAccountAlert(
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

export function makeGlobalAlert(
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
