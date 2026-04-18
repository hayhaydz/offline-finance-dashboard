import type { Alert } from '$lib/types/alerts';
import { devLog, logError, logInfo } from '$lib/server/logger';
import { fetchBulkData } from './bulk-data';
import {
	checkMaturityAlerts,
	checkMaturityPassedAlerts,
	checkRateChangeAlerts,
	checkNoRateAlerts,
	checkStaleBalanceAlerts,
	checkCreditAlerts,
	checkLiabilityPaymentAlerts,
	checkInterestAccruedAlerts,
	checkZeroBalanceAlerts,
	checkPremiumBondsAlerts,
	checkNoDisbursementAlerts,
	checkUnusedIsaAlerts,
	checkClosedWithBalanceAlerts,
} from './sync-checkers';
import {
	checkIsaAlerts,
	checkPsaAlerts,
	checkTaxYearReviewAlerts,
	checkISAPacingAlerts,
	checkLISAAlerts,
} from './async-isa';
import {
	checkGoalAlerts,
	checkSnapshotAlerts,
	checkMonthlyReviewAlerts,
	checkBudgetAlerts,
	checkGoalAutoReduceAlerts,
} from './async-goals';
import {
	checkNetWorthAlerts,
	checkDebtPayoffAlerts,
	checkBoERateAlerts,
	checkOrphanedTransfers,
} from './async-accounts';

/** Diagnostic wrapper — logs checker name + result count, surfaces full error */
async function safeCheck(name: string, fn: () => Promise<Alert[]>): Promise<Alert[]> {
	try {
		const result = await fn();
		devLog('getAlerts', `checker "${name}" → ${result.length} alert(s)`);
		return result;
	} catch (err) {
		const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
		logInfo('getAlerts', `checker "${name}" FAILED: ${msg}`);
		return [];
	}
}

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Full alert set for the homepage and /alerts page.
 * Includes user-level alerts (ISA, PSA, goals, snapshots) + all account-level.
 */
export async function getAlerts(userId: number): Promise<Alert[]> {
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

	// User-level + account-level (async, parallel — each checker isolated)
	const [isaAlerts, psaAlerts, goalAlerts, snapshotAlerts, reviewAlerts, taxYearReviewAlerts,
		budgetAlerts, netWorthAlerts, debtPayoffAlerts, goalAutoReduceAlerts, isaPacingAlerts, lisaAlerts, boeRateAlerts, orphanedTransferAlerts] = await Promise.all([
		safeCheck('checkIsaAlerts',          () => checkIsaAlerts(userId, taxYear)),
		safeCheck('checkPsaAlerts',           () => checkPsaAlerts(userId, taxYear, taxBand, hasSavingsAccounts)),
		safeCheck('checkGoalAlerts',          () => checkGoalAlerts(userId)),
		safeCheck('checkSnapshotAlerts',      () => checkSnapshotAlerts(userId)),
		safeCheck('checkMonthlyReviewAlerts', () => checkMonthlyReviewAlerts(userId)),
		safeCheck('checkTaxYearReviewAlerts', () => checkTaxYearReviewAlerts(now)),
		safeCheck('checkBudgetAlerts',        () => checkBudgetAlerts(userId)),
		safeCheck('checkNetWorthAlerts',      () => checkNetWorthAlerts(userId)),
		safeCheck('checkDebtPayoffAlerts',    () => checkDebtPayoffAlerts(userId)),
		safeCheck('checkGoalAutoReduceAlerts',() => checkGoalAutoReduceAlerts(userId)),
		safeCheck('checkISAPacingAlerts',     () => checkISAPacingAlerts(userId)),
		safeCheck('checkLISAAlerts',          () => checkLISAAlerts(userId)),
		safeCheck('checkBoERateAlerts',       () => checkBoERateAlerts(userId)),
		safeCheck('checkOrphanedTransfers',   () => checkOrphanedTransfers(userId)),
	]);

	const all = [...accountAlerts, ...isaAlerts, ...psaAlerts, ...goalAlerts, ...snapshotAlerts, ...reviewAlerts, ...taxYearReviewAlerts,
		...budgetAlerts, ...netWorthAlerts, ...debtPayoffAlerts, ...goalAutoReduceAlerts, ...isaPacingAlerts, ...lisaAlerts, ...boeRateAlerts, ...orphanedTransferAlerts];

	logInfo('getAlerts', `Computed ${all.length} alert(s) for user ${userId}`);
	return all;
}

/**
 * Account-level alerts only — for the accounts list page.
 * Excludes INTEREST_ACCRUED_UNPOSTED and NO_DISBURSEMENT (detail-page-only).
 */
export async function getAccountListAlerts(userId: number): Promise<Alert[]> {
	try {
		const { allAccounts, openAccounts, rateHistories, txSummaries, balances, latestTxDates, now } =
			await fetchBulkData(userId);

		const [debtPayoffAlerts, boeRateAlerts, orphanedTransferAlerts, lisaAlerts] = await Promise.all([
			checkDebtPayoffAlerts(userId),
			checkBoERateAlerts(userId),
			checkOrphanedTransfers(userId),
			checkLISAAlerts(userId),
		]);

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
			...debtPayoffAlerts,
			...boeRateAlerts,
			...orphanedTransferAlerts,
			...lisaAlerts,
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

		const [debtPayoffAlerts, boeRateAlerts, lisaAlerts] = await Promise.all([
			checkDebtPayoffAlerts(userId),
			checkBoERateAlerts(userId),
			checkLISAAlerts(userId),
		]);

		const allAlerts = [...allAccountAlerts, ...debtPayoffAlerts, ...boeRateAlerts, ...lisaAlerts];

		// Find the target account to get its slug for filtering
		const targetAccount = allAccounts.find((a) => a.id === accountId);
		if (!targetAccount) return [];

		return allAlerts.filter((a) => a.accountSlug === targetAccount.slug);
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
		const [goalAlerts, autoReduceAlerts] = await Promise.all([
			checkGoalAlerts(userId),
			checkGoalAutoReduceAlerts(userId),
		]);
		return [...goalAlerts, ...autoReduceAlerts];
	} catch (err) {
		logError('getGoalListAlerts', 'Failed to compute goal alerts', { userId, err });
		return [];
	}
}
