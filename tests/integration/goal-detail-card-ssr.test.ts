import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import GoalDetailCard from "$lib/components/GoalDetailCard.svelte";

// P0-1 regression (2026-10-27 audit): savings goal detail pages 500'd with
// `ReferenceError: Cannot access 'progress' before initialization` because
// `progressColor` was declared before the `progress` derived it reads.
// Svelte SSR evaluates deriveds eagerly, so declaration order matters.
// These tests server-render the card for both goal variants — the exact
// code path that crashed `/goals/[slug]` for savings goals.

const savingsGoal = {
	name: "Emergency Fund",
	slug: "test-savings-goal",
	targetAmountInCents: 1_200_000,
	currentAllocation: 480_000,
	targetDate: new Date("2027-04-05"),
	isEmergencyFund: true,
	goalType: "savings" as const
};

const debtGoal = {
	name: "Clear the card",
	slug: "test-debt-goal",
	targetAmountInCents: 320_000,
	currentAllocation: -480_000,
	targetDate: null,
	isEmergencyFund: false,
	goalType: "debt" as const,
	startingBalanceInCents: -800_000
};

describe("GoalDetailCard SSR smoke (P0-1)", () => {
	it("server-renders a savings goal without throwing", () => {
		const { body } = render(GoalDetailCard, { props: { goal: savingsGoal } });
		// emergency-fund milestone row is savings-specific output
		expect(body).toContain("width: 40%");
	});

	it("renders savings progress as a percentage of target", () => {
		const { body } = render(GoalDetailCard, { props: { goal: savingsGoal } });
		// 480_000 / 1_200_000 = 40% — must appear in the progress bar width
		expect(body).toContain("width: 40%");
	});

	it("server-renders a debt goal without throwing", () => {
		const { body } = render(GoalDetailCard, { props: { goal: debtGoal } });
		// debt-specific stat labels prove the debt branch rendered
		expect(body).toContain("PAID");
		expect(body).toContain("STARTING");
		expect(body).toContain("View Debt Account");
	});

	it("renders debt progress from starting balance, not target", () => {
		const { body } = render(GoalDetailCard, { props: { goal: debtGoal } });
		// 480_000 / 800_000 = 60% paid down
		expect(body).toContain("width: 60%");
	});

	it("renders a zero-target goal without divide-by-zero or crash", () => {
		const { body } = render(GoalDetailCard, {
			props: { goal: { ...savingsGoal, targetAmountInCents: 0, currentAllocation: 0 } }
		});
		expect(body).toContain("width: 0%");
	});
});
