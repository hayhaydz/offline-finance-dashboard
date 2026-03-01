import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { goals } from '$lib/db/schema';
import { withUserFilter, validateUserAccess } from '$lib/auth/row-security';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq, and, isNull, desc, asc, lt, gt } from 'drizzle-orm';
import { calculateReadyToAssign } from '$lib/server/goals';
import { getStaleness, getMostRecentDate } from '$lib/utils/staleness';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog('goals', 'Unauthenticated user, redirecting to login');
		redirect(302, '/login');
	}

	// Query user's active goals with row-level security
	const userGoals = await db.query.goals.findMany({
		where: and(withUserFilter(locals.user.id, goals), isNull(goals.deletedAt)),
		orderBy: (goals, { asc }) => asc(goals.sortOrder)
	});

	devLog('goals', 'Loaded user goals', { count: userGoals.length });

	// Calculate Ready to Assign (unallocated assets)
	const { readyToAssign, totalAssets, totalAllocated } = await calculateReadyToAssign({
		userId: locals.user.id
	});

	// Calculate staleness based on most recent goal creation/update
	const goalDates = userGoals.map((g) => new Date(g.createdAt));
	const mostRecentGoalDate = getMostRecentDate(goalDates);
	const staleness = getStaleness(mostRecentGoalDate);

	return {
		goals: userGoals,
		readyToAssign,
		totalAssets,
		totalAllocated,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		},
		staleness
	};
};

