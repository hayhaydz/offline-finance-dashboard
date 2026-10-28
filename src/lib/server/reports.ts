import { asc, and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { goals, snapshots } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { getBudgetStatus, getCategoryBreakdown } from "$lib/server/budgets";
import { calculateDebtStrategyMetrics } from "$lib/server/debt-strategy";
import { getCurrentBalancesForAccounts } from "$lib/server/derivedBalances";
import { getInterestBreakdownReport } from "$lib/server/interestBreakdown";
import { bandForTaxYear } from "$lib/server/tax-bands";
import { getPsaAllowanceInCents, getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import type { TaxBand } from "$lib/utils/tax-year-utils";

/**
 * Reports module (Phase 4/5): typed server loaders for chart surfaces.
 * Every chart on /overview/reports renders from these — no client-side
 * data fetching, no `any`, RLS via withUserFilter everywhere.
 */

export interface NetWorthPoint {
	/** ISO date only (YYYY-MM-DD) */
	date: string;
	netWorthInCents: number;
	totalAssetsInCents: number;
	totalLiabilitiesInCents: number;
}

/**
 * Full net-worth history, oldest → newest, ALL snapshots (not just the
 * last 12 — the Reports range pickers slice client-side; Phase 5 adds
 * 1y/5y/all filtering). Assets/liabilities carried per point for the
 * stacked-area chart (Phase 5 line 1).
 */
export async function getNetWorthHistory(
	userId: number,
): Promise<NetWorthPoint[]> {
	const rows = await db
		.select({
			date: snapshots.snapshotDate,
			netWorthInCents: snapshots.netWorthInCents,
			totalAssetsInCents: snapshots.totalAssetsInCents,
			totalLiabilitiesInCents: snapshots.totalLiabilitiesInCents,
		})
		.from(snapshots)
		.where(withUserFilter(userId, snapshots))
		.orderBy(asc(snapshots.snapshotDate));

	return rows.map((r) => ({
		date: r.date,
		netWorthInCents: r.netWorthInCents,
		totalAssetsInCents: r.totalAssetsInCents,
		totalLiabilitiesInCents: r.totalLiabilitiesInCents,
	}));
}

export interface MonthlyCategorySpend {
	name: string;
	/** category colour hex (from the user's palette) */
	colour: string;
	spentPence: number;
}

export interface MonthlySpendPoint {
	/** YYYY-MM */
	month: string;
	totalPence: number;
	/** categories sorted by spend desc (uncategorised folded in as its own row) */
	categories: MonthlyCategorySpend[];
}

/**
 * Spending by month for the Reports module (Phase 5 line 2): the last
 * `monthCount` calendar months (current month inclusive), each with the
 * same spend definition as every budget query (getCategoryBreakdown —
 * budget type filter, excluded accounts, refund-aware sum), folded into
 * month totals + per-category rows.
 */
export async function getMonthlySpend(
	userId: number,
	monthCount = 6,
): Promise<MonthlySpendPoint[]> {
	const now = new Date();
	const out: MonthlySpendPoint[] = [];

	for (let i = monthCount - 1; i >= 0; i--) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth() + 1;

		const status = await getBudgetStatus(userId, year, month);
		const breakdown = await getCategoryBreakdown(
			userId,
			year,
			month,
			status.budget,
		);

		const categories: MonthlyCategorySpend[] = breakdown
			.filter((c) => c.spent > 0)
			.map((c) => ({ name: c.name, colour: c.colour, spentPence: c.spent }))
			.sort((a, b) => b.spentPence - a.spentPence);

		out.push({
			month: `${year}-${String(month).padStart(2, "0")}`,
			totalPence: categories.reduce((sum, c) => sum + c.spentPence, 0),
			categories,
		});
	}
	return out;
}

export interface InterestReportData {
	/** e.g. "2026/27" */
	taxYearLabel: string;
	band: TaxBand;
	/** PSA for the band: £1,000 basic / £500 higher / £0 additional */
	psaAllowanceInCents: number;
	actualTaxableInCents: number;
	projectedTaxableInCents: number;
	/** actual + projected taxable */
	forecastTaxableInCents: number;
	actualTaxFreeInCents: number;
	projectedTaxFreeInCents: number;
}

/**
 * Interest report for the CURRENT tax year (Phase 5 line 2): reuses the
 * interest-breakdown engine (actual vs projected, ISA/tax-free split)
 * plus the band-aware PSA allowance for the bullet chart.
 */
export async function getInterestReport(
	userId: number,
): Promise<InterestReportData> {
	const taxYear = getUkTaxYearBounds(new Date());
	const bandResolution = await bandForTaxYear(
		userId,
		`${taxYear.start.getUTCFullYear()}/${String((taxYear.start.getUTCFullYear() + 1) % 100).padStart(2, "0")}`,
	);
	const band = bandResolution.band;

	const report = await getInterestBreakdownReport({
		userId,
		taxYearStart: taxYear.start,
		taxYearEnd: taxYear.end,
		taxBand: band,
	});

	return {
		taxYearLabel: `${taxYear.start.getUTCFullYear()}/${String((taxYear.start.getUTCFullYear() + 1) % 100).padStart(2, "0")}`,
		band,
		psaAllowanceInCents: getPsaAllowanceInCents(band),
		actualTaxableInCents: report.actual.taxableTotal,
		projectedTaxableInCents: report.projected.taxableTotal,
		forecastTaxableInCents:
			report.actual.taxableTotal + report.projected.taxableTotal,
		actualTaxFreeInCents: report.actual.taxFreeTotal,
		projectedTaxFreeInCents: report.projected.taxFreeTotal,
	};
}

export interface DebtReportGoal {
	name: string;
	slug: string;
	remainingInCents: number;
	minimumMonthlyInCents: number;
	projectedPayoffDate: Date | null;
}

export interface DebtReportData {
	totalDebtInCents: number;
	totalMonthlyMinimumInCents: number;
	projectedDebtFreeDate: Date | null;
	/** snowball order (smallest balance first) */
	goals: DebtReportGoal[];
}

/**
 * Debt report (Phase 5 line 2): same engine + assembly as the Goals page
 * strategy panel (debt goals → linked-account balances → minimum payments
 * → calculateDebtStrategyMetrics), surfaced for the Reports waterfall.
 */
export async function getDebtReport(userId: number): Promise<DebtReportData> {
	const debtGoals = await db.query.goals.findMany({
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
	});

	const accountIds = debtGoals.flatMap((g) =>
		g.linkedAccountId !== null ? [g.linkedAccountId] : [],
	);
	const balances =
		accountIds.length > 0
			? await getCurrentBalancesForAccounts(accountIds)
			: new Map<number, number>();

	const inputs = debtGoals.flatMap((g) => {
		if (g.linkedAccountId === null) return [];
		const bal = Math.abs(balances.get(g.linkedAccountId) ?? 0);
		return [
			{
				goalId: g.id,
				slug: g.slug,
				name: g.name,
				remainingInCents: bal,
				aprBasisPoints: null as number | null,
				minimumMonthlyInCents: Math.max(
					g.linkedAccount?.minimumPaymentFlat ?? 0,
					0,
				),
			},
		];
	});

	if (inputs.length === 0) {
		return {
			totalDebtInCents: 0,
			totalMonthlyMinimumInCents: 0,
			projectedDebtFreeDate: null,
			goals: [],
		};
	}

	const metrics = calculateDebtStrategyMetrics(inputs);
	return {
		totalDebtInCents: metrics.totalDebtInCents,
		totalMonthlyMinimumInCents: metrics.totalMonthlyMinimumInCents,
		projectedDebtFreeDate: metrics.projectedDebtFreeDate,
		goals: metrics.snowballOrder.map((g) => ({
			name: g.name,
			slug: g.slug,
			remainingInCents: g.remainingInCents,
			minimumMonthlyInCents: g.minimumMonthlyInCents,
			projectedPayoffDate: g.projectedPayoffDate,
		})),
	};
}
