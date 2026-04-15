import { devLog } from "$lib/server/logger";
import { MS_PER_MONTH } from "$lib/utils/time-constants";
import type {
	DebtGoalInput,
	PayoffProjection,
	DebtGoalWithProjection,
	DebtStrategyMetrics,
} from "$lib/types/debt";
export type {
	DebtGoalInput,
	PayoffProjection,
	DebtGoalWithProjection,
	DebtStrategyMetrics,
} from "$lib/types/debt";

const HYBRID_THRESHOLD_CENTS = 100000; // £1,000

export function calculatePayoffProjection(params: {
	balanceInCents: number;
	monthlyPaymentInCents: number;
	aprBasisPoints: number | null;
}): PayoffProjection {
	const { balanceInCents, monthlyPaymentInCents, aprBasisPoints } = params;

	if (balanceInCents <= 0) {
		return { months: 0, totalInterestInCents: 0, projectedPayoffDate: new Date() };
	}

	if (monthlyPaymentInCents <= 0) {
		return { months: null, totalInterestInCents: null, projectedPayoffDate: null };
	}

	const now = new Date();

	if (!aprBasisPoints || aprBasisPoints === 0) {
		const months = Math.ceil(balanceInCents / monthlyPaymentInCents);
		const projectedPayoffDate = new Date(
			now.getTime() + months * MS_PER_MONTH,
		);
		return { months, totalInterestInCents: 0, projectedPayoffDate };
	}

	const monthlyRate = aprBasisPoints / 10000 / 12;

	const monthlyInterest = balanceInCents * monthlyRate;
	if (monthlyPaymentInCents <= monthlyInterest) {
		return { months: null, totalInterestInCents: null, projectedPayoffDate: null };
	}

	const numerator = -Math.log(
		1 - (monthlyRate * balanceInCents) / monthlyPaymentInCents,
	);
	const denominator = Math.log(1 + monthlyRate);
	const months = Math.ceil(numerator / denominator);

	const totalPaidInCents = monthlyPaymentInCents * months;
	const totalInterestInCents = Math.max(0, totalPaidInCents - balanceInCents);

	const projectedPayoffDate = new Date(
		now.getTime() + months * MS_PER_MONTH,
	);

	return { months, totalInterestInCents, projectedPayoffDate };
}

export function calculateStrategyOrder(
	debts: DebtGoalInput[],
	strategy: "snowball" | "avalanche" | "hybrid",
): DebtGoalWithProjection[] {
	const sorted = [...debts];

	if (strategy === "snowball") {
		sorted.sort((a, b) => a.remainingInCents - b.remainingInCents);
	} else if (strategy === "avalanche") {
		sorted.sort((a, b) => (b.aprBasisPoints ?? 0) - (a.aprBasisPoints ?? 0));
	} else {
		const small = sorted
			.filter((d) => d.remainingInCents < HYBRID_THRESHOLD_CENTS)
			.sort((a, b) => a.remainingInCents - b.remainingInCents);
		const large = sorted
			.filter((d) => d.remainingInCents >= HYBRID_THRESHOLD_CENTS)
			.sort((a, b) => (b.aprBasisPoints ?? 0) - (a.aprBasisPoints ?? 0));
		sorted.length = 0;
		sorted.push(...small, ...large);
	}

	return sorted.map((debt) => {
		const projection = calculatePayoffProjection({
			balanceInCents: debt.remainingInCents,
			monthlyPaymentInCents: debt.minimumMonthlyInCents,
			aprBasisPoints: debt.aprBasisPoints,
		});

		return {
			...debt,
			projectedPayoffDate: projection.projectedPayoffDate,
			totalInterestInCents: projection.totalInterestInCents,
		};
	});
}

export function calculateDebtStrategyMetrics(
	debts: DebtGoalInput[],
): DebtStrategyMetrics {
	if (debts.length === 0) {
		return {
			totalDebtInCents: 0,
			totalMonthlyMinimumInCents: 0,
			projectedDebtFreeDate: null,
			snowballOrder: [],
			avalancheOrder: [],
			hybridOrder: [],
			interestSavedByAvalancheInCents: null,
			monthsSavedByAvalanche: null,
		};
	}

	const totalDebtInCents = debts.reduce((sum, d) => sum + d.remainingInCents, 0);
	const totalMonthlyMinimumInCents = debts.reduce(
		(sum, d) => sum + d.minimumMonthlyInCents,
		0,
	);

	const snowballOrder = calculateStrategyOrder(debts, "snowball");
	const avalancheOrder = calculateStrategyOrder(debts, "avalanche");
	const hybridOrder = calculateStrategyOrder(debts, "hybrid");

	const allProjectedDates = avalancheOrder
		.map((d) => d.projectedPayoffDate)
		.filter((d): d is Date => d !== null);
	const projectedDebtFreeDate =
		allProjectedDates.length > 0
			? new Date(Math.max(...allProjectedDates.map((d) => d.getTime())))
			: null;

	const snowballTotalInterest = snowballOrder.reduce(
		(sum, d) => sum + (d.totalInterestInCents ?? 0),
		0,
	);
	const avalancheTotalInterest = avalancheOrder.reduce(
		(sum, d) => sum + (d.totalInterestInCents ?? 0),
		0,
	);

	const interestSavedByAvalancheInCents =
		snowballTotalInterest - avalancheTotalInterest;

	const snowballMaxMonths = Math.max(
		...snowballOrder.map((d) => {
			if (!d.projectedPayoffDate) return 0;
			return Math.ceil(
				(d.projectedPayoffDate.getTime() - Date.now()) / MS_PER_MONTH,
			);
		}),
	);
	const avalancheMaxMonths = Math.max(
		...avalancheOrder.map((d) => {
			if (!d.projectedPayoffDate) return 0;
			return Math.ceil(
				(d.projectedPayoffDate.getTime() - Date.now()) / MS_PER_MONTH,
			);
		}),
	);
	const monthsSavedByAvalanche = snowballMaxMonths - avalancheMaxMonths;

	devLog("debtStrategy", "Calculated debt strategy metrics", {
		totalDebtInCents,
		totalMonthlyMinimumInCents,
		debtCount: debts.length,
		interestSavedByAvalancheInCents,
		monthsSavedByAvalanche,
	});

	return {
		totalDebtInCents,
		totalMonthlyMinimumInCents,
		projectedDebtFreeDate,
		snowballOrder,
		avalancheOrder,
		hybridOrder,
		interestSavedByAvalancheInCents:
			interestSavedByAvalancheInCents > 0 ? interestSavedByAvalancheInCents : null,
		monthsSavedByAvalanche:
			monthsSavedByAvalanche > 0 ? monthsSavedByAvalanche : null,
	};
}
