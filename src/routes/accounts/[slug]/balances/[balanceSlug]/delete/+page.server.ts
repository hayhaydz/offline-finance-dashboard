import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { devLog, logError } from '$lib/utils/logger';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const { slug: accountSlug, balanceSlug } = params;

	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug)
	});

	if (!account) {
		logError('deleteBalance', 'Account not found', { accountSlug, userId: locals.user.id });
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	const balance = await db.query.accountBalances.findFirst({
		where: eq(accountBalances.slug, balanceSlug)
	});

	if (!balance || balance.accountId !== account.id) {
		logError('deleteBalance', 'Balance entry not found', { balanceSlug, accountId: account.id });
		error(404, 'Balance entry not found');
	}

	const asOfDateStr = balance.asOfDate.toISOString().split('T')[0];

	return {
		account,
		balance,
		asOfDateStr,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false },
			{ segmentIndex: 2, label: 'Balances', skipLink: true },
			{ segmentIndex: 3, label: asOfDateStr, skipLink: true },
			{ segmentIndex: 4, label: 'Delete', skipLink: false }
		]
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const { slug: accountSlug, balanceSlug } = params;

		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug)
		});

		if (!account) {
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		const balance = await db.query.accountBalances.findFirst({
			where: eq(accountBalances.slug, balanceSlug)
		});

		if (!balance || balance.accountId !== account.id) {
			return fail(404, { error: 'Balance entry not found' });
		}

		const formData = await request.formData();
		const confirmDate = (formData.get('confirmDate') as string)?.trim();
		const asOfDateStr = balance.asOfDate.toISOString().split('T')[0];

		if (confirmDate !== asOfDateStr) {
			return fail(400, { error: 'Date does not match. Please type the exact date shown.' });
		}

		await db.delete(accountBalances).where(eq(accountBalances.id, balance.id));
		await db.update(accounts).set({ updatedAt: new Date() }).where(eq(accounts.id, account.id));

		devLog('deleteBalance', 'Balance deleted successfully', { balanceSlug, accountId: account.id });

		redirect(303, `/accounts/${account.slug}`);
	}
};
