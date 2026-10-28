import { asc } from "drizzle-orm";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { getBudgetStatus, getCategoryBreakdown } from "$lib/server/budgets";

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
