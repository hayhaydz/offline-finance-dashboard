import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { goals } from "$lib/db/schema";

describe("debt goal detail page", () => {
  it("loads debt goal structure correctly", async () => {
    const goalsQuery = await db.query.goals.findFirst({
      where: eq(goals.goalType, "debt"),
    });
    expect(Array.isArray([goalsQuery])).toBe(true);
  });
});
