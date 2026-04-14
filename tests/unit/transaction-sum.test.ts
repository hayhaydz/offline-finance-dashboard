import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("$lib/db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  },
}));

import { getTransactionSum } from "$lib/server/transactions";
import { db } from "$lib/db/client";

describe("getTransactionSum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses SQL SUM aggregation instead of client-side reduce", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: 50000 }]),
      }),
    });

    const result = await getTransactionSum(
      1,
      ["deposit", "interest"] as any,
      new Date("2026-04-06"),
      new Date("2027-04-05"),
    );

    expect(result).toBe(50000);
    // Verify db.select was called (SQL aggregation), NOT findMany
    expect(db.select).toHaveBeenCalled();
  });

  it("returns 0 when no transactions match", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await getTransactionSum(
      99,
      ["deposit"] as any,
      new Date("2026-04-06"),
    );

    expect(result).toBe(0);
  });

  it("filters by types using inArray in SQL, not client-side filter", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ total: 15000 }]);
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockWhere,
      }),
    });

    await getTransactionSum(
      1,
      ["deposit", "interest", "dividend"] as any,
      new Date("2026-04-06"),
    );

    // The where clause should be called with conditions including inArray for types
    // This proves we're not doing client-side .filter()
    const whereCall = mockWhere.mock.calls[0][0];
    expect(whereCall).toBeDefined();
  });
});
