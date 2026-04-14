import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import {
	getCurrentBalanceForAccount,
	getCurrentBalancesForAccounts,
} from "$lib/server/derivedBalances";
import { getCurrentRate } from "$lib/server/interestRates";

export const ISA_ALLOWANCE_IN_CENTS = 20_000_00;

export type TaxBand = "basic" | "higher" | "additional";

export interface TaxYearBounds {
	start: Date;
	end: Date;
}

export interface TaxFreeStatus {
	allowance: number;
	used: number;
	remaining: number;
	overAllowance: boolean;
	taxableAmount: number;
}

/**
 * UK tax year runs from 6 April to 5 April (inclusive).
 * Supports passing a Date or a year string like "2024-25".
 */
export function getUkTaxYearBounds(
	input: Date | string = new Date(),
): TaxYearBounds {
	if (typeof input === "string") {
		// Parse "2024-25" or similar
		const match = input.match(/^(\d{4})-(\d{2})$/);
		if (match) {
			const startYear = parseInt(match[1], 10);
			const endYear = startYear + 1;
			// Verify end year match (e.g., 2024-25 -> 2025)
			if (endYear % 100 === parseInt(match[2], 10)) {
				return {
					start: new Date(Date.UTC(startYear, 3, 6, 0, 0, 0, 0)),
					end: new Date(Date.UTC(endYear, 3, 5, 23, 59, 59, 999)),
				};
			}
		}
		// Fallback to Date parsing if string doesn't match format
		return getUkTaxYearBounds(new Date(input));
	}

	const referenceDate = input;
	const year = referenceDate.getUTCFullYear();
	const startThisYear = new Date(Date.UTC(year, 3, 6, 0, 0, 0, 0));

	if (referenceDate >= startThisYear) {
		return {
			start: startThisYear,
			end: new Date(Date.UTC(year + 1, 3, 5, 23, 59, 59, 999)),
		};
	}

	return {
		start: new Date(Date.UTC(year - 1, 3, 6, 0, 0, 0, 0)),
		end: new Date(Date.UTC(year, 3, 5, 23, 59, 59, 999)),
	};
}

/**
 * Projects interest for a period using simple daily pro-rating.
 */
export function calculateProjectedInterestInCents(params: {
	balanceInCents: number;
	rateBasisPoints: number;
	fromDate?: Date;
	toDate: Date;
}): number {
	const { balanceInCents, rateBasisPoints, toDate } = params;
	const fromDate = params.fromDate ?? new Date();

	if (balanceInCents <= 0 || rateBasisPoints <= 0 || toDate <= fromDate) {
		return 0;
	}

	const msPerDay = 24 * 60 * 60 * 1000;
	const daysRemaining = (toDate.getTime() - fromDate.getTime()) / msPerDay;
	const annualInterestInCents = balanceInCents * (rateBasisPoints / 10_000);

	return Math.round(annualInterestInCents * (daysRemaining / 365));
}

/**
 * Sum of deposit transactions on ISA/LISA accounts in a tax year.
 */
