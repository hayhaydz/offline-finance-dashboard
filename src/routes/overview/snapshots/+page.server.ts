import { redirect } from "@sveltejs/kit";
import { count, desc, eq } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { devLog, logError } from "$lib/server/logger";
import { getMostRecentDate, getStaleness } from "$lib/utils/staleness";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		logError("snapshots", "Authentication required");
		devLog("snapshots", "Redirecting to login - not authenticated");
		throw redirect(302, "/login");
	}

	devLog("snapshots", "Snapshots page loaded", {
		username: locals.user.username,
		userId: locals.user.id,
	});

	const pageParam = url.searchParams.get("page");
	const page = Math.max(0, pageParam ? parseInt(pageParam, 10) - 1 : 0);

	// Total count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(snapshots)
		.where(eq(snapshots.userId, locals.user.id));

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
		where: withUserFilter(locals.user.id, snapshots),
		orderBy: [desc(snapshots.snapshotDate)],
		limit: PAGE_SIZE,
		offset: safeOffset,
	});

	devLog("snapshots", "Snapshots loaded", {
		count: snapshotsList.length,
		page: safePage,
		totalPages,
	});

	const snapshotDates = snapshotsList.map((s) => new Date(s.snapshotDate));
	const mostRecentSnapshotDate = getMostRecentDate(snapshotDates);
	const staleness = getStaleness(mostRecentSnapshotDate);

	return {
		user: locals.user,
		snapshots: snapshotsList,
		page: safePage,
		totalPages,
		staleness,
	};
};
