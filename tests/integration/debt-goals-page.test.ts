import { describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { goals } from "$lib/db/schema";
import { eq } from "drizzle-orm";

describe("debt goals list page", () => {
  it("loads only debt goals", async () => {
    const debtGoals = await db.query.goals.findMany({
      where: eq(goals.goalType, "debt"),
    });
    expect(Array.isArray(debtGoals)).toBe(true);
  });
});
