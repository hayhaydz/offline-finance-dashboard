import { desc, eq, inArray, sql } from 'drizzle-orm';
import { withUserFilter } from '$lib/auth/row-security';
import { db } from '$lib/db/client';
import { accountTransactions, accounts, interestRates, users } from '$lib/db/schema';
import { getUkTaxYearBounds } from '$lib/utils/tax-year-utils';
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from '$lib/server/derivedBalances';
import type { AccountRow, RateRow, TxSummary } from './constants';
import { devLog, isVerboseDebug } from "$lib/server/logger";

export interface BulkData {
	allAccounts: AccountRow[];
	openAccounts: AccountRow[];
	rateHistories: Map<number, RateRow[]>;
	txSummaries: Map<number, TxSummary>;
	balances: Map<number, number>;
	latestTxDates: Map<number, Date | null>;
	taxYear: { start: Date; end: Date };
	now: Date;
	taxBand: string;
	hasSavingsAccounts: boolean;
}

export async function fetchBulkData(userId: number): Promise<BulkData> {
	if (isVerboseDebug()) devLog("fetchBulkData", "Fetching bulk data", { userId });
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
		return { allAccounts: [], openAccounts: [], rateHistories: new Map(), txSummaries: new Map(), balances: new Map(), latestTxDates: new Map(), taxYear, now, taxBand: 'basic', hasSavingsAccounts: false };
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
