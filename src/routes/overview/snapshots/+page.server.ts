import { count, desc, eq } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { devLog, isVerboseDebug } from "$lib/server/logger";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getMostRecentDate, getStaleness } from "$lib/utils/staleness";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireAuth(locals);

	if (isVerboseDebug()) {
		devLog("snapshots", "Snapshots page loaded", {
			username: user.username,
			userId: user.id,
		});
	}

	const pageParam = url.searchParams.get("page");
	const page = Math.max(0, pageParam ? parseInt(pageParam, 10) - 1 : 0);

	// Total count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(snapshots)
		.where(eq(snapshots.userId, user.id));

	const totalPages = Math.ceil(total / PAGE_SIZE);
	const safePage = Math.min(page, Math.max(0, totalPages - 1));
	const safeOffset = safePage * PAGE_SIZE;

	const snapshotsList = await db.query.snapshots.findMany({
		columns: {
			slug: true,
			snapshotDate: true,
			netWorthInCents: true,
			totalAssetsInCents: true,
			totalLiabilitiesInCents: true,
		},
		where: withUserFilter(user.id, snapshots),
		orderBy: [desc(snapshots.snapshotDate)],
		limit: PAGE_SIZE,
		offset: safeOffset,
	});

	if (isVerboseDebug()) {
		devLog("snapshots", "Snapshots loaded", {
			count: snapshotsList.length,
			page: safePage,
			totalPages,
		});
	}

	const snapshotDates = snapshotsList.map((s) => new Date(s.snapshotDate));
	const mostRecentSnapshotDate = getMostRecentDate(snapshotDates);
	const staleness = getStaleness(mostRecentSnapshotDate);

	return {
		user,
		snapshots: snapshotsList,
		page: safePage,
		totalPages,
		staleness,
	};
};
