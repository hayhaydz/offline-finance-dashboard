import { describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { goals, goalMilestones } from "$lib/db/schema";
import { eq } from "drizzle-orm";

describe("debt goal creation", () => {
  it("supports debt goal query structure", async () => {
    // Test that the query structure works (goalType column exists)
    const result = await db.query.goals.findMany({
      where: eq(goals.goalType, "debt"),
    });
    expect(Array.isArray(result)).toBe(true);
  });
});
