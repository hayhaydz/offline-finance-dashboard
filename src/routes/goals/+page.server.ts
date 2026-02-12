import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { goals } from '$lib/db/schema';
import { withUserFilter, validateUserAccess } from '$lib/auth/row-security';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog('goals', 'Unauthenticated user, redirecting to login');
		redirect(302, '/login');
	}

	// Query user's goals with row-level security
	const userGoals = await db.query.goals.findMany({
		where: withUserFilter(locals.user.id, goals),
		orderBy: (goals, { desc }) => desc(goals.createdAt)
	});

	devLog('goals', 'Loaded user goals', { count: userGoals.length });

	return {
		goals: userGoals,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		}
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) {
			logError('goals', 'Authentication required for create');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('goalsCreate', Object.fromEntries(formData));

		const name = formData.get('name') as string;
		const targetAmountStr = formData.get('targetAmount') as string;
		const isEmergencyFund = formData.get('isEmergencyFund') === 'true';
		const targetDateStr = formData.get('targetDate') as string;
		const accountTypeFiltersStr = formData.get('account_type_filters') as string;
		const liquidityFiltersStr = formData.get('liquidity_filters') as string;

		// Server-side validation
		const errors: Record<string, string> = {};

		// Name: required, min 3 chars, max 100 chars
		if (!name?.trim()) {
			errors.name = 'Goal name is required';
		} else if (name.trim().length < 3) {
			errors.name = 'Goal name must be at least 3 characters';
		} else if (name.trim().length > 100) {
			errors.name = 'Goal name must be 100 characters or less';
		}

		// Target amount: required, valid monetary format, positive
		// Declare at action scope for use in validation and db.insert
		let targetAmountInCents: number | undefined = undefined;
		try {
			const trimmed = targetAmountStr?.trim() || '';
			const match = trimmed.match(/^(\d+)\.?(\d{0,2})?$/);
			if (!match) {
				errors.targetAmount = 'Invalid amount format. Enter amount like 1000.00 or 1000';
			} else {
				const pounds = parseInt(match[1], 10);
				const pence = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0;
				targetAmountInCents = (pounds * 100) + pence;
				if (targetAmountInCents <= 0) {
					errors.targetAmount = 'Target amount must be greater than zero';
				}
			}
		} catch (e) {
			devLog('goalsCreate', 'Target amount validation failed', {
				input: targetAmountStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.targetAmount = 'Invalid amount format. Enter amount like 1000.00 or 1000';
		}


		// Target date: optional, but must be valid if provided
		// Declare at action scope for use in validation and db.insert
		let targetDate: Date | undefined = undefined;
		if (targetDateStr?.trim()) {
			const parsedDate = new Date(targetDateStr);
			if (isNaN(parsedDate.getTime())) {
				errors.targetDate = 'Invalid date format';
			} else {
				// Use noon UTC to avoid timezone issues
				targetDate = parsedDate;
			}
		}

		// Declare filter arrays at action scope for use in validation and db.insert
		let accountTypeFilters: string[] = [];
		let liquidityFilters: string[] = [];

		// Account type filters: required, parse JSON array
		try {
			if (!accountTypeFiltersStr?.trim()) {
				errors.accountTypeFilters = 'Select at least one account type';
			} else {
				accountTypeFilters = JSON.parse(accountTypeFiltersStr);
				if (!Array.isArray(accountTypeFilters) || accountTypeFilters.length === 0) {
					errors.accountTypeFilters = 'Select at least one account type';
				}
			}
		} catch (e) {
			devLog('goalsCreate', 'Account type filters parse failed', {
				input: accountTypeFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.accountTypeFilters = 'Invalid filter selection';
		}

		// Liquidity filters: required, parse JSON array
		try {
			if (!liquidityFiltersStr?.trim()) {
				errors.liquidityFilters = 'Select at least one liquidity option';
			} else {
				liquidityFilters = JSON.parse(liquidityFiltersStr);
				if (!Array.isArray(liquidityFilters) || liquidityFilters.length === 0) {
					errors.liquidityFilters = 'Select at least one liquidity option';
				}
			}
		} catch (e) {
			devLog('goalsCreate', 'Liquidity filters parse failed', {
				input: liquidityFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.liquidityFilters = 'Invalid filter selection';
		}

		// Return validation errors if any
		if (Object.keys(errors).length > 0 || targetAmountInCents === undefined) {
			devLog('goalsCreate', 'Validation failed', { errors });
			return fail(400, {
				error: 'Please fix errors below',
				errors,
				data: {
					name: name || '',
					targetAmount: targetAmountStr || '',
					isEmergencyFund: String(isEmergencyFund),
					targetDate: targetDateStr || '',
					accountTypeFilters: accountTypeFiltersStr || '',
					liquidityFilters: liquidityFiltersStr || ''
				}
			});
		}

		devLog('goalsCreate', 'Validation passed', {
			name: name.trim(),
			targetAmountInCents,
			isEmergencyFund,
			targetDate,
			accountTypeFilters,
			liquidityFilters
		});

		// Generate slug for URL-safe routing
		const slug = nanoid(16);

		// Insert goal with user_id for row-level security
		// Note: targetDate is a Date object for the timestamp column type
		const [newGoal] = await db.insert(goals).values({
			userId: locals.user.id,
			slug,
			name: name.trim(),
			targetAmountInCents: targetAmountInCents,
			isEmergencyFund: isEmergencyFund,
			targetDate: targetDate,
			accountTypeFilters: JSON.stringify(accountTypeFilters),
			liquidityFilters: JSON.stringify(liquidityFilters)
		}).returning();

		devLog('goalsCreate', 'Goal created', { goalId: newGoal.id, slug });

		// Redirect to goals list on success
		redirect(303, '/goals');
	},

	edit: async ({ request, locals }) => {
		if (!locals.user) {
			logError('goals', 'Authentication required for edit');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('goalsEdit', Object.fromEntries(formData));

		const slug = formData.get('slug') as string;
		const name = formData.get('name') as string;
		const targetAmountStr = formData.get('targetAmount') as string;
		const isEmergencyFund = formData.get('isEmergencyFund') === 'true';
		const targetDateStr = formData.get('targetDate') as string;
		const accountTypeFiltersStr = formData.get('account_type_filters') as string;
		const liquidityFiltersStr = formData.get('liquidity_filters') as string;

		// Validate slug exists and belongs to user
		const existingGoal = await db.query.goals.findFirst({
			where: eq(goals.slug, slug)
		});

		if (!existingGoal) {
			logError('goalsEdit', 'Goal not found', { slug, userId: locals.user.id });
			return fail(404, { error: 'Goal not found' });
		}

		validateUserAccess(existingGoal, locals.user, 'Goal');

		// Server-side validation (same as create)
		const errors: Record<string, string> = {};

		// Name: required, min 3 chars, max 100 chars
		if (!name?.trim()) {
			errors.name = 'Goal name is required';
		} else if (name.trim().length < 3) {
			errors.name = 'Goal name must be at least 3 characters';
		} else if (name.trim().length > 100) {
			errors.name = 'Goal name must be 100 characters or less';
		}

		// Target amount: required, valid monetary format, positive
		// Declare at action scope for use in validation and db.update
		let targetAmountInCents: number | undefined = undefined;
		try {
			const trimmed = targetAmountStr?.trim() || '';
			const match = trimmed.match(/^(\d+)\.?(\d{0,2})?$/);
			if (!match) {
				errors.targetAmount = 'Invalid amount format. Enter amount like 1000.00 or 1000';
			} else {
				const pounds = parseInt(match[1], 10);
				const pence = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0;
				targetAmountInCents = (pounds * 100) + pence;
				if (targetAmountInCents <= 0) {
					errors.targetAmount = 'Target amount must be greater than zero';
				}
			}
		} catch (e) {
			devLog('goalsEdit', 'Target amount validation failed', {
				input: targetAmountStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.targetAmount = 'Invalid amount format. Enter amount like 1000.00 or 1000';
		}


		// Target date: optional, but must be valid if provided
		// Declare at action scope for use in validation and db.update
		let targetDate: Date | undefined = undefined;
		if (targetDateStr?.trim()) {
			const parsedDate = new Date(targetDateStr);
			if (isNaN(parsedDate.getTime())) {
				errors.targetDate = 'Invalid date format';
			} else {
				// Use noon UTC to avoid timezone issues
				targetDate = parsedDate;
			}
		}

		// Declare filter arrays at action scope for use in validation and db.insert
		let accountTypeFilters: string[] = [];
		let liquidityFilters: string[] = [];

		// Account type filters: required, parse JSON array
		try {
			if (!accountTypeFiltersStr?.trim()) {
				errors.accountTypeFilters = 'Select at least one account type';
			} else {
				accountTypeFilters = JSON.parse(accountTypeFiltersStr);
				if (!Array.isArray(accountTypeFilters) || accountTypeFilters.length === 0) {
					errors.accountTypeFilters = 'Select at least one account type';
				}
			}
		} catch (e) {
			devLog('goalsEdit', 'Account type filters parse failed', {
				input: accountTypeFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.accountTypeFilters = 'Invalid filter selection';
		}

		// Liquidity filters: required, parse JSON array
		try {
			if (!liquidityFiltersStr?.trim()) {
				errors.liquidityFilters = 'Select at least one liquidity option';
			} else {
				liquidityFilters = JSON.parse(liquidityFiltersStr);
				if (!Array.isArray(liquidityFilters) || liquidityFilters.length === 0) {
					errors.liquidityFilters = 'Select at least one liquidity option';
				}
			}
		} catch (e) {
			devLog('goalsEdit', 'Liquidity filters parse failed', {
				input: liquidityFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.liquidityFilters = 'Invalid filter selection';
		}

	// Return validation errors if any
		if (Object.keys(errors).length > 0 || targetAmountInCents === undefined) {
			devLog('goalsEdit', 'Validation failed', { errors });
			return fail(400, {
				error: 'Please fix errors below',
				errors,
				data: {
					slug,
					name: name || '',
					targetAmount: targetAmountStr || '',
					isEmergencyFund: String(isEmergencyFund),
					targetDate: targetDateStr || '',
					accountTypeFilters: accountTypeFiltersStr || '',
					liquidityFilters: liquidityFiltersStr || ''
				}
			});
		}

		devLog('goalsEdit', 'Validation passed', {
			slug,
			name: name.trim(),
			targetAmountInCents,
			isEmergencyFund,
			targetDate,
			accountTypeFilters,
			liquidityFilters
		});

		// Update goal with row-level security filter
		// Note: targetDate is a Date object for the timestamp column type
		await db.update(goals)
			.set({
				name: name.trim(),
				targetAmountInCents: targetAmountInCents,
				isEmergencyFund: isEmergencyFund,
				targetDate: targetDate,
				accountTypeFilters: JSON.stringify(accountTypeFilters),
				liquidityFilters: JSON.stringify(liquidityFilters)
			})
			.where(and(withUserFilter(locals.user.id, goals), eq(goals.slug, slug)));

		devLog('goalsEdit', 'Goal updated', { slug });

		// Redirect to goals list on success
		redirect(303, '/goals');
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) {
			logError('goals', 'Authentication required for delete');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('goalsDelete', Object.fromEntries(formData));

		const slug = formData.get('slug') as string;

		// Validate slug exists and belongs to user
		const existingGoal = await db.query.goals.findFirst({
			where: eq(goals.slug, slug)
		});

		if (!existingGoal) {
			logError('goalsDelete', 'Goal not found', { slug, userId: locals.user.id });
			return fail(404, { error: 'Goal not found' });
		}

		validateUserAccess(existingGoal, locals.user, 'Goal');

		devLog('goalsDelete', 'Deleting goal', { slug, goalId: existingGoal.id });

		// Delete goal with row-level security filter
		await db.delete(goals).where(and(withUserFilter(locals.user.id, goals), eq(goals.slug, slug)));

		devLog('goalsDelete', 'Goal deleted', { slug });

		// Redirect to goals list on success
		redirect(303, '/goals');
	}
};