export async function getISAAllowanceUsed(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<number> {
	const [result] = await db
		.select({
			total: sql<number>`coalesce(sum(case when ${accountTransactions.amount} > 0 then ${accountTransactions.amount} else 0 end), 0)`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				eq(accounts.userId, userId),
				inArray(accounts.taxWrapper, ["isa", "lisa"]),
				eq(accountTransactions.type, "deposit"),
				gte(accountTransactions.transactionDate, taxYearStart),
				lte(accountTransactions.transactionDate, taxYearEnd),
			),
		);

	return Number(result?.total ?? 0);
}

/**
 * Sum of interest transactions in a tax year across all user accounts.
 */
export async function getActualInterestEarned(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<number> {
	const [result] = await db
		.select({
			total: sql<number>`coalesce(sum(${accountTransactions.amount}), 0)`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				eq(accounts.userId, userId),
				eq(accountTransactions.type, "interest"),
				gte(accountTransactions.transactionDate, taxYearStart),
				lte(accountTransactions.transactionDate, taxYearEnd),
				or(
					isNull(accounts.maturityDate),
					lte(accounts.maturityDate, taxYearEnd),
				),
			),
		);

	return Number(result?.total ?? 0);
}

/**
 * Sum of interest transactions in a tax year, split by tax wrapper.
 * Returns totals for ISA/LISA (tax-free) vs everything else (taxable).
 * Queries ALL user accounts — no pagination.
 */
export async function getActualInterestByTaxWrapper(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<{ taxFree: number; taxable: number }> {
	const results = await db
		.select({
			taxWrapper: accounts.taxWrapper,
			total: sql<number>`coalesce(sum(${accountTransactions.amount}), 0)`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				eq(accounts.userId, userId),
				eq(accountTransactions.type, "interest"),
				gte(accountTransactions.transactionDate, taxYearStart),
				lte(accountTransactions.transactionDate, taxYearEnd),
				or(
					isNull(accounts.maturityDate),
					lte(accounts.maturityDate, taxYearEnd),
				),
			),
		)
		.groupBy(accounts.taxWrapper);

	let taxFree = 0;
	let taxable = 0;
	for (const row of results) {
		if (row.taxWrapper === "isa" || row.taxWrapper === "lisa") {
			taxFree += Number(row.total);
		} else {
			taxable += Number(row.total);
		}
	}
	return { taxFree, taxable };
}

/**
 * Projected interest for remaining tax year, split by tax wrapper.
 * Queries ALL user savings/investment accounts — no pagination.
 */
export async function getProjectedInterestByTaxWrapper(
	userId: number,
	_taxYearStart: Date,
	taxYearEnd: Date,
	today: Date,
): Promise<{ taxFree: number; taxable: number; daysRemaining: number }> {
	const millisecondsPerDay = 24 * 60 * 60 * 1000;
	const daysRemaining = Math.max(
		0,
		Math.ceil(
			(taxYearEnd.getTime() - today.getTime()) / millisecondsPerDay,
		),
	);

	if (daysRemaining === 0) {
		return { taxFree: 0, taxable: 0, daysRemaining: 0 };
	}

	// Fetch ALL savings/investment accounts for this user
	const allAccounts = await db.query.accounts.findMany({
		where: and(
			eq(accounts.userId, userId),
			or(eq(accounts.type, "savings"), eq(accounts.type, "investment")),
		),
	});

	if (allAccounts.length === 0) {
		return { taxFree: 0, taxable: 0, daysRemaining };
	}

	const accountIds = allAccounts.map((a) => a.id);
	const balances = await getCurrentBalancesForAccounts(accountIds);

	let taxFree = 0;
	let taxable = 0;

	for (const account of allAccounts) {
		const balance = balances.get(account.id) ?? 0;
		if (balance <= 0) continue;

		const rate = await getCurrentRate(account.id);
		if (rate === null) continue;

		const yearlyInterest = Math.round((balance * rate) / 10000);
		let projected = 0;

		if (account.maturityDate) {
			if (
				account.maturityDate <= taxYearEnd &&
				account.maturityDate > today
			) {
				const daysToMaturity = Math.ceil(
					(account.maturityDate.getTime() - today.getTime()) /
						millisecondsPerDay,
				);
				projected = Math.round(
					(yearlyInterest / 365) * daysToMaturity,
				);
			}
		} else {
			projected = Math.round((yearlyInterest / 365) * daysRemaining);
		}

		if (account.taxWrapper === "isa" || account.taxWrapper === "lisa") {
			taxFree += projected;
		} else {
			taxable += projected;
		}
	}

	return { taxFree, taxable, daysRemaining };
}

/**
 * Sum of interest transactions in a tax year for a single account.
 */
export async function getAccountInterestEarned(
	accountId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<number> {
	const [result] = await db
		.select({
			total: sql<number>`coalesce(sum(${accountTransactions.amount}), 0)`,
		})
		.from(accountTransactions)
		.where(
			and(
				eq(accountTransactions.accountId, accountId),
				eq(accountTransactions.type, "interest"),
				gte(accountTransactions.transactionDate, taxYearStart),
				lte(accountTransactions.transactionDate, taxYearEnd),
			),
		);

	return Number(result?.total ?? 0);
}

/**
 * Projected interest from now until tax year end for one account.
 * Accounts for fixed-term bonds that mature outside the current tax year.
 */
export async function getProjectedInterest(
	accountId: number,
	taxYearEnd: Date,
): Promise<number> {
	const now = new Date();
	if (taxYearEnd <= now) return 0;

	// Fetch maturity date to ensure we don't project interest for bonds
	// that pay out in a future tax year.
	const [account] = await db
		.select({ maturityDate: accounts.maturityDate })
		.from(accounts)
		.where(eq(accounts.id, accountId));

	if (account?.maturityDate) {
		if (account.maturityDate > taxYearEnd) {
			return 0; // Pays out in a future tax year
		}
		if (account.maturityDate <= now) {
			return 0; // Already matured
		}
	}

	const currentBalance = await getCurrentBalanceForAccount(accountId);
	if (currentBalance <= 0) return 0;

	const currentRate = await getCurrentRate(accountId);
	if (currentRate === null) return 0;

	// If it matures within this tax year, only project up until the maturity date
	const toDate =
		account?.maturityDate && account.maturityDate <= taxYearEnd
			? account.maturityDate
			: taxYearEnd;

	return calculateProjectedInterestInCents({
		balanceInCents: currentBalance,
		rateBasisPoints: currentRate,
		fromDate: now,
		toDate,
	});
}

export function getTaxFreeStatus(
	actualInterest: number,
	taxBand: TaxBand,
): TaxFreeStatus {
	const allowanceByBand: Record<TaxBand, number> = {
		basic: 1_000_00,
		higher: 500_00,
		additional: 0,
	};

	const allowance = allowanceByBand[taxBand];
	const used = Math.max(0, actualInterest);
	const remaining = Math.max(0, allowance - used);
	const taxableAmount = Math.max(0, used - allowance);

	return {
		allowance,
		used,
		remaining,
		overAllowance: used > allowance,
		taxableAmount,
	};
}

/**
 * Cumulative ISA deposits from account opening to asOfDate.
 * Queries all deposit transactions on ISA/LISA accounts for the user.
 *
 * @param userId - User ID
 * @param asOfDate - End date for cumulative calculation (inclusive)
 * @returns Total deposits in cents
 */
export async function getCumulativeISADeposits(
	userId: number,
	asOfDate: Date,
): Promise<number> {
	const [result] = await db
		.select({
			total: sql<number>`coalesce(sum(case when ${accountTransactions.amount} > 0 then ${accountTransactions.amount} else 0 end), 0)`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				eq(accounts.userId, userId),
				inArray(accounts.taxWrapper, ["isa", "lisa"]),
				eq(accountTransactions.type, "deposit"),
				lte(accountTransactions.transactionDate, asOfDate),
			),
		);

	return Number(result?.total ?? 0);
}
