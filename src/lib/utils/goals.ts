/**
 * Client-side goal display utilities
 *
 * Formats goal progress for terminal aesthetic display, computes milestone
 * positions for Emergency Fund progress bars, and provides visual indicators.
 *
 * References:
 * - Project: Terminal aesthetic design system (monospace, brackets, borders)
 * - Currency: formatCurrency() for consistent money display
 */

import { formatCurrency } from './currency';

/**
 * Formatted goal progress for display
 */
export interface FormattedGoalProgress {
	displayString: string; // "£7,500 of £10,000 (75%)"
	progressBar: string; // ASCII progress bar: "████████████░░░░░░░░"
	colorClass: string; // CSS color class based on progress
	isComplete: boolean;
	completeText: string | null;
}

/**
 * Milestone position on a progress bar
 */
export interface MilestonePosition {
	percent: number; // Position as percentage (0-100)
	label: string; // Milestone label (e.g., '1mo', '3mo')
}

/**
 * Current milestone indicator for Emergency Fund
 */
export interface CurrentMilestone {
	index: number; // Index of current milestone (0-3)
	label: string; // Human-readable label
	reached: boolean; // Whether this milestone is reached
}

/**
 * Format goal progress for terminal aesthetic display
 *
 * Produces:
 * - Display string: "£7,500 of £10,000 (75%)"
 * - Progress bar: ASCII bar with █ and ░ characters
 * - Color class: red (<30%), amber (30-70%), green (>70%)
 * - Complete indicator: "✓ Target reached" if 100%
 *
 * @param params - Current, target, and percentage values
 * @returns Formatted progress data for display
 *
 * @example
 * const formatted = formatGoalProgress({
 *   current: 7500,
 *   target: 10000,
 *   percent: 75
 * });
 * // Returns:
 * // {
 * //   displayString: "£7,500.00 of £10,000.00 (75%)",
 * //   progressBar: "████████████████████░░░░░",
 * //   colorClass: "text-amber-700",
 * //   isComplete: false,
 * //   completeText: null
 * // }
 */
export function formatGoalProgress(params: {
	current: number;
	target: number;
	percent: number;
}): FormattedGoalProgress {
	const { current, target, percent } = params;

	// Display string: "£7,500 of £10,000 (75%)"
	const displayString = `${formatCurrency(current)} of ${formatCurrency(target)} (${Math.round(percent)}%)`;

	// Progress bar: 50 characters total (25█ = 50%)
	const barWidth = 50;
	const filledChars = Math.round((percent / 100) * barWidth);
	const emptyChars = barWidth - filledChars;
	const progressBar = '█'.repeat(filledChars) + '░'.repeat(emptyChars);

	// Color class based on percentage
	let colorClass: string;
	if (percent < 30) {
		colorClass = 'text-red-700';
	} else if (percent < 70) {
		colorClass = 'text-amber-700';
	} else {
		colorClass = 'text-green-700';
	}

	// Complete indicator
	const isComplete = percent >= 100;
	const completeText = isComplete ? '✓ Target reached' : null;

	return {
		displayString,
		progressBar,
		colorClass,
		isComplete,
		completeText
	};
}

/**
 * Get milestone positions for Emergency Fund progress bar display
 *
 * For Emergency Fund goals, we render a ruler-style progress bar with
 * tick marks at milestone positions (1mo, 3mo, 6mo, 12mo).
 *
 * @param params - Milestones array, target amount, and current amount
 * @returns Milestone positions and current milestone data
 *
 * @example
 * const positions = getMilestonePositions({
 *   milestones: [
 *     { label: '1mo', amountInCents: 200000, percent: 8.33 },
 *     { label: '3mo', amountInCents: 600000, percent: 25 },
 *     { label: '6mo', amountInCents: 1200000, percent: 50 },
 *     { label: '12mo', amountInCents: 2400000, percent: 100 }
 *   ],
 *   targetAmount: 2400000,
 *   currentAmount: 900000
 * });
 * // Returns:
 * // {
 * //   positions: [
 * //     { percent: 8.33, label: '1mo' },
 * //     { percent: 25, label: '3mo' },
 * //     { percent: 50, label: '6mo' },
 * //     { percent: 100, label: '12mo' }
 * //   ],
 * //   current: { index: 1, label: '3mo', reached: true }
 * // }
 */
