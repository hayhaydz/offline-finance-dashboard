import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { parseCurrency } from '$lib/utils/currency';
import { devLog, logFormData, logError } from '$lib/utils/logger';
import { nanoid } from 'nanoid';

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
	default: async ({ request, locals }) => {
		try {
			if (!locals.user) {
				logError('createAccount', 'Authentication required');
				return fail(401, { error: 'Authentication required' });
			}

			const formData = await request.formData();
			devLog('createAccount', 'Form received', Object.fromEntries(formData));

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
					devLog('createAccount', 'parseCurrency validation failed', {
						input: initialBalance,
						error: e instanceof Error ? e.message : String(e)
					});
					errors.initialBalance = 'Invalid balance format. Enter amount like 123.45 or 123';
				}
			}

			// Return validation errors if any
			if (Object.keys(errors).length > 0) {
				devLog('createAccount', 'Validation failed', { errors });
				logFormData('createAccount', { name, type, institution, liquidity, initialBalance });
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

			devLog('createAccount', 'Validation passed', {
				name: name.trim(),
				type,
				institution: institution?.trim() || null,
				liquidity: liquidity || null,
				balanceInCents
			});

			// Insert account with user_id for row-level security and slug
			const accountSlug = nanoid(16);
			const [newAccount] = await db.insert(accounts).values({
				userId: locals.user.id,
				slug: accountSlug,
				name: name.trim(),
				type,
				institution: institution?.trim() || null,
				liquidity: liquidity || null,
				closedAt: null,
				excludedFromNetWorth: false
			}).returning();

			devLog('createAccount', 'Account created', { accountId: newAccount.id, slug: accountSlug });

			// If initial balance provided, insert into account_balances with slug
			if (balanceInCents !== null) {
				const balanceSlug = nanoid(16);
				// Use midnight UTC for consistent date comparison
				const todayMidnight = new Date();
				todayMidnight.setUTCHours(0, 0, 0, 0);
				await db.insert(accountBalances).values({
					accountId: newAccount.id,
					slug: balanceSlug,
					balanceInCents,
					asOfDate: todayMidnight,
					notes: null
				});
				devLog('createAccount', 'Balance added', {
					accountId: newAccount.id,
					balanceInCents,
					asOfDate: todayMidnight.toISOString()
				});
			}

			// Redirect to accounts list on success
			devLog('createAccount', 'Redirecting to accounts list', { accountSlug });
			redirect(303, '/accounts');
		} catch (error) {
			// SvelteKit's redirect() throws an error with status code - let it through
			if (error && typeof error === 'object' && 'status' in error && error.status === 303) {
				throw error; // Re-throw redirect exceptions
			}
			logError('createAccount', 'Unexpected error', error);
			return fail(500, { error: 'An error occurred while creating the account' });
		}
	}
};
