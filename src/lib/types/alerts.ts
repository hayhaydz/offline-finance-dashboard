export type AlertSeverity = 'info' | 'amber' | 'red';

export type AlertType =
	| 'MATURITY_SOON_30'
	| 'MATURITY_SOON_7'
	| 'MATURITY_SOON_1'
	| 'MATURITY_PASSED_NO_RATE'
	| 'RATE_DECREASED_SAVINGS'
	| 'RATE_INCREASED_LIABILITY'
	| 'NO_RATE_SET'
	| 'STALE_BALANCE'
	| 'CREDIT_LIMIT_APPROACHING'
	| 'CREDIT_LIMIT_NEAR_MAX'
	| 'NO_LIABILITY_PAYMENT'
	| 'INTEREST_ACCRUED_UNPOSTED'
	| 'ZERO_BALANCE_ACTIVE'
	| 'PREMIUM_BONDS_OVER_LIMIT'
	| 'NO_DISBURSEMENT'
	| 'UNUSED_ISA_ACCOUNT'
	| 'CLOSED_WITH_BALANCE'
	| 'ISA_NEARLY_FULL'
	| 'ISA_FULL'
	| 'PSA_NEARLY_EXCEEDED'
	| 'PSA_EXCEEDED'
	| 'GOAL_DEADLINE_APPROACHING'
	| 'GOAL_NEGATIVE_BALANCE'
	| 'NO_SNAPSHOT_RECENTLY'
	| 'ADDITIONAL_RATE_PSA_ZERO'
	| 'NO_MONTHLY_REVIEW';

export interface Alert {
	id: string;           // deterministic: `${type}:${accountSlug ?? 'global'}`
	type: AlertType;
	severity: AlertSeverity;
	title: string;
	message: string;
	accountSlug?: string;    // present for account-level alerts
	accountName?: string;
	accountType?: string;    // e.g. 'savings' | 'mortgage' | 'credit-card' | 'loan' | etc.
	accountCategory?: string; // 'asset' | 'liability'
	href?: string;           // deep link to relevant page
	triggeredAt: number;     // Unix ms timestamp — Date objects don't survive SvelteKit load serialization
}

export interface AlertGroup {
	title: string;
	type: AlertType;
	severity: AlertSeverity;
	alerts: Alert[];
}

export const SEVERITY_ORDER: Record<AlertSeverity, number> = {
	red: 0,
	amber: 1,
	info: 2,
};

export function sortAlerts(alerts: Alert[]): Alert[] {
	return [...alerts].sort((a, b) => {
		const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
		if (s !== 0) return s;
		return b.triggeredAt - a.triggeredAt;
	});
}

/** Group a pre-sorted flat alert list by title, preserving order of first occurrence. */
export function groupAlertsByTitle(alerts: Alert[]): AlertGroup[] {
	const map = new Map<string, AlertGroup>();
	for (const alert of alerts) {
		const existing = map.get(alert.title);
		if (existing) {
			existing.alerts.push(alert);
		} else {
			map.set(alert.title, { title: alert.title, type: alert.type, severity: alert.severity, alerts: [alert] });
		}
	}
	return Array.from(map.values());
}
