/**
 * Snapshot Breakdown Utilities
 *
 * Shared calculation functions for ISA allowance and interest breakdown data
 * that gets stored in snapshots. Used by both manual snapshot creation and
 * seed script to ensure consistent point-in-time data.
 *
 * UK tax year: 6 April to 5 April (inclusive)
 * ISA allowance: £20,000 per tax year
 */

import type { Account } from "$lib/db/schema";
import {
	getCumulativeISADeposits,
	getISAAllowanceUsed,
	getTaxFreeStatus,
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
	type TaxBand,
} from "$lib/server/calculations";
import {
	getActualInterestBreakdown,
	getProjectedInterestBreakdown,
} from "$lib/server/interestBreakdown";
import { devLog } from "$lib/server/logger";

/**
 * ISA allowance breakdown for snapshot storage (standalone with metadata)
 */
export interface ISAAllowanceBreakdown {
	snapshotTakenAt: string; // ISO timestamp when calculated
	snapshotDate: string; // YYYY-MM-DD of snapshot

	// Tax year context
	taxYear: {
		start: string; // ISO date (April 6)
		end: string; // ISO date (April 5)
		label: string; // e.g., "2024-25"
	};

	// ISA allowance data
	allowance: {
		usedThisTaxYear: number; // Deposits in tax year up to snapshot date (cents)
		limit: number; // 20,000,000 (£20k in cents)
		remaining: number; // limit - usedThisTaxYear
		usedThisSnapshotDate: number; // All deposits since account opening (cents)
	};
}

/**
 * Tax position at snapshot time
 */
export interface SnapshotTaxPosition {
	taxBand: TaxBand;
	personalSavingsAllowance: {
		allowance: number; // 1,000,000 (basic), 500,000 (higher), 0 (additional)
		used: number; // From taxable interest
		remaining: number;
		overAllowance: boolean;
		taxableAmount: number; // Interest exceeding allowance
	};
}

/**
 * Per-account interest data for snapshot storage
 */
export interface SnapshotAccountInterest {
	accountId: number;
	accountSlug: string;
	name: string;
	taxWrapper: "none" | "isa" | "lisa" | "premium-bonds";

	// Interest data
	actualInterestEarned: number; // This tax year (cents)
	projectedInterest: number; // To tax year end (cents)
	currentRate: number | null; // Basis points at snapshot time
	balanceInCents: number; // Balance at snapshot time (cents)
}

/**
 * Interest breakdown for snapshot storage (standalone with metadata)
 */
export interface InterestBreakdownDetail {
	snapshotTakenAt: string; // ISO timestamp when calculated
	snapshotDate: string; // YYYY-MM-DD of snapshot

	// Tax year context
	taxYear: {
		start: string; // ISO date (April 6)
		end: string; // ISO date (April 5)
		label: string; // e.g., "2024-25"
	};

	// Actual interest earned this tax year
	actualInterest: {
		taxFree: number; // ISA, LISA, Premium Bonds (cents)
		taxable: number; // Regular savings/investment (cents)
		total: number; // cents
	};

	// Projected from snapshot date to tax year end
	projectedInterest: {
		taxFree: number;
		taxable: number;
		total: number;
	};

	// Expected total (actual + projected)
	totalExpected: {
		taxFree: number;
		taxable: number;
		total: number;
	};

	// User's tax position at snapshot time
	taxPosition: SnapshotTaxPosition;

	// Per-account breakdown
	byAccount: SnapshotAccountInterest[];
}

/**
 * Calculate ISA allowance breakdown for snapshot.
 * Returns both tax-year aggregated deposits and cumulative lifetime deposits.
 *
 * @param userId - User ID
 * @param snapshotDate - Date of the snapshot
 * @returns ISA allowance breakdown with metadata
 */
export async function calculateISAAllowanceBreakdown(
	userId: number,
	snapshotDate: Date,
): Promise<ISAAllowanceBreakdown> {
	devLog("calculateISAAllowanceBreakdown", "Calculating ISA allowance", {
		userId,
		snapshotDate,
	});

	// Get tax year bounds for snapshot date
	const { start: taxYearStart, end: taxYearEnd } =
		getUkTaxYearBounds(snapshotDate);

	// Get deposits made this tax year
	const totalISAUsed = await getISAAllowanceUsed(
		userId,
		taxYearStart,
		snapshotDate, // Use snapshot date, not tax year end
	);

	// Get cumulative deposits since account opening
	const usedThisSnapshotDate = await getCumulativeISADeposits(
		userId,
		snapshotDate,
	);

	// Generate tax year label
	const label = `${taxYearStart.getUTCFullYear()}-${String(taxYearEnd.getUTCFullYear()).slice(-2)}`;

	devLog("calculateISAAllowanceBreakdown", "ISA allowance calculated", {
		totalISAUsed,
		usedThisSnapshotDate,
	});

	return {
		snapshotTakenAt: new Date().toISOString(),
		snapshotDate: snapshotDate.toISOString().split("T")[0],
		taxYear: {
			start: taxYearStart.toISOString().split("T")[0],
			end: taxYearEnd.toISOString().split("T")[0],
			label,
		},
		allowance: {
			usedThisTaxYear: totalISAUsed,
			limit: ISA_ALLOWANCE_IN_CENTS,
			remaining: Math.max(0, ISA_ALLOWANCE_IN_CENTS - totalISAUsed),
			usedThisSnapshotDate,
		},
	};
}

