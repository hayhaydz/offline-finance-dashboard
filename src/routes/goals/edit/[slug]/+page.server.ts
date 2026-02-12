import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { goals } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const goalSlug = params.slug;
	devLog('editGoal', 'Loading goal for edit', { goalSlug });

	// Get goal and validate ownership using slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, goalSlug)
	});

	if (!goal) {
		logError('editGoal', 'Goal not found', { goalSlug });
		error(404, 'Goal not found');
	}

	validateUserAccess(goal, locals.user, 'Goal');

	return {
		goal,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: goal.name, skipLink: false },
			{ segmentIndex: 2, label: 'Edit Goal', skipLink: false }
		]
	};
};

export const actions: Actions = {
	updateGoal: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError('editGoal', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const goalSlug = params.slug;

		// Validate ownership using slug
		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, goalSlug)
		});

		if (!goal) {
			logError('editGoal', 'Goal not found', { goalSlug });
			return fail(404, { error: 'Goal not found' });
		}

		validateUserAccess(goal, locals.user, 'Goal');

		const formData = await request.formData();
		logFormData('editGoal', Object.fromEntries(formData));

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
			devLog('editGoal', 'Target amount validation failed', {
				input: targetAmountStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.targetAmount = 'Invalid amount format. Enter amount like 1000.00 or 1000';
		}

	
		// Target date: optional, but must be valid if provided
		let targetDate: Date | undefined = undefined;
		if (targetDateStr?.trim()) {
			const parsedDate = new Date(targetDateStr);
			if (isNaN(parsedDate.getTime())) {
				errors.targetDate = 'Invalid date format';
			} else {
				targetDate = parsedDate;
			}
		}

		// Account type filters: required, parse JSON array
		let accountTypeFilters: string[] = [];
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
			devLog('editGoal', 'Account type filters parse failed', {
				input: accountTypeFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.accountTypeFilters = 'Invalid filter selection';
		}

		// Liquidity filters: required, parse JSON array
		let liquidityFilters: string[] = [];
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
			devLog('editGoal', 'Liquidity filters parse failed', {
				input: liquidityFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.liquidityFilters = 'Invalid filter selection';
		}

		// Return validation errors if any
		if (Object.keys(errors).length > 0 || targetAmountInCents === undefined) {
			devLog('editGoal', 'Validation failed', { errors });
			return fail(400, {
				error: 'Please fix errors below',
				errors,
				data: {
					slug: goalSlug,
					name: name || '',
					targetAmount: targetAmountStr || '',
					isEmergencyFund: String(isEmergencyFund),
					targetDate: targetDateStr || '',
					accountTypeFilters: accountTypeFiltersStr || '',
					liquidityFilters: liquidityFiltersStr || ''
				}
			});
		}

		devLog('editGoal', 'Form validation passed', {
			goalSlug,
			name: name.trim(),
			targetAmountInCents,
			isEmergencyFund,
			targetDate,
			accountTypeFilters,
			liquidityFilters
		});

		// Update goal with row-level security filter
		await db.update(goals)
			.set({
				name: name.trim(),
				targetAmountInCents: targetAmountInCents,
				isEmergencyFund: isEmergencyFund,
				targetDate: targetDate,
				accountTypeFilters: JSON.stringify(accountTypeFilters),
				liquidityFilters: JSON.stringify(liquidityFilters)
			})
			.where(eq(goals.slug, goalSlug));

		devLog('editGoal', 'Goal updated successfully', { goalSlug });

		// Redirect to goals list on success
		redirect(303, '/goals');
	}
};
