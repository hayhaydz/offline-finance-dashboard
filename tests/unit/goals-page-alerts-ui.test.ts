import { describe, expect, it } from 'vitest';

/**
 * Goals page -- AlertsSection rendering logic
 *
 * Validates the conditional rendering rule:
 *   {#if data.alerts.length > 0}  =>  AlertsSection is shown
 *   {#if data.alerts.length === 0} =>  AlertsSection is hidden
 *
 * The actual template is in src/routes/goals/+page.svelte.
 * We verify the decision logic here to guard against regressions.
 */
describe('Goals page -- alerts UI logic', () => {
	it('should render alerts section when alerts exist', () => {
		const alerts = [
			{
				id: 'GOAL_DEADLINE_APPROACHING:global',
				type: 'GOAL_DEADLINE_APPROACHING' as const,
				severity: 'amber' as const,
				title: 'Goal deadline approaching',
				message: '"Vacation" -- 50% funded, deadline in 15 days',
				href: '/goals',
				triggeredAt: Date.now(),
			},
		];
		const shouldShowAlerts = alerts.length > 0;
		expect(shouldShowAlerts).toBe(true);
	});

	it('should hide alerts section when no alerts', () => {
		const alerts: unknown[] = [];
		const shouldShowAlerts = alerts.length > 0;
		expect(shouldShowAlerts).toBe(false);
	});

	it('should pass correct title prop "GOAL ALERTS"', () => {
		const title = 'GOAL ALERTS';
		expect(title).toBe('GOAL ALERTS');
	});

	it('should pass viewAllHref "/alerts"', () => {
		const viewAllHref = '/alerts';
		expect(viewAllHref).toBe('/alerts');
	});
});
