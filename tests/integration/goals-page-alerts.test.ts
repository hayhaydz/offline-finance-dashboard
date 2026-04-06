import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Alert } from '$lib/types/alerts';

// Mock all server dependencies
vi.mock('@sveltejs/kit', async () => ({
	fail: vi.fn((status: number, data: Record<string, unknown>) => ({ status, ...data })),
	redirect: vi.fn((status: number, url: string) => {
		throw new Error(`Redirect ${status} ${url}`);
	}),
}));

vi.mock('$lib/db/client', () => ({
	db: {
		query: {
			goals: { findMany: vi.fn() },
			accounts: { findMany: vi.fn() },
		},
		select: vi.fn(),
	},
}));

vi.mock('$lib/auth/row-security', () => ({
	validateUserAccess: vi.fn(),
	withUserFilter: vi.fn(() => ({})),
}));

vi.mock('$lib/server/goals', () => ({
	calculateReadyToAssign: vi.fn(),
	getDebtGoalProgress: vi.fn(),
}));

vi.mock('$lib/server/derivedBalances', () => ({
	getCurrentBalancesForAccounts: vi.fn(),
}));

vi.mock('$lib/server/exclusions', () => ({
	updateTypeExclusions: vi.fn(),
}));

vi.mock('$lib/server/finance', () => ({
	getNetWorthSummary: vi.fn(),
}));

vi.mock('$lib/server/alerts', () => ({
	getGoalListAlerts: vi.fn(),
}));

vi.mock('$lib/utils/logger', () => ({
	devLog: vi.fn(),
	isVerboseDebug: vi.fn(() => false),
	logError: vi.fn(),
	logFormData: vi.fn(),
}));

vi.mock('$lib/utils/staleness', () => ({
	getMostRecentDate: vi.fn(() => null),
	getStaleness: vi.fn(() => null),
}));

describe('Goals page server load — alerts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('includes alerts in returned data', async () => {
		const { getGoalListAlerts } = await import('$lib/server/alerts');
		const { getNetWorthSummary } = await import('$lib/server/finance');
		const { calculateReadyToAssign } = await import('$lib/server/goals');
		const { db } = await import('$lib/db/client');

		// Setup mocks with correct shapes
		vi.mocked(getNetWorthSummary).mockResolvedValue({
			netWorth: 0,
			totalAssets: 0,
			totalLiabilities: 0,
			excludedAssets: 0,
			excludedLiabilities: 0,
			exclusionCount: 0,
			excludedTypeNames: [],
			hasStaleData: false,
			dateRange: { oldest: new Date(), newest: new Date() },
		});
		vi.mocked(calculateReadyToAssign).mockResolvedValue({
			readyToAssign: 0,
			totalAssets: 0,
			totalSavingsAllocated: 0,
			totalDebtTracked: 0,
			totalDebtUntracked: 0,
			totalLiabilities: 0,
		});
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([{ total: 0 }]),
			}),
		});
		vi.mocked(db.query.goals.findMany).mockResolvedValue([]);
		vi.mocked(db.query.accounts.findMany).mockResolvedValue([]);

		const mockAlerts: Alert[] = [
			{
				id: 'GOAL_DEADLINE_APPROACHING:global',
				type: 'GOAL_DEADLINE_APPROACHING',
				severity: 'amber',
				title: 'Goal deadline approaching',
				message: '"Vacation" — 50% funded, deadline in 15 days',
				href: '/goals',
				triggeredAt: Date.now(),
			},
		];
		vi.mocked(getGoalListAlerts).mockResolvedValue(mockAlerts);

		// Dynamically import the load function
		const mod = await import('../../src/routes/goals/+page.server');
		const result = await (mod as any).load({
			locals: { user: { id: 1, username: 'test', createdAt: new Date() } },
			url: new URL('http://localhost/goals'),
		});

		expect(result.alerts).toEqual(mockAlerts);
		expect(getGoalListAlerts).toHaveBeenCalledWith(1);
	});
});
