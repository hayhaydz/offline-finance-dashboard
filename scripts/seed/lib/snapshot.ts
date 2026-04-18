import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../../../src/lib/db/schema/index";
import { calculateProjectedInterestInCents } from "../../../src/lib/utils/tax-year-utils.js";
import type { DB } from "./db.js";
import { slug } from "./helpers.js";

export interface SnapshotOptions {
	/** Override goalsBreakdown to empty array */
	emptyGoals?: boolean;
	/** Force net worth to a negative value regardless of computed result */
	forceNegative?: boolean;
	/** Account slugs to mark as includedInTotal: false in the breakdown */
	forceExcludeAccountSlugs?: string[];
	/** Override using account names (not slugs) since slugs are randomly generated */
	interestOverrideByName?: Record<
		string,
		{
			actualInterest?: number;
			projectedInterest?: number;
		}
	>;
	isaAllowanceOverride?: {
		usedThisTaxYear?: number;
	};
}

export async function createSnapshot(
	db: DB,
	userId: number,
	date: string,
	multiplier: number,
	notes: string | null,
	opts: SnapshotOptions = {},
): Promise<void> {
	const allAccounts = await db.query.accounts.findMany({
		where: eq(schema.accounts.userId, userId),
	});
	const accountIds = allAccounts.map((a) => a.id);
	const allTransactions = await db.query.accountTransactions.findMany({
		columns: { accountId: true, amount: true },
	});
	const balanceByAccount = new Map<number, number>();
	for (const id of accountIds) balanceByAccount.set(id, 0);
	for (const tx of allTransactions) {
		balanceByAccount.set(
			tx.accountId,
			(balanceByAccount.get(tx.accountId) ?? 0) + tx.amount,
		);
	}

	// Fetch interest rates for all user accounts
	const allInterestRates = await db.query.interestRates.findMany({
		where:
			accountIds.length > 0
				? inArray(schema.interestRates.accountId, accountIds)
				: undefined,
	});

	// Build map of most recent rate per account
	const latestRateByAccount = new Map<
		number,
		{ rate: number; effectiveFrom: Date }
	>();
	if (allInterestRates.length > 0) {
		// Group by account and find most recent rate for each
		for (const accountId of accountIds) {
			const accountRates = allInterestRates.filter(
				(r) => r.accountId === accountId,
			);
			if (accountRates.length > 0) {
				// Sort by effectiveFrom descending to get most recent
				accountRates.sort(
					(a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
				);
				latestRateByAccount.set(accountId, {
					rate: accountRates[0].rate,
					effectiveFrom: accountRates[0].effectiveFrom,
				});
			}
		}
	}

	const allGoals = await db.query.goals.findMany({
		where: and(eq(schema.goals.userId, userId), isNull(schema.goals.deletedAt)),
	});

	const openAccounts = allAccounts.filter((a) => !a.closedAt);
	const forceExclude = new Set(opts.forceExcludeAccountSlugs ?? []);

	const accountsWithBalance = openAccounts.map((a) => ({
		...a,
		adjustedBalance: Math.round((balanceByAccount.get(a.id) ?? 0) * multiplier),
	}));

	// Preserve existing behaviour: totals include all open accounts (including excluded ones)
	const totalAssets = accountsWithBalance
		.filter((a) => a.category === "asset")
		.reduce((sum, a) => sum + a.adjustedBalance, 0);

	const totalLiabilities = accountsWithBalance
		.filter((a) => a.category === "liability")
		.reduce((sum, a) => sum + a.adjustedBalance, 0);

	let netWorth = totalAssets + totalLiabilities;
	if (opts.forceNegative && netWorth >= 0) {
		netWorth = -(Math.abs(netWorth) + 50000);
	}

	const goalsForBreakdown = opts.emptyGoals
		? []
		: allGoals.map((g) => ({
				...g,
				adjustedAllocation: Math.round(g.currentAllocation * multiplier),
			}));

	const totalAllocated = goalsForBreakdown.reduce(
		(sum, g) => sum + g.adjustedAllocation,
		0,
	);

	// Build interest breakdown for all open accounts
	const interestBreakdownAccounts = openAccounts.map((a) => {
		const rateInfo = latestRateByAccount.get(a.id);
		return {
			accountId: a.id,
			accountSlug: a.slug,
			name: a.name,
			currentRate: rateInfo?.rate ?? null,
			effectiveFrom: rateInfo?.effectiveFrom.toISOString() ?? null,
		};
	});

	// Build ISA and interest breakdown for seed script
	// Note: This is simplified - uses current rates, not historical
	const isaAccounts = openAccounts.filter(
		(a) => a.taxWrapper === "isa" || a.taxWrapper === "lisa",
	);
	const snapshotDateObj = new Date(date);
	const taxYearStartYear =
		snapshotDateObj.getUTCMonth() < 3 ||
		(snapshotDateObj.getUTCMonth() === 3 && snapshotDateObj.getUTCDate() < 6)
			? snapshotDateObj.getUTCFullYear() - 1
			: snapshotDateObj.getUTCFullYear();
	const isaTaxYearStart = new Date(Date.UTC(taxYearStartYear, 3, 6)); // April 6
	const isaTaxYearEnd = new Date(Date.UTC(taxYearStartYear + 1, 3, 5)); // April 5

	// Simplified ISA calculation for seed (no actual transaction history)
	const isaUsedThisYear = isaAccounts.reduce(
		(sum, a) => sum + Math.max(0, balanceByAccount.get(a.id) ?? 0),
		0,
	);

	// Build interest breakdown for seed using realistic calculations
	// Approximates actual interest from tax year start to snapshot date,
	// and projected interest from snapshot date to tax year end
	const interestByAccount: Array<{
		accountId: number;
		accountSlug: string;
		name: string;
		taxWrapper: string;
		actualInterestEarned: number;
		projectedInterest: number;
		currentRate: number | null;
		balanceInCents: number;
	}> = [];

	// Helper to check if tax wrapper is tax-free
	const isTaxFree = (taxWrapper: string): boolean => {
		return (
			taxWrapper === "isa" ||
			taxWrapper === "lisa" ||
			taxWrapper === "premium-bonds"
		);
	};

	for (const account of openAccounts) {
		const rateInfo = latestRateByAccount.get(account.id);
		const balance = balanceByAccount.get(account.id) ?? 0;
		const rate = rateInfo?.rate ?? null;

		// Match interest eligibility rules (skip invalid accounts)
		if (account.type !== "savings" && account.type !== "investment") {
			continue;
		}
		if (balance <= 0) {
			continue;
		}
		if (rate === null || rate === 0) {
			continue;
		}
		if (account.maturityDate) {
			const maturityDate = new Date(account.maturityDate);
			if (maturityDate > isaTaxYearEnd) {
				continue;
			}
			if (maturityDate <= snapshotDateObj) {
				continue;
			}
		}

		let actualInterest = 0;
		let projectedInterest = 0;

		// Handle fixed-term bonds with maturity dates
		if (account.maturityDate) {
			const maturityDate = new Date(account.maturityDate);
			// Matures within tax year - actual for elapsed, projected until maturity
			actualInterest = calculateProjectedInterestInCents({
				balanceInCents: balance,
				rateBasisPoints: rate,
				fromDate: isaTaxYearStart,
				toDate: snapshotDateObj,
			});
			projectedInterest = calculateProjectedInterestInCents({
				balanceInCents: balance,
				rateBasisPoints: rate,
				fromDate: snapshotDateObj,
				toDate: maturityDate,
			});
		} else {
			// Standard access account - calculate actual and projected
			actualInterest = calculateProjectedInterestInCents({
				balanceInCents: balance,
				rateBasisPoints: rate,
				fromDate: isaTaxYearStart,
				toDate: snapshotDateObj,
			});
			projectedInterest = calculateProjectedInterestInCents({
				balanceInCents: balance,
				rateBasisPoints: rate,
				fromDate: snapshotDateObj,
				toDate: isaTaxYearEnd,
			});
		}

		interestByAccount.push({
			accountId: account.id,
			accountSlug: account.slug,
			name: account.name,
			taxWrapper: account.taxWrapper,
			actualInterestEarned: actualInterest,
			projectedInterest: projectedInterest,
			currentRate: rate,
			balanceInCents: balance,
		});
	}

	// Calculate totals for interest summary
	let actualTaxFree = 0;
	let actualTaxable = 0;
	let projectedTaxFree = 0;
	let projectedTaxable = 0;

	for (const account of interestByAccount) {
		if (isTaxFree(account.taxWrapper)) {
			actualTaxFree += account.actualInterestEarned;
			projectedTaxFree += account.projectedInterest;
		} else {
			actualTaxable += account.actualInterestEarned;
			projectedTaxable += account.projectedInterest;
		}
	}

	// Apply overrides by account name if provided
	if (opts.interestOverrideByName) {
		const accountMapByName = new Map(interestByAccount.map((a) => [a.name, a]));

		for (const [accountName, override] of Object.entries(
			opts.interestOverrideByName,
		)) {
			const account = accountMapByName.get(accountName);
			if (account) {
				if (override.actualInterest !== undefined) {
					account.actualInterestEarned = override.actualInterest;
				}
				if (override.projectedInterest !== undefined) {
					account.projectedInterest = override.projectedInterest;
				}
			}
		}

		// Recalculate totals after overrides
		let newActualTaxFree = 0;
		let newActualTaxable = 0;
		let newProjectedTaxFree = 0;
		let newProjectedTaxable = 0;

		for (const account of interestByAccount) {
			if (isTaxFree(account.taxWrapper)) {
				newActualTaxFree += account.actualInterestEarned;
				newProjectedTaxFree += account.projectedInterest;
			} else {
				newActualTaxable += account.actualInterestEarned;
				newProjectedTaxable += account.projectedInterest;
			}
		}

		actualTaxFree = newActualTaxFree;
		actualTaxable = newActualTaxable;
		projectedTaxFree = newProjectedTaxFree;
		projectedTaxable = newProjectedTaxable;
	}

	// Apply ISA allowance override if provided
	let isaUsed = isaUsedThisYear;
	if (opts.isaAllowanceOverride?.usedThisTaxYear !== undefined) {
		isaUsed = opts.isaAllowanceOverride.usedThisTaxYear;
	}

	// Build separate breakdown structures for new schema
	const isaBreakdown = {
		snapshotTakenAt: new Date().toISOString(),
		snapshotDate: date,
		taxYear: {
			start: isaTaxYearStart.toISOString().split("T")[0],
			end: isaTaxYearEnd.toISOString().split("T")[0],
			label: `${isaTaxYearStart.getUTCFullYear()}-${String(isaTaxYearEnd.getUTCFullYear()).slice(-2)}`,
		},
		allowance: {
			usedThisTaxYear: isaUsed,
			limit: 20_000_00, // £20,000 in cents
			remaining: Math.max(0, 20_000_00 - isaUsed),
			usedThisSnapshotDate: isaUsed, // Simplified - no cumulative tracking
		},
	};

	const interestBreakdownDetail = {
		snapshotTakenAt: new Date().toISOString(),
		snapshotDate: date,
		taxYear: {
			start: isaTaxYearStart.toISOString().split("T")[0],
			end: isaTaxYearEnd.toISOString().split("T")[0],
			label: `${isaTaxYearStart.getUTCFullYear()}-${String(isaTaxYearEnd.getUTCFullYear()).slice(-2)}`,
		},
		actualInterest: {
			taxFree: actualTaxFree,
			taxable: actualTaxable,
			total: actualTaxFree + actualTaxable,
		},
		projectedInterest: {
			taxFree: projectedTaxFree,
			taxable: projectedTaxable,
			total: projectedTaxFree + projectedTaxable,
		},
		totalExpected: {
			taxFree: actualTaxFree + projectedTaxFree,
			taxable: actualTaxable + projectedTaxable,
			total:
				actualTaxFree + actualTaxable + projectedTaxFree + projectedTaxable,
		},
		taxPosition: {
			taxBand: "basic",
			personalSavingsAllowance: {
				allowance: 1_000_00,
				used: actualTaxable,
				remaining: Math.max(0, 1_000_00 - actualTaxable),
				overAllowance: actualTaxable > 1_000_00,
				taxableAmount: Math.max(0, actualTaxable - 1_000_00),
			},
		},
		byAccount: interestByAccount,
	};

	await db.insert(schema.snapshots).values({
		slug: slug(),
		userId,
		snapshotDate: date,
		netWorthInCents: netWorth,
		totalAssetsInCents: totalAssets,
		totalLiabilitiesInCents: totalLiabilities,
		totalAllocatedInCents: totalAllocated,
		accountsBreakdown: {
			snapshotTakenAt: new Date().toISOString(),
			accounts: accountsWithBalance.map((a) => ({
				accountId: a.id,
				accountSlug: a.slug,
				name: a.name,
				type: a.type,
				category: a.category as "asset" | "liability",
				taxWrapper: a.taxWrapper as "none" | "isa" | "lisa" | "premium-bonds",
				balanceInCents: a.adjustedBalance,
				includedInTotal: !a.excludedFromNetWorth && !forceExclude.has(a.slug),
				maturityDate: a.maturityDate ? a.maturityDate.toISOString() : null,
			})),
			totalByType: accountsWithBalance.reduce(
				(acc, a) => {
					acc[a.type] = (acc[a.type] || 0) + a.adjustedBalance;
					return acc;
				},
				{} as Record<string, number>,
			),
		},
		interestBreakdown: {
			snapshotTakenAt: new Date().toISOString(),
			accounts: interestBreakdownAccounts,
		},
		goalsBreakdown: {
			goals: goalsForBreakdown.map((g) => ({
				goalId: g.id,
				goalSlug: g.slug,
				name: g.name,
				targetAmountInCents: g.targetAmountInCents,
				currentAllocation: g.adjustedAllocation,
				isEmergencyFund: g.isEmergencyFund,
			})),
			totalAllocated,
		},
		isaBreakdown,
		interestBreakdownDetail,
		notes,
	});
}
