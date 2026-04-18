import { error, fail, redirect } from "@sveltejs/kit";
import { eq, desc } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goals, accountTransactions, goalMilestones, interestRates } from "$lib/db/schema";
import { getCurrentBalanceForAccount } from "$lib/server/derivedBalances";
import { getDebtGoalProgress, checkMilestones } from "$lib/server/goals";
import { requireAuth, getAuthUser } from "$lib/server/utils/auth-guard";
import { devLog, logError } from "$lib/server/logger";
import { MS_PER_MONTH } from "$lib/utils/time-constants";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const user = requireAuth(locals);

  let goal = await db.query.goals.findFirst({
    where: eq(goals.slug, params.slug),
    with: {
      linkedAccount: true,
      milestones: true,
    },
  });

  if (!goal || goal.deletedAt) {
    logError("debtGoalDetail", "Debt goal not found", { slug: params.slug });
    error(404, "Debt goal not found");
  }

  validateUserAccess(goal, user, "Goal");

  if (goal.goalType !== "debt") {
    error(404, "Not a debt goal");
  }

  const currentBalance = goal.linkedAccountId
    ? await getCurrentBalanceForAccount(goal.linkedAccountId)
    : 0;

  const progress = getDebtGoalProgress({
    startingBalanceInCents: goal.startingBalanceInCents ?? 0,
    currentBalanceInCents: currentBalance,
  });

  let color = "red";
  if (progress.percent >= 70) color = "green";
  else if (progress.percent >= 30) color = "amber";

  const newlyReachedIds = checkMilestones({
    currentBalanceInCents: currentBalance,
    milestones: goal.milestones.map((m) => ({
      id: m.id,
      thresholdInCents: m.thresholdInCents,
      reachedAt: m.reachedAt,
    })),
  });

  if (newlyReachedIds.length > 0) {
    const now = new Date();
    for (const milestoneId of newlyReachedIds) {
      await db
        .update(goalMilestones)
        .set({ reachedAt: now })
        .where(eq(goalMilestones.id, milestoneId));
    }
    const updated = await db.query.goals.findFirst({
      where: eq(goals.slug, params.slug),
      with: { milestones: true },
    });
    if (updated) goal = { ...goal, milestones: updated.milestones };
  }

  let paymentHistory: typeof accountTransactions.$inferSelect[] = [];
  if (goal.linkedAccountId) {
    paymentHistory = await db.query.accountTransactions.findMany({
      where: eq(accountTransactions.accountId, goal.linkedAccountId),
      orderBy: [desc(accountTransactions.transactionDate)],
    });
  }

  const payments = paymentHistory.filter((t) => t.type === "payment");
  const totalPaidInCents = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const firstPaymentDate = payments.length > 0 ? payments[payments.length - 1].transactionDate : null;

  let avgMonthlyPayment = 0;
  let projectedPayoffDate: Date | null = null;

  if (firstPaymentDate && totalPaidInCents > 0) {
    const now = new Date();
    const monthsSinceFirst = Math.max(
      1,
      (now.getTime() - new Date(firstPaymentDate).getTime()) / MS_PER_MONTH
    );
    avgMonthlyPayment = Math.round(totalPaidInCents / monthsSinceFirst);

    if (avgMonthlyPayment > 0 && progress.remainingInCents > 0) {
      const monthsUntilPayoff = progress.remainingInCents / avgMonthlyPayment;
      projectedPayoffDate = new Date(
        now.getTime() + monthsUntilPayoff * MS_PER_MONTH
      );
    }
  }

  // Fetch APR from interest rates for the linked account
  let aprBasisPoints: number | null = null;
  let minimumPaymentInCents = 0;

  if (goal.linkedAccountId && goal.linkedAccount) {
    const rates = await db.query.interestRates.findMany({
      where: eq(interestRates.accountId, goal.linkedAccountId),
      orderBy: [desc(interestRates.effectiveFrom)],
      limit: 1,
    });
    aprBasisPoints = rates.length > 0 ? rates[0].rate : null;

    // Get minimum payment from account config
    minimumPaymentInCents = goal.linkedAccount.minimumPaymentFlat;
  }

  // Calculate interest cost scenarios
  let interestIfMinOnly: number | null = null;
  let interestIfOnPace: number | null = null;

  if (aprBasisPoints !== null && aprBasisPoints > 0) {
    // Min-only projection
    if (minimumPaymentInCents > 0) {
      const monthlyRate = aprBasisPoints / 10000 / 12;
      const balance = progress.remainingInCents;
      if (minimumPaymentInCents > balance * monthlyRate) {
        const num = -Math.log(1 - (monthlyRate * balance) / minimumPaymentInCents);
        const den = Math.log(1 + monthlyRate);
        const months = Math.ceil(num / den);
        interestIfMinOnly = Math.max(0, minimumPaymentInCents * months - balance);
      }
    }

    // On-pace projection (using avg monthly payment)
    if (avgMonthlyPayment > 0 && progress.remainingInCents > 0) {
      const monthlyRate = aprBasisPoints / 10000 / 12;
      if (avgMonthlyPayment > progress.remainingInCents * monthlyRate) {
        const num = -Math.log(1 - (monthlyRate * progress.remainingInCents) / avgMonthlyPayment);
        const den = Math.log(1 + monthlyRate);
        const months = Math.ceil(num / den);
        interestIfOnPace = Math.max(0, avgMonthlyPayment * months - progress.remainingInCents);
      }
    }
  }

  const interestSavedInCents = interestIfMinOnly !== null && interestIfOnPace !== null
    ? Math.max(0, interestIfMinOnly - interestIfOnPace)
    : null;

  const onTrack = goal.targetDate && projectedPayoffDate
    ? projectedPayoffDate <= new Date(goal.targetDate)
    : null;

  devLog("debtGoalDetail", "Loaded debt goal detail", {
    goalId: goal.id,
    progress: progress.percent,
    newlyReachedMilestones: newlyReachedIds.length,
  });

  return {
    goal,
    currentBalance,
    progress,
    color,
    paymentHistory,
    paceMetrics: {
      totalPaidInCents,
      avgMonthlyPayment,
      projectedPayoffDate,
      paymentCount: payments.length,
    },
    interestData: {
      aprBasisPoints,
      minimumPaymentInCents,
      interestIfMinOnly,
      interestIfOnPace,
      interestSavedInCents,
    },
    onTrack,
    breadcrumbOverrides: [
      { segmentIndex: 1, label: "Goals", skipLink: false },
      { segmentIndex: 2, label: goal.name, skipLink: false },
    ],
  };
};

export const actions: Actions = {
  archiveGoal: async ({ request, locals, params }) => {
    const user = getAuthUser(locals);
    if (!user) return fail(401, { error: "Authentication required" });

    const formData = await request.formData();
    const confirmed = formData.get("confirmed") === "true";
    if (!confirmed) {
      return fail(400, { error: "Please confirm the archive action" });
    }

    const goal = await db.query.goals.findFirst({
      where: eq(goals.slug, params.slug),
    });

    if (!goal || goal.deletedAt) {
      return fail(404, { error: "Goal not found" });
    }

    validateUserAccess(goal, user, "Goal");

    try {
      await db
        .update(goals)
        .set({ deletedAt: new Date() })
        .where(eq(goals.id, goal.id));

      devLog("debtGoalArchive", "Debt goal archived", { slug: params.slug });
      redirect(303, "/goals");
    } catch (err) {
      logError("debtGoalArchive", "Failed to archive debt goal", err);
      return fail(500, { error: "Failed to archive debt goal" });
    }
  },
};
