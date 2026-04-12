import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock select chain for checkGoalAutoReduceAlerts (returns empty by default)
const selectChain = {
	from: vi.fn().mockReturnThis(),
	innerJoin: vi.fn().mockReturnThis(),
	where: vi.fn().mockResolvedValue([]),
};

vi.mock('$lib/db/client', () => ({
	db: {
		query: {
			goals: {
				findMany: vi.fn(),
			},
		},
		select: vi.fn(() => selectChain),
	},
}));

vi.mock('$lib/auth/row-security', () => ({
	withUserFilter: vi.fn(() => ({})),
}));

vi.mock('$lib/server/derivedBalances', () => ({
	getCurrentBalancesForAccounts: vi.fn(),
}));

vi.mock('$lib/server/goals', () => ({
	getDebtGoalProgress: vi.fn(),
}));

vi.mock('$lib/utils/logger', () => ({
	logError: vi.fn(),
}));

describe('getGoalListAlerts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty array when no goals exist', async () => {
		const { getGoalListAlerts } = await import('$lib/server/alerts');
		const { db } = await import('$lib/db/client');

		vi.mocked(db.query.goals.findMany).mockResolvedValue([] as any);
		const result = await getGoalListAlerts(1);
		expect(result).toEqual([]);
	});

	it('returns GOAL_NEGATIVE_BALANCE when allocation is negative for savings goal', async () => {
		const { getGoalListAlerts } = await import('$lib/server/alerts');
		const { db } = await import('$lib/db/client');

		vi.mocked(db.query.goals.findMany).mockResolvedValue([
			{
				id: 1,
				name: 'Emergency Fund',
				goalType: 'savings',
				currentAllocation: -500,
				targetAmountInCents: 100000,
				targetDate: null,
				startingBalanceInCents: null,
				linkedAccountId: null,
				slug: 'emergency-fund',
				createdAt: new Date(),
				updatedAt: new Date(),
				userId: 1,
				isEmergencyFund: false,
				sortOrder: 1,
				deletedAt: null,
			},
		] as any);

		const result = await getGoalListAlerts(1);
		expect(result.length).toBe(1);
		expect(result[0].type).toBe('GOAL_NEGATIVE_BALANCE');
		expect(result[0].severity).toBe('red');
	});

	it('returns GOAL_DEADLINE_APPROACHING when deadline is within 30 days and <90% funded', async () => {
		const { getGoalListAlerts } = await import('$lib/server/alerts');
		const { db } = await import('$lib/db/client');

		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 15);

		vi.mocked(db.query.goals.findMany).mockResolvedValue([
			{
				id: 2,
				name: 'Vacation',
				goalType: 'savings',
				currentAllocation: 5000,
				targetAmountInCents: 100000,
				targetDate: futureDate,
				startingBalanceInCents: null,
				linkedAccountId: null,
				slug: 'vacation',
				createdAt: new Date(),
				updatedAt: new Date(),
				userId: 1,
				isEmergencyFund: false,
				sortOrder: 2,
				deletedAt: null,
			},
		] as any);

		const result = await getGoalListAlerts(1);
		expect(result.length).toBe(1);
		expect(result[0].type).toBe('GOAL_DEADLINE_APPROACHING');
		expect(result[0].severity).toBe('amber');
	});

	it('returns DEBT_GREW_BEYOND_STARTING when debt balance exceeds starting', async () => {
		const { getGoalListAlerts } = await import('$lib/server/alerts');
		const { db } = await import('$lib/db/client');
		const { getCurrentBalancesForAccounts } = await import('$lib/server/derivedBalances');

		vi.mocked(db.query.goals.findMany).mockResolvedValue([
			{
				id: 3,
				name: 'Car Loan',
				goalType: 'debt',
				currentAllocation: 0,
				targetAmountInCents: 0,
				targetDate: null,
				startingBalanceInCents: 500000,
				linkedAccountId: 99,
				slug: 'car-loan',
				createdAt: new Date(),
				updatedAt: new Date(),
				userId: 1,
				isEmergencyFund: false,
				sortOrder: 3,
				deletedAt: null,
			},
		] as any);

		vi.mocked(getCurrentBalancesForAccounts).mockResolvedValue(
			new Map([[99, -600000]]),
		);

		const result = await getGoalListAlerts(1);
		expect(result.length).toBe(1);
		expect(result[0].type).toBe('DEBT_GREW_BEYOND_STARTING');
		expect(result[0].severity).toBe('red');
	});

	it('returns empty array and logs error on failure', async () => {
		const { getGoalListAlerts } = await import('$lib/server/alerts');
		const { db } = await import('$lib/db/client');
		const { logError } = await import('$lib/utils/logger');

		vi.mocked(db.query.goals.findMany).mockRejectedValue(new Error('DB down'));

		const result = await getGoalListAlerts(1);
		expect(result).toEqual([]);
		expect(logError).toHaveBeenCalled();
	});
});