export function getMilestonePositions(params: {
	milestones: { label: string; amountInCents: number; percent: number }[];
	targetAmount: number;
	currentAmount: number;
}): {
	positions: MilestonePosition[];
	current: CurrentMilestone;
} {
	const { milestones, targetAmount, currentAmount } = params;

	// Calculate positions for each milestone
	const positions: MilestonePosition[] = milestones.map((m) => ({
		percent: m.percent,
		label: m.label
	}));

	// Determine current milestone (highest milestone <= currentAmount)
	let currentIndex = -1;
	for (let i = 0; i < milestones.length; i++) {
		if (currentAmount >= milestones[i].amountInCents) {
			currentIndex = i;
		} else {
			break; // Milestones are sorted, so we can stop
		}
	}

	// Build current milestone object
	const current: CurrentMilestone =
		currentIndex >= 0
			? {
					index: currentIndex,
					label: milestones[currentIndex].label,
					reached: true
				}
			: {
					index: -1,
					label: 'Not started',
					reached: false
				};

	return { positions, current };
}

/**
 * Format Emergency Fund progress bar with milestone markers
 *
 * Produces a ruler-style display like:
 * |────|────|────|────|  0  1mo  3mo  6mo  12mo
 *
 * @param params - Progress percentage and milestone positions
 * @returns Formatted ruler string for display
 *
 * @example
 * const ruler = formatEmergencyFundRuler({
 *   percent: 37.5,
 *   milestones: [
 *     { percent: 8.33, label: '1mo' },
 *     { percent: 25, label: '3mo' },
 *     { percent: 50, label: '6mo' },
 *     { percent: 100, label: '12mo' }
 *   ]
 * });
 * // Returns something like:
 * // "█|███|██|░|░|░░░░░░░░░░  37.5%"
 */
export function formatEmergencyFundRuler(params: {
	percent: number;
	milestones: MilestonePosition[];
}): string {
	const { percent, milestones } = params;

	// Build progress bar with milestone markers
	const barWidth = 50;
	const filledChars = Math.round((percent / 100) * barWidth);
	const emptyChars = barWidth - filledChars;

	// Start building the bar
	let bar = '█'.repeat(filledChars) + '░'.repeat(emptyChars);

	// Insert milestone markers at their positions
	// We iterate backwards to avoid index shifting
	for (let i = milestones.length - 1; i >= 0; i--) {
		const milestone = milestones[i];
		const markerPos = Math.round((milestone.percent / 100) * barWidth);

		// Check if position is within bounds
		if (markerPos >= 0 && markerPos < bar.length) {
			const before = bar.substring(0, markerPos);
			const after = bar.substring(markerPos + 1);
			bar = `${before}|${after}`;
		}
	}

	// Add percentage display
	return `${bar}  ${Math.round(percent)}%`;
}

/**
 * Calculate days remaining until target date
 *
 * @param targetDate - The target date (optional)
 * @returns Days remaining string or "-" if no date set
 *
 * @example
 * const days = getDaysRemaining(new Date('2026-03-01'));
 * // Returns something like "15 days left" or "2 days left"
 */
export function getDaysRemaining(targetDate: Date | null | undefined): string {
	if (!targetDate) return '-';

	const now = new Date();
	const diffMs = targetDate.getTime() - now.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 0) {
		return 'Overdue';
	} else if (diffDays === 0) {
		return 'Today';
	} else if (diffDays === 1) {
		return '1 day left';
	} else {
		return `${diffDays} days left`;
	}
}
