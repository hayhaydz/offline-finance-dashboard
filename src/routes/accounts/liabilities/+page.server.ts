import type { PageServerLoad } from './$types';
import { calculateTTZ } from '$lib/utils/debt-calculator';
import { getCurrentRate } from '$lib/utils/rate-helpers';
import { db } from '$lib/db/client';
import { accounts } from '$lib/db/schema';
import { withUserFilter } from '$lib/auth/row-security';
import { eq, and } from 'drizzle-orm';
import { getCurrentBalancesForAccounts } from '$lib/server/derivedBalances';

function getDebtStatusLabel(ttz: { months: number | null; years: number | null }): string {
	if (ttz.months === null) return '[CRITICAL]';
	if (ttz.years !== null && ttz.years >= 5) return '[WARNING]';
	return '[HEALTHY]';
}

function getDebtStatusClass(ttz: { months: number | null; years: number | null }): string {
	if (ttz.months === null) return 'text-red-700';
	if (ttz.years !== null && ttz.years >= 5) return 'text-amber-700';
	return 'text-green-700';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return {
			revolving: [],
			installment: [],
			summary: {
				totalDebt: 0,
				totalMonthlyInterest: 0,
				count: 0
			}
		};
	}

	// Fetch all liability accounts for current user
	const liabilities = await db.query.accounts.findMany({
		where: and(
			withUserFilter(locals.user.id, accounts),
			eq(accounts.category, 'liability')
		)
	});

	// Get current balances for all liability accounts
	const accountIds = liabilities.map(a => a.id);
	const balances = await getCurrentBalancesForAccounts(accountIds);

	// Calculate metrics for each account
	const withMetrics = await Promise.all(liabilities.map(async (account) => {
		const balance = balances.get(account.id) ?? 0;
		const currentRate = await getCurrentRate(account.id);
		const rule = {
			type: account.minimumPaymentType,
			flat: account.minimumPaymentFlat,
			percentage: account.minimumPaymentPercentage
		};
		// For liability accounts, balance is negative; convert to positive for debt calculator
		const ttz = calculateTTZ(Math.abs(balance), currentRate, rule);
		const utilization = account.creditLimit
			? (balance / account.creditLimit * 100).toFixed(1)
			: null;
		const progress = account.originalPrincipal
			? ((account.originalPrincipal - balance) / account.originalPrincipal * 100).toFixed(1)
			: null;

		return {
			...account,
			balance,
			...ttz,
			utilization,
			progress,
			debtStatusLabel: getDebtStatusLabel(ttz),
			debtStatusClass: getDebtStatusClass(ttz)
		};
	}));

	// Group by behavioral type
	const revolving = withMetrics.filter(a =>
		a.type === 'credit-card'
	);

	const installment = withMetrics.filter(a =>
		a.type === 'loan' || a.type === 'mortgage'
	);

	// Calculate summary totals
	const totalDebt = withMetrics.reduce((sum, a) => sum + a.balance, 0);
	const totalMonthlyInterest = withMetrics.reduce((sum, a) =>
		sum + (a.projection[0]?.interest || 0), 0
	);

	return {
		revolving,
		installment,
		summary: {
			totalDebt,
			totalMonthlyInterest,
			count: liabilities.length
		}
	};
};
