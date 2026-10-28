import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, goals } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { getCurrentBalancesForAccounts } from "$lib/server/derivedBalances";
import { getCurrentRatesForAccounts } from "$lib/server/interestRates";
import { bandForTaxYear } from "$lib/server/tax-bands";
import { getInterestReport } from "$lib/server/reports";
import {
	getPsaAllowanceInCents,
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
	type TaxBand,
} from "$lib/utils/tax-year-utils";

/**
 * Tools module data (Phase 6): one typed loader feeding all four tools.
 * Everything is assembled from existing engines — balances
 * (derivedBalances), effective interest rates (interestRates), the tax
 * band + PSA (tax-bands / tax-year-utils), the interest forecast
 * (reports.getInterestReport) and the debt-goal assembly pattern from the
 * Goals page. The client does the what-if math (utils/tool-math.ts);
 * this file never computes scenarios.
 */

export interface SavingsAccountToolData {
	name: string;
	slug: string;
	/** "isa" → interest is tax-free; anything else taxable */
	taxWrapper: string;
	balanceInCents: number;
	/** current effective rate in basis points (null = none recorded) */
	rateBasisPoints: number | null;
}

export interface DebtToolData {
	goalId: number;
	name: string;
	balanceInCents: number;
	minimumMonthlyInCents: number;
	/** linked account's current rate in bp (null → treated as 0%) */
	aprBasisPoints: number | null;
}

export interface ToolsData {
	savingsAccounts: SavingsAccountToolData[];
	debtGoals: DebtToolData[];
	taxYearLabel: string;
	band: TaxBand;
	psaAllowanceInCents: number;
	/** actual + projected taxable interest this tax year (ISA baseline) */
	forecastTaxableInterestInCents: number;
	/** remaining ISA subscription room this tax year (£20,000 cap) */
	isaRoomInCents: number;
}

/** £20,000 annual ISA subscription limit (UK, per tax year) — re-exported
 *  from tax-year-utils for the tools UI. Subscription history per tax year
 *  is not modelled yet, so the optimiser offers the full allowance as room
 *  (stated honestly in the UI). */
export const ISA_ANNUAL_LIMIT_PENCE = ISA_ALLOWANCE_IN_CENTS;

export async function getToolsData(userId: number): Promise<ToolsData> {
	const taxYear = getUkTaxYearBounds(new Date());
	const taxYearLabel = `${taxYear.start.getUTCFullYear()}/${String(
		(taxYear.start.getUTCFullYear() + 1) % 100,
	).padStart(2, "0")}`;

	const [savingsRows, debtGoals, bandResolution, interestReport] =
		await Promise.all([
			db.query.accounts.findMany({
				where: and(
					withUserFilter(userId, accounts),
					isNull(accounts.deletedAt),
					eq(accounts.type, "savings"),
				),
				columns: {
					id: true,
					name: true,
					slug: true,
					taxWrapper: true,
				},
			}),
			db.query.goals.findMany({
				where: and(
					withUserFilter(userId, goals),
					eq(goals.goalType, "debt"),
					isNull(goals.deletedAt),
				),
				with: {
					linkedAccount: {
						columns: { id: true, minimumPaymentFlat: true },
					},
				},
			}),
			bandForTaxYear(
				userId,
				`${taxYear.start.getUTCFullYear()}/${String(
					(taxYear.start.getUTCFullYear() + 1) % 100,
				).padStart(2, "0")}`,
			),
			getInterestReport(userId),
		]);

	const savingsIds = savingsRows.map((a) => a.id);
	const debtAccountIds = debtGoals.flatMap((g) =>
		g.linkedAccountId !== null ? [g.linkedAccountId] : [],
	);

	const [savingsBalances, savingsRates, debtBalances, debtRates] =
		await Promise.all([
			getCurrentBalancesForAccounts(savingsIds),
			getCurrentRatesForAccounts(savingsIds),
			getCurrentBalancesForAccounts(debtAccountIds),
			getCurrentRatesForAccounts(debtAccountIds),
		]);

	const savingsAccounts: SavingsAccountToolData[] = savingsRows
		.map((a) => ({
			name: a.name,
			slug: a.slug,
			taxWrapper: a.taxWrapper,
			balanceInCents: savingsBalances.get(a.id) ?? 0,
			rateBasisPoints: savingsRates.get(a.id) ?? null,
		}))
		.sort((a, b) => b.balanceInCents - a.balanceInCents);

	const debtGoalsData: DebtToolData[] = debtGoals.flatMap((g) => {
		if (g.linkedAccountId === null) return [];
		return [
			{
				goalId: g.id,
				name: g.name,
				balanceInCents: Math.abs(debtBalances.get(g.linkedAccountId) ?? 0),
				minimumMonthlyInCents: Math.max(
					g.linkedAccount?.minimumPaymentFlat ?? 0,
					0,
				),
				aprBasisPoints: debtRates.get(g.linkedAccountId) ?? null,
			},
		];
	});

	// ISA room: per-tax-year subscription history is not modelled, so the
	// optimiser offers the full allowance and says so in the UI.
	const isaRoomInCents = ISA_ALLOWANCE_IN_CENTS;

	return {
		savingsAccounts,
		debtGoals: debtGoalsData,
		taxYearLabel,
		band: bandResolution.band,
		psaAllowanceInCents: getPsaAllowanceInCents(bandResolution.band),
		forecastTaxableInterestInCents: interestReport.forecastTaxableInCents,
		isaRoomInCents,
	};
}

