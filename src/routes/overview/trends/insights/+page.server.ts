import { redirect } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getBalanceFlows, getCategorySpend, getTrendsSnapshot } from "$lib/server/trends";
import { getBudgetStatus } from "$lib/server/budgets";
import {
	averageOfLast,
	daysInMonthKey,
	estimateEndBalance,
	prevMonthKey,
} from "$lib/utils/trends-math";

/**
 * Spending insights (v3.2 A14 / V6) — the Monzo 3-tab surface:
 * balance / spending / target. Statement-model honest (D0): months are
 * DECLARED statement months; the balance tab's estimate is a
 * declared-history average projection (trends-math), never realtime.
 */
export const load = async ({ locals, url }) => {
	const user = requireAuth(locals);

	const monthParam = url.searchParams.get("month");
	if (monthParam && !/^\d{4}-\d{2}$/.test(monthParam)) {
		redirect(302, "/overview/trends/insights");
	}

	const now = new Date();
	const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
	const monthKey = monthParam ?? currentMonthKey;
	const previousKey = prevMonthKey(monthKey);

	const [snapshot, balanceFlows, categories, status] = await Promise.all([
		getTrendsSnapshot(user.id, now),
		getBalanceFlows(user.id),
		getCategorySpend(user.id, monthKey),
		getBudgetStatus(user.id, Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7))),
	]);

	const [yearStr, monthStr] = monthKey.split("-").map(Number);
	const chosenSnapshot = await getTrendsSnapshot(
		user.id,
		new Date(Date.UTC(yearStr, monthStr - 1, 15)),
	);

	// declared-history averages for the BALANCE estimate (last 3 months
	// BEFORE the chosen month, declared only)
	const flowsBefore = balanceFlows.filter((f) => f.monthKey < monthKey);
	const avgIn = averageOfLast(flowsBefore.map((f) => f.moneyInPence), 3);
	const avgOut = averageOfLast(flowsBefore.map((f) => f.moneyOutPence), 3);
	const chosenFlow = balanceFlows.find((f) => f.monthKey === monthKey) ?? null;
	// the window OPENS at the last DECLARED month before the chosen one —
	// for an undeclared current month that is simply last month's closing
	const prevFlow =
		[...balanceFlows].reverse().find((f) => f.monthKey < monthKey) ?? null;

	const startingBalancePence = prevFlow
		? prevFlow.closingBalancePence
		: (chosenFlow ? chosenFlow.closingBalancePence - (chosenFlow.moneyInPence - chosenFlow.moneyOutPence) : 0);

	const isCurrentMonth = monthKey === currentMonthKey;
	const estimatedEnd = isCurrentMonth
		? estimateEndBalance({
				startingBalancePence,
				declaredInPence: chosenFlow?.moneyInPence ?? 0,
				declaredOutPence: chosenFlow?.moneyOutPence ?? 0,
				avgInPence: avgIn,
				avgOutPence: avgOut,
			})
		: null;

	return {
		monthKey,
		currentMonthKey,
		previousKey,
		chosenMonthDailies: chosenSnapshot.current.daily,
		previousMonthDailies: chosenSnapshot.previous.daily,
		chosenMonthTotalPence: chosenSnapshot.current.totalPence,
		chosenMonthDeclared: chosenSnapshot.current.daily.length > 0,
		homeCurrentMonthKey: snapshot.currentMonthKey,
		homeCurrentTotalPence: snapshot.current.totalPence,
		accountCount: snapshot.accountCount,
		balanceFlows,
		categories,
		targetPence: status.budget?.totalTargetInCents ?? 0,
		spentPence: status.totalSpent,
		startingBalancePence,
		estimatedEndPence: estimatedEnd,
		avgInPence: avgIn,
		avgOutPence: avgOut,
		daysInMonth: daysInMonthKey(monthKey),
	};
};
