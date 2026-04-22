import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Shared mocks --------------------------------------------------------

const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([{ maxDate: null }]),
};

vi.mock('$lib/db/client', () => ({
  db: {
    select: vi.fn(() => selectChain),
    query: {
      monthlyReviews: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  },
}));

vi.mock('$lib/auth/row-security', () => ({
  withUserFilter: vi.fn(() => ({})),
}));

vi.mock('$lib/server/logger', () => ({
  devLog: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  isVerboseDebug: vi.fn(() => false),
}));

vi.mock('$lib/utils/tax-year-utils', () => ({
  getUkTaxYearBounds: vi.fn((now: Date) => {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const startYear = month >= 3 || (month === 3 && now.getUTCDate() >= 6) ? year : year - 1;
    const start = new Date(Date.UTC(startYear, 3, 6));
    const end = new Date(Date.UTC(startYear + 1, 3, 5));
    return { start, end };
  }),
  ISA_ALLOWANCE_IN_CENTS: 2_000_000,
}));

vi.mock('$lib/utils/formatting', () => ({
  formatCents: vi.fn((cents: number) => `\u00A3${(cents / 100).toFixed(2)}`),
}));

// --- checkSnapshotAlerts -------------------------------------------------

describe('checkSnapshotAlerts -- new-user suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when hasAccounts is false', async () => {
    const { checkSnapshotAlerts } = await import('$lib/server/alerts/async-goals');
    const result = await checkSnapshotAlerts(1, false);
    expect(result).toEqual([]);
  });

  it('returns NO_SNAPSHOT_RECENTLY when hasAccounts is true and no snapshots exist', async () => {
    const { checkSnapshotAlerts } = await import('$lib/server/alerts/async-goals');
    const result = await checkSnapshotAlerts(1, true);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('NO_SNAPSHOT_RECENTLY');
    expect(result[0].severity).toBe('info');
  });
});

// --- checkMonthlyReviewAlerts ---------------------------------------------

describe('checkMonthlyReviewAlerts -- new-user suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when hasAccounts is false', async () => {
    const { checkMonthlyReviewAlerts } = await import('$lib/server/alerts/async-goals');
    const result = await checkMonthlyReviewAlerts(1, false);
    expect(result).toEqual([]);
  });

  it('returns NO_MONTHLY_REVIEW when hasAccounts is true and no review exists', async () => {
    const { checkMonthlyReviewAlerts } = await import('$lib/server/alerts/async-goals');
    const result = await checkMonthlyReviewAlerts(1, true);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('NO_MONTHLY_REVIEW');
  });
});

// --- checkTaxYearReviewAlerts ---------------------------------------------

describe('checkTaxYearReviewAlerts -- new-user suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when hasAccounts is false', async () => {
    const { checkTaxYearReviewAlerts } = await import('$lib/server/alerts/async-isa');
    const now = new Date(Date.UTC(2026, 3, 22));
    const result = await checkTaxYearReviewAlerts(now, false);
    expect(result).toEqual([]);
  });

  it('returns two alerts when hasAccounts is true and within tax year window', async () => {
    const { checkTaxYearReviewAlerts } = await import('$lib/server/alerts/async-isa');
    const now = new Date(Date.UTC(2026, 3, 22));
    const result = await checkTaxYearReviewAlerts(now, true);
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('TAX_YEAR_INTEREST_REVIEW');
    expect(result[1].type).toBe('TAX_YEAR_ISA_REVIEW');
  });

  it('returns red severity when day 15+ into tax year', async () => {
    const { checkTaxYearReviewAlerts } = await import('$lib/server/alerts/async-isa');
    const now = new Date(Date.UTC(2026, 3, 22));
    const result = await checkTaxYearReviewAlerts(now, true);
    expect(result[0].severity).toBe('red');
    expect(result[1].severity).toBe('red');
  });

  it('returns empty array outside the 30-day tax year window', async () => {
    const { checkTaxYearReviewAlerts } = await import('$lib/server/alerts/async-isa');
    const now = new Date(Date.UTC(2026, 5, 15));
    const result = await checkTaxYearReviewAlerts(now, true);
    expect(result).toEqual([]);
  });
});