/**
 * Calculate interest breakdown for snapshot.
 * Uses getActualInterestBreakdown for consistency with live calculations.
 * Maturity dates are evaluated relative to snapshot date, not current date.
 *
 * @param userId - User ID
 * @param accounts - User's accounts array
 * @param snapshotDate - Date of the snapshot
 * @param taxBand - User's tax band for PSA calculation
 * @returns Interest breakdown for snapshot storage with metadata
 */
export async function calculateInterestBreakdown(
	userId: number,
	_accounts: Account[],
	snapshotDate: Date,
	taxBand: TaxBand,
): Promise<InterestBreakdownDetail> {
	devLog("calculateInterestBreakdown", "Calculating interest breakdown", {
		userId,
		snapshotDate,
		taxBand,
	});

	// Get tax year bounds for snapshot date
	const { start: taxYearStart, end: taxYearEnd } =
		getUkTaxYearBounds(snapshotDate);

	// Get actual interest breakdown (evaluated relative to snapshot date)
	const actual = await getActualInterestBreakdown(
		userId,
		taxYearStart,
		taxYearEnd,
	);

	// Get projected interest breakdown (from snapshot date to tax year end)
	const projected = await getProjectedInterestBreakdown(
		userId,
		taxYearStart,
		taxYearEnd,
		snapshotDate, // Use snapshot date as "as of" date
	);

	// Calculate totals
	const actualTaxFree = actual.taxFreeTotal;
	const actualTaxable = actual.taxableTotal;
	const actualTotal = actual.total;

	const projectedTaxFree = projected.taxFreeTotal;
	const projectedTaxable = projected.taxableTotal;
	const projectedTotal = projected.total;

	// Calculate Personal Savings Allowance status
	const psaStatus = getTaxFreeStatus(actualTaxable + projectedTaxable, taxBand);
	const psaAllowance = psaStatus.allowance;

	// Build per-account breakdown with snapshot-time balances and rates
	const actualByAccount = new Map(
		actual.byAccount.map((account) => [account.accountId, account]),
	);
	const perAccountBreakdown: SnapshotAccountInterest[] = [];

	// Match projected account validity rules (exclude invalid accounts)
	const validProjectedAccounts = projected.byAccount.filter(
		(account) => !account.exclusionReason,
	);

	for (const projectedAccount of validProjectedAccounts) {
		const actualAccount = actualByAccount.get(projectedAccount.accountId);

		perAccountBreakdown.push({
			accountId: projectedAccount.accountId,
			accountSlug: projectedAccount.accountSlug,
			name: actualAccount?.accountName ?? projectedAccount.accountName,
			taxWrapper: (actualAccount?.accountTaxWrapper ??
				projectedAccount.accountTaxWrapper) as
				| "none"
				| "isa"
				| "lisa"
				| "premium-bonds",
			actualInterestEarned: actualAccount?.total ?? 0,
			projectedInterest: projectedAccount.projectedInterest,
			currentRate: projectedAccount.rateBasisPoints ?? null,
			balanceInCents: projectedAccount.balanceInCents,
		});
	}

	// Sort by total interest (actual + projected) descending
	perAccountBreakdown.sort(
		(a, b) =>
			b.actualInterestEarned +
			b.projectedInterest -
			(a.actualInterestEarned + a.projectedInterest),
	);

	// Generate tax year label
	const label = `${taxYearStart.getUTCFullYear()}-${String(taxYearEnd.getUTCFullYear()).slice(-2)}`;

	devLog("calculateInterestBreakdown", "Interest breakdown calculated", {
		actualTotal,
		projectedTotal,
		accountCount: perAccountBreakdown.length,
	});

	return {
		snapshotTakenAt: new Date().toISOString(),
		snapshotDate: snapshotDate.toISOString().split("T")[0],
		taxYear: {
			start: taxYearStart.toISOString().split("T")[0],
			end: taxYearEnd.toISOString().split("T")[0],
			label,
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
			taxBand: taxBand || "basic",
			personalSavingsAllowance: {
				allowance: psaAllowance,
				used: actualTaxable,
				remaining: Math.max(0, psaAllowance - actualTaxable),
				overAllowance: actualTaxable > psaAllowance,
				taxableAmount: Math.max(0, actualTaxable - psaAllowance),
			},
		},
		byAccount: perAccountBreakdown,
	};
}

/**
 * Get tax year bounds for snapshot date.
 * Returns both Date objects and formatted strings for JSON storage.
 *
 * @param date - Reference date
 * @returns Tax year bounds with label
 */
export function getTaxYearBoundsForSnapshot(date: Date): {
	start: Date;
	end: Date;
	label: string;
	formatted: {
		start: string; // ISO date string
		end: string; // ISO date string
	};
} {
	const bounds = getUkTaxYearBounds(date);

	// Generate label like "2024-25"
	const startYear = bounds.start.getUTCFullYear();
	const endYear = bounds.end.getUTCFullYear();
	const label = `${startYear}-${String(endYear).slice(-2)}`;

	return {
		start: bounds.start,
		end: bounds.end,
		label,
		formatted: {
			start: bounds.start.toISOString().split("T")[0],
			end: bounds.end.toISOString().split("T")[0],
		},
	};
}
