import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { parseCurrency } from '$lib/utils/currency';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
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
	createAccount: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const type = formData.get('type') as string;
		const institution = formData.get('institution') as string;
		const liquidity = formData.get('liquidity') as string;
		const initialBalance = formData.get('initialBalance') as string;

		// Server-side validation
		const errors: Record<string, string> = {};

		// Name: required, trimmed, max 100 chars
		if (!name?.trim()) {
			errors.name = 'Account name is required';
		} else if (name.trim().length > 100) {
			errors.name = 'Account name must be 100 characters or less';
		}

		// Type: required, must match one of 6 account types
		const validTypes = ['current', 'savings', 'credit', 'investment', 'ISA', 'LISA'];
		if (!type || !validTypes.includes(type)) {
			errors.type = 'Please select a valid account type';
		}

		// Institution: optional, max 100 chars if provided
		if (institution && institution.trim().length > 100) {
			errors.institution = 'Institution name must be 100 characters or less';
		}

		// Liquidity: optional, must match one of 3 values if provided
		const validLiquidity = ['instant', 'delayed', 'locked'];
		if (liquidity && !validLiquidity.includes(liquidity)) {
			errors.liquidity = 'Please select a valid liquidity option';
		}

		// Initial balance: optional, parse using parseCurrency
		let balanceInCents: number | null = null;
		if (initialBalance?.trim()) {
			try {
				balanceInCents = parseCurrency(initialBalance);
			} catch (e) {
				errors.initialBalance = 'Invalid balance format. Enter amount like 123.45 or 123';
			}
		}

		// Return validation errors if any
		if (Object.keys(errors).length > 0) {
			return fail(400, {
				error: 'Please fix the errors below',
				errors,
				data: {
					name: name || '',
					type: type || '',
					institution: institution || '',
					liquidity: liquidity || '',
					initialBalance: initialBalance || ''
				}
			});
		}

		// Insert account with user_id for row-level security
		const [newAccount] = await db.insert(accounts).values({
			userId: locals.user.id,
			name: name.trim(),
			type,
			institution: institution?.trim() || null,
			liquidity: liquidity || null,
			closedAt: null,
			excludedFromNetWorth: false
		}).returning();

		// If initial balance provided, insert into account_balances
		if (balanceInCents !== null) {
			await db.insert(accountBalances).values({
				accountId: newAccount.id,
				balanceInCents,
				asOfDate: new Date(),
				notes: null
			});
		}

		// Redirect to accounts list on success
		redirect(303, '/accounts');
	}
};
