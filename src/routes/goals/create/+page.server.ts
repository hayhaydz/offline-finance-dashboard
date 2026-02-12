import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { devLog, logError, logFormData } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog('goals-create', 'Unauthenticated user, redirecting to login');
		redirect(302, '/login');
	}

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			logError('goals-create', 'Authentication required for create');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('goals-create', Object.fromEntries(formData));

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
			devLog('goals-create', 'Target amount validation failed', {
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
			devLog('goals-create', 'Account type filters parse failed', {
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
			devLog('goals-create', 'Liquidity filters parse failed', {
				input: liquidityFiltersStr,
				error: e instanceof Error ? e.message : String(e)
			});
			errors.liquidityFilters = 'Invalid filter selection';
		}

		// Return validation errors if any
		if (Object.keys(errors).length > 0 || targetAmountInCents === undefined) {
			devLog('goals-create', 'Validation failed', { errors });
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

		devLog('goals-create', 'Validation passed', {
			name: name.trim(),
			targetAmountInCents,
			isEmergencyFund,
			targetDate,
			accountTypeFilters,
			liquidityFilters
		});

		// Import db and nanoid only after validation passes
		const { db } = await import('$lib/db/client');
		const { goals } = await import('$lib/db/schema');
		const { nanoid } = await import('nanoid');

		// Generate slug for URL-safe routing
		const slug = nanoid(16);

		// Insert goal with user_id for row-level security
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

		devLog('goals-create', 'Goal created', { goalId: newGoal.id, slug });

		// Redirect to goals list on success
		redirect(303, '/goals');
	}
};
