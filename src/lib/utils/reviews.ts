export interface ChecklistItem {
	key: string;
	label: string;
	description: string;
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
	{
		key: "snapshot",
		label: "Take a net worth snapshot",
		description: "Record a point-in-time snapshot of your finances",
	},
	{
		key: "balances",
		label: "Update account balances",
		description: "Ensure no account balance is stale",
	},
	{
		key: "isa-contributions",
		label: "Log ISA contributions",
		description: "Record any deposits into ISA or LISA accounts",
	},
	{
		key: "goal-allocations",
		label: "Review goal allocations",
		description: "Check goals are funded correctly",
	},
	{
		key: "interest-rates",
		label: "Check interest rates",
		description: "Update any changed savings rates",
	},
	{
		key: "alerts",
		label: "Clear active alerts",
		description: "Review and action any open alerts",
	},
];

/**
 * Return a human-readable label for a yearMonth string, e.g. "March 2026".
 */
export function formatYearMonth(yearMonth: string): string {
	const [year, month] = yearMonth.split("-");
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
	return date.toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}