export const actions: Actions = {
	// Move a goal to a specific index in the sort order
	moveTo: async ({ request, locals }) => {
		if (!locals.user) {
			logError('moveTo', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		const slug = formData.get('slug')?.toString();
		const targetIndexStr = formData.get('targetIndex')?.toString();

		if (!slug || targetIndexStr === undefined) {
			return fail(400, { error: 'Missing parameters' });
		}

		const targetIndex = parseInt(targetIndexStr);
		if (isNaN(targetIndex) || targetIndex < 0) {
			return fail(400, { error: 'Invalid target index' });
		}

		try {
			const allGoals = await db.query.goals.findMany({
				where: and(withUserFilter(locals.user.id, goals), isNull(goals.deletedAt)),
				orderBy: asc(goals.sortOrder)
			});

			const currentIdx = allGoals.findIndex(g => g.slug === slug);
			if (currentIdx === -1) {
				return fail(404, { error: 'Goal not found' });
			}

			validateUserAccess(allGoals[currentIdx], locals.user, 'Goal');

			// Reorder array
			const reordered = [...allGoals];
			const [removed] = reordered.splice(currentIdx, 1);
			const clampedIndex = Math.min(targetIndex, reordered.length);
			reordered.splice(clampedIndex, 0, removed);

			// Persist new sort orders
			for (let i = 0; i < reordered.length; i++) {
				await db.update(goals).set({ sortOrder: i + 1 }).where(eq(goals.id, reordered[i].id));
			}

			devLog('moveTo', 'Goal reordered', { slug, targetIndex });
		} catch (error) {
			logError('moveTo', 'Failed to reorder goal', error);
			return fail(500, { error: 'Failed to reorder goal' });
		}

		redirect(302, '/goals');
	},

	// Move goal up in sort order (swap with goal above)
	moveUp: async ({ request, locals }) => {
		devLog('moveUp', '=== ACTION START ===', { url: request.url, method: request.method });

		if (!locals.user) {
			logError('moveUp', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		devLog('moveUp', 'Raw form entries', {
			entries: Array.from(formData.entries())
		});

		const slug = formData.get('slug')?.toString();
		if (!slug) {
			devLog('moveUp', 'Missing slug in form data - available keys', {
				keys: Array.from(formData.keys())
			});
			return fail(400, { error: 'Goal slug is required' });
		}

		devLog('moveUp', 'Slug extracted', { slug });

		try {
			// Get current goal
			const currentGoal = await db.query.goals.findFirst({
				where: and(eq(goals.slug, slug), withUserFilter(locals.user.id, goals), isNull(goals.deletedAt))
			});

			if (!currentGoal) {
				logError('moveUp', 'Goal not found', { slug });
				return fail(404, { error: 'Goal not found' });
			}

			devLog('moveUp', 'Current goal', {
				slug,
				sortOrder: currentGoal.sortOrder,
				name: currentGoal.name
			});

			// Validate user owns the goal
			try {
				validateUserAccess(currentGoal, locals.user, 'Goal');
			} catch (error) {
				logError('moveUp', 'Access denied', { slug, userId: locals.user.id });
				return fail(403, { error: 'You do not have permission to move this goal' });
			}

			// Get all goals to see the full picture
			const allGoals = await db.query.goals.findMany({
				where: and(withUserFilter(locals.user.id, goals), isNull(goals.deletedAt)),
				orderBy: asc(goals.sortOrder)
			});

			devLog('moveUp', 'All goals for context', {
				count: allGoals.length,
				goals: allGoals.map(g => ({ slug: g.slug, sortOrder: g.sortOrder, name: g.name }))
			});

			// Find goal above (lower sortOrder)
			const goalAbove = await db.query.goals.findFirst({
				where: and(
					withUserFilter(locals.user.id, goals),
					isNull(goals.deletedAt),
					lt(goals.sortOrder, currentGoal.sortOrder)
				),
				orderBy: desc(goals.sortOrder)
			});

			if (!goalAbove) {
				devLog('moveUp', 'No goal found above (at top position)', { slug, currentSortOrder: currentGoal.sortOrder });
			} else {
				devLog('moveUp', 'Found goal above to swap with', {
					current: { slug, sortOrder: currentGoal.sortOrder, name: currentGoal.name },
					above: { slug: goalAbove.slug, sortOrder: goalAbove.sortOrder, name: goalAbove.name }
				});

				// Swap sortOrder values
				const temp = currentGoal.sortOrder;
				await db.update(goals).set({ sortOrder: goalAbove.sortOrder }).where(eq(goals.id, currentGoal.id));
				await db.update(goals).set({ sortOrder: temp }).where(eq(goals.id, goalAbove.id));

				devLog('moveUp', 'Swap complete, redirecting to /goals', {
					slug,
					oldSortOrder: temp,
					newSortOrder: goalAbove.sortOrder
				});
			}
		} catch (error) {
			logError('moveUp', 'Database error during move up', error);
			return fail(500, { error: 'Failed to move goal' });
		}

		// Redirect after successful move (outside try-catch so redirect exception propagates)
		devLog('moveUp', 'Action complete, redirecting to /goals');
		redirect(302, '/goals');
	},

	// Move goal down in sort order (swap with goal below)
	moveDown: async ({ request, locals }) => {
		if (!locals.user) {
			logError('moveDown', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('moveDown', formData);

		const slug = formData.get('slug')?.toString();
		if (!slug) {
			devLog('moveDown', 'Missing slug in form data');
			return fail(400, { error: 'Goal slug is required' });
		}

		try {
			// Get current goal
			const currentGoal = await db.query.goals.findFirst({
				where: and(eq(goals.slug, slug), withUserFilter(locals.user.id, goals), isNull(goals.deletedAt))
			});

			if (!currentGoal) {
				logError('moveDown', 'Goal not found', { slug });
				return fail(404, { error: 'Goal not found' });
			}

			// Validate user owns the goal
			try {
				validateUserAccess(currentGoal, locals.user, 'Goal');
			} catch (error) {
				logError('moveDown', 'Access denied', { slug, userId: locals.user.id });
				return fail(403, { error: 'You do not have permission to move this goal' });
			}

			// Find goal below (higher sortOrder)
			const goalBelow = await db.query.goals.findFirst({
				where: and(
					withUserFilter(locals.user.id, goals),
					isNull(goals.deletedAt),
					gt(goals.sortOrder, currentGoal.sortOrder)
				),
				orderBy: asc(goals.sortOrder)
			});

			if (!goalBelow) {
				devLog('moveDown', 'Goal already at bottom, redirecting', { slug });
			} else {
				// Swap sortOrder values
				const temp = currentGoal.sortOrder;
				await db.update(goals).set({ sortOrder: goalBelow.sortOrder }).where(eq(goals.id, currentGoal.id));
				await db.update(goals).set({ sortOrder: temp }).where(eq(goals.id, goalBelow.id));

				devLog('moveDown', 'Successfully moved goal down', {
					slug,
					swappedWith: goalBelow.slug
				});
			}
		} catch (error) {
			logError('moveDown', 'Database error during move down', error);
			return fail(500, { error: 'Failed to move goal' });
		}

		// Redirect after successful move (outside try-catch so redirect exception propagates)
		redirect(302, '/goals');
	}
};
