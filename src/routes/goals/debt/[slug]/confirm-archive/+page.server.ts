import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goals } from "$lib/db/schema";
import { logError } from "$lib/utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) {
    redirect(302, "/login");
  }

  const goal = await db.query.goals.findFirst({
    where: eq(goals.slug, params.slug),
  });

  if (!goal || goal.deletedAt) {
    logError("debtGoalArchiveConfirm", "Goal not found", { slug: params.slug });
    error(404, "Goal not found");
  }

  validateUserAccess(goal, locals.user, "Goal");

  if (goal.goalType !== "debt") {
    error(404, "Not a debt goal");
  }

  return {
    goal,
    breadcrumbOverrides: [
      { segmentIndex: 1, label: "Goals", skipLink: false },
      { segmentIndex: 2, label: goal.name, skipLink: true },
      { segmentIndex: 3, label: "Archive", skipLink: false },
    ],
  };
};