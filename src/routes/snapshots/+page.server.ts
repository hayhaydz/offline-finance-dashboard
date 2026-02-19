import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { snapshots } from '$lib/db/schema';
import { withUserFilter } from '$lib/auth/row-security';
import { desc } from 'drizzle-orm';
import { devLog, logError } from '$lib/utils/logger';
import { getStaleness, getMostRecentDate } from '$lib/utils/staleness';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		logError('snapshots', 'Authentication required');
		devLog('snapshots', 'Redirecting to login - not authenticated');
		throw redirect(302, '/login');
	}

	devLog('snapshots', 'Snapshots page loaded', {
		username: locals.user.username,
		userId: locals.user.id
	});

	// Pagination from URL params
	const offsetParam = url.searchParams.get('offset');
	const limitParam = url.searchParams.get('limit');
	const offset = offsetParam ? parseInt(offsetParam) : 0;
	const limit = limitParam ? parseInt(limitParam) : 25;

	// Fetch snapshots with pagination (fetch one extra to check if more exist)
	const allSnapshots = await db.query.snapshots.findMany({
		where: withUserFilter(locals.user.id, snapshots),
		orderBy: [desc(snapshots.snapshotDate)],
		limit: limit + 1,
		offset
	});

	const hasMore = allSnapshots.length > limit;
	const snapshotsList = hasMore ? allSnapshots.slice(0, limit) : allSnapshots;

	devLog('snapshots', 'Snapshots loaded', {
		count: snapshotsList.length,
		hasMore,
		offset
	});

	// Calculate staleness based on most recent snapshot date
	const snapshotDates = snapshotsList.map((s) => new Date(s.snapshotDate));
	const mostRecentSnapshotDate = getMostRecentDate(snapshotDates);
	const staleness = getStaleness(mostRecentSnapshotDate);

	return {
		user: locals.user,
		snapshots: snapshotsList,
		hasMore,
		offset,
		limit,
		staleness
	};
};
