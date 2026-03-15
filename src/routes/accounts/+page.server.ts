import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, users } from "$lib/db/schema";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";
import { getCurrentRate } from "$lib/server/interestRates";
import { getUkTaxYearBounds } from "$lib/server/calculations";
import {
	getAccountInterestEarned,
	getISAAllowanceUsed,
	getTaxFreeStatus,
	ISA_ALLOWANCE_IN_CENTS,
} from "$lib/server/calculations";
import type { PageServerLoad } from "./$types";

// Helper: Check if account tax wrapper is tax-free (excluded from Personal Savings Allowance)
function isTaxFree(taxWrapper: string): boolean {
	return taxWrapper === 'isa' || taxWrapper === 'lisa' || taxWrapper === 'premium-bonds';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	// Query accounts with user filter
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		orderBy: (accounts, { desc }) => desc(accounts.createdAt),
	});
	const accountIds = userAccounts.map((a) => a.id);
	const [currentBalances, latestTransactionDates] = await Promise.all([
		getCurrentBalancesForAccounts(accountIds),
		getLatestTransactionDateForAccounts(accountIds),
	]);

	// Get requested tax year bounds
	const taxYearParam = url.searchParams.get("taxYearStart");
	const requestedDate = taxYearParam ? new Date(taxYearParam) : new Date();
	// Validate date if param provided
	const validDate = !isNaN(requestedDate.getTime()) ? requestedDate : new Date();
	const taxYear = getUkTaxYearBounds(validDate);

	// Calculate prev/next tax years for navigation
	const prevTaxYearStart = new Date(Date.UTC(taxYear.start.getUTCFullYear() - 1, 3, 6));
	const nextTaxYearStart = new Date(Date.UTC(taxYear.start.getUTCFullYear() + 1, 3, 6));
	const prevTaxYearParam = prevTaxYearStart.toISOString().split("T")[0];
	const nextTaxYearParam = nextTaxYearStart.toISOString().split("T")[0];

	// Fetch interest rates for all accounts
	const accountRates = new Map<number, number | null>();
	for (const account of userAccounts) {
		if (account.type === 'savings' || account.type === 'investment') {
			accountRates.set(account.id, await getCurrentRate(account.id));
		} else {
			accountRates.set(account.id, null);
		}
	}

	// Calculate aggregate interest summary
	const isaAllowanceUsed = await getISAAllowanceUsed(
		locals.user.id,
		taxYear.start,
		taxYear.end,
	);

	// Separate actual interest by tax-free vs taxable accounts
	let actualInterestTaxFree = 0;
	let actualInterestTaxable = 0;
	for (const account of userAccounts) {
		if (account.type === 'savings' || account.type === 'investment') {
			const accountInterest = await getAccountInterestEarned(account.id, taxYear.start, taxYear.end);
			if (isTaxFree(account.taxWrapper)) {
				actualInterestTaxFree += accountInterest;
			} else {
				actualInterestTaxable += accountInterest;
			}
		}
	}

	// Transform data for display
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const millisecondsPerDay = 24 * 60 * 60 * 1000;

	// Calculate days remaining in tax year
	const daysRemainingInTaxYear = Math.max(
		0,
		Math.ceil((taxYear.end.getTime() - today.getTime()) / millisecondsPerDay),
	);

	// Calculate projected interest for each account
	let totalProjectedTaxable = 0;
	let totalProjectedTaxFree = 0;

	const accountsWithInterest = userAccounts.map((account) => {
		const rate = accountRates.get(account.id) ?? null;
		const balance = currentBalances.get(account.id) ?? 0;

		// 1. DISPLAY VALUES: Theoretical monthly/yearly earning rates (keep these for the UI table)
		const monthlyInterest = rate !== null && balance > 0
			? Math.round(balance * rate / 120000)
			: 0;
		const yearlyInterest = rate !== null && balance > 0
			? Math.round(balance * rate / 10000)
			: 0;

		// 2. TAX PROJECTION VALUES: What actually pays out before April 5th?
		let projectedForRestOfTaxYear = 0;

		if (rate !== null && balance > 0) {
			if (account.maturityDate) {
				// Fixed-term bond: only count if it matures THIS tax year
				if (account.maturityDate <= taxYear.end && account.maturityDate > today) {
					// Matures this tax year! Pro-rate the remaining days until maturity.
					const daysToMaturity = Math.ceil((account.maturityDate.getTime() - today.getTime()) / millisecondsPerDay);
					projectedForRestOfTaxYear = Math.round((yearlyInterest / 365) * daysToMaturity);
				}
			} else {
				// Standard access account: prorate for the remaining days in the current tax year
				projectedForRestOfTaxYear = Math.round((yearlyInterest / 365) * daysRemainingInTaxYear);
			}
		}

		// 3. ADD TO TOTALS: Use the prorated/maturity-checked value, NOT the full yearly value
		if (isTaxFree(account.taxWrapper)) {
			totalProjectedTaxFree += projectedForRestOfTaxYear;
		} else {
			totalProjectedTaxable += projectedForRestOfTaxYear;
		}

		return {
			id: account.id,
			slug: account.slug,
			name: account.name,
			type: account.type,
			category: account.category,
			taxWrapper: account.taxWrapper,
			institution: account.institution,
			liquidity: account.liquidity,
			closedAt: account.closedAt,
			excludedFromNetWorth: account.excludedFromNetWorth,
			maturityDate: account.maturityDate,
			createdAt: account.createdAt,
			updatedAt: account.updatedAt,
			currentBalance: balance,
			lastUpdated: latestTransactionDates.get(account.id) ?? null,
			daysToMaturity: account.maturityDate
				? Math.ceil((account.maturityDate.getTime() - today.getTime()) / millisecondsPerDay)
				: null,
			currentRate: rate,
			monthlyInterest,
			yearlyInterest,
		};
	});

	// Get user's tax band for allowance calculation
	const userWithTaxBand = await db.query.users.findFirst({
		where: eq(users.id, locals.user.id),
		columns: { taxBand: true }
	});
	const taxBand = userWithTaxBand?.taxBand ?? 'basic';

	// Calculate tax-free status (only taxable accounts count toward allowance)
	const totalExpectedTaxable = actualInterestTaxable + totalProjectedTaxable;
	const totalExpectedTaxFree = actualInterestTaxFree + totalProjectedTaxFree;
	const taxFreeStatusNow = getTaxFreeStatus(actualInterestTaxable, taxBand);
	const taxFreeStatusProjected = getTaxFreeStatus(totalExpectedTaxable, taxBand);

	// Get unique institutions for filtering
	const institutions = Array.from(
		new Set(userAccounts.map((a) => a.institution).filter(Boolean)),
	) as string[];

	return {
		accounts: accountsWithInterest,
		institutions,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
		interestSummary: {
			actualInterestIsa: actualInterestTaxFree,
			actualInterestNonIsa: actualInterestTaxable,
			projectedInterestIsa: totalProjectedTaxFree,
			projectedInterestNonIsa: totalProjectedTaxable,
			totalExpectedIsa: totalExpectedTaxFree,
			totalExpectedNonIsa: totalExpectedTaxable,
			taxBand,
			taxFreeStatusNow,
			taxFreeStatusProjected,
			taxYearStart: taxYear.start,
			taxYearEnd: taxYear.end,
			daysRemainingInTaxYear,
			prevTaxYearParam,
			nextTaxYearParam,
		},
		isaAllowance: {
			used: isaAllowanceUsed,
			limit: ISA_ALLOWANCE_IN_CENTS,
			remaining: Math.max(0, ISA_ALLOWANCE_IN_CENTS - isaAllowanceUsed),
		},
	};
};
