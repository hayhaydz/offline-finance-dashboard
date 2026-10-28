import { asc } from "drizzle-orm";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";

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
