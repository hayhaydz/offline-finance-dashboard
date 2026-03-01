import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { goals, goalAllocations, accounts } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq, sql } from 'drizzle-orm';
import { calculatePerAccountUnallocated, calculateReadyToAssign } from '$lib/server/goals';
import { parseCurrency } from '$lib/utils/currency';
import type { Account } from '$lib/db/schema';

// Extended type for accounts with unallocated and balances
type AccountWithUnallocated = Account & {
	unallocated: number;
	balances: Array<{ balanceInCents: number }>;
};

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		logError('goalsAdd', 'Authentication required');
		redirect(302, '/login');
	}

	// Fetch goal by slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, params.slug)
	});

	if (!goal || goal.deletedAt) {
		logError('goalsAdd', 'Goal not found', { slug: params.slug });
		error(404, 'Goal not found');
	}

	validateUserAccess(goal, locals.user, 'Goal');

	// Fetch user's asset accounts with unallocated balances
	const accountsWithUnallocated = await calculatePerAccountUnallocated({
		userId: locals.user.id
	}) as AccountWithUnallocated[];

	// Calculate Ready to Assign for preview
	const { readyToAssign, totalAssets } = await calculateReadyToAssign({
		userId: locals.user.id
	});

	devLog('goalsAdd', 'Loaded add money page', {
		goalId: goal.id,
		goalSlug: goal.slug,
		availableAccounts: accountsWithUnallocated.length,
		readyToAssign,
		totalAssets
	});

	return {
		goal,
		accounts: accountsWithUnallocated,
		totalAssets,
		readyToAssign
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError('goalsAdd', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('goalsAdd', Object.fromEntries(formData));

		const amountStr = formData.get('amount') as string;
		const fromAccountId = formData.get('from_account_id') as string;

		// Server-side validation
		const errors: Record<string, string> = {};

		if (!fromAccountId) {
			errors.from_account_id = 'Please select an account';
		}

		// Parse and validate amount
		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountStr);
			if (amountInCents <= 0) {
				errors.amount = 'Amount must be greater than zero';
			}
		} catch (e) {
			errors.amount = 'Invalid amount format. Enter amount like 100.00 or 100';
			// Set a default value to avoid "used before assigned" error
			// This won't be used because we return early
			amountInCents = 0;
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { error: 'Please fix errors below', errors });
		}

		// Validate goal exists and belongs to user
		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug)
		});

		if (!goal || goal.deletedAt) {
			logError('goalsAdd', 'Goal not found', { slug: params.slug });
			return fail(404, { error: 'Goal not found' });
		}

		validateUserAccess(goal, locals.user, 'Goal');

		// Fetch account with balances
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, parseInt(fromAccountId)),
			with: {
				balances: {
					orderBy: (balances, { desc }) => desc(balances.asOfDate),
					limit: 1
				}
			}
		});

		if (!account) {
			errors.from_account_id = 'Account not found';
			return fail(400, { error: 'Please fix errors below', errors });
		}

		// Validate account has sufficient unallocated
		const accountAllocations = await db
			.select({ sum: sql<number>`cast(sum(abs(${goalAllocations.amount})) as integer)` })
			.from(goalAllocations)
			.where(eq(goalAllocations.accountId, account.id));

		const totalAllocated = accountAllocations[0]?.sum || 0;
		const accountBalance = account.balances[0]?.balanceInCents || 0;
		const unallocated = accountBalance - totalAllocated;

		if (unallocated < amountInCents) {
			errors.amount = `Insufficient funds. Only £${(unallocated / 100).toFixed(2)} available in this account`;
			return fail(400, { error: 'Please fix errors below', errors });
		}

		// Insert allocation record (positive for USER_ADD)
		await db.insert(goalAllocations).values({
			goalId: goal.id,
			accountId: account.id,
			amount: amountInCents,
			type: 'USER_ADD',
			allocationDate: new Date(),
			createdAt: new Date()
		});

		// Update goal.current_allocation
		const newAllocation = goal.currentAllocation + amountInCents;
		await db
			.update(goals)
			.set({ currentAllocation: newAllocation, updatedAt: new Date() })
			.where(eq(goals.id, goal.id));

		devLog('goalsAdd', 'Allocation added', {
			goalId: goal.id,
			amount: amountInCents,
			newAllocation
		});

		// Redirect to goals list (no success modal per user decision)
		redirect(303, `/goals/${params.slug}`);
	}
};
