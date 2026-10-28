// src/lib/utils/command-palette.ts

/**
 * ⌘K command palette (#19) — pure command registry + matching.
 * Navigation commands are static; dynamic ones (current-month budget,
 * uncategorised triage) are appended by the component. Matching is
 * case-insensitive substring across label + keywords; empty query
 * returns everything in registry order.
 */

export interface PaletteCommand {
	id: string;
	label: string;
	href: string;
	/** Extra match terms (section names, synonyms). */
	keywords?: string;
	/** Section heading in the palette list. */
	section: string;
}

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
	{ id: "home", label: "Home", href: "/", keywords: "net worth dashboard summary", section: "Navigate" },
	{ id: "accounts", label: "Accounts", href: "/accounts", keywords: "banks balances assets", section: "Navigate" },
	{ id: "accounts-create", label: "Create Account", href: "/accounts/create", keywords: "new account add", section: "Navigate" },
	{ id: "accounts-interest", label: "Interest", href: "/accounts/interest", keywords: "rates projection tax year", section: "Navigate" },
	{ id: "accounts-isa", label: "ISA", href: "/accounts/isa", keywords: "allowance wrapper tax", section: "Navigate" },
	{ id: "accounts-balances", label: "Bulk Balance Update", href: "/accounts/balances", keywords: "update balances staleness all accounts", section: "Navigate" },
	{ id: "accounts-liabilities", label: "Liabilities", href: "/accounts/liabilities", keywords: "debt loans credit cards", section: "Navigate" },
	{ id: "goals", label: "Goals", href: "/goals", keywords: "savings targets", section: "Navigate" },
	{ id: "goals-create", label: "Create Goal", href: "/goals/create", keywords: "new goal add", section: "Navigate" },
	{ id: "goals-archived", label: "Archived Goals", href: "/goals/archived", keywords: "closed old goals", section: "Navigate" },
	{ id: "overview-snapshots", label: "Snapshots", href: "/overview/snapshots", keywords: "net worth history monthly", section: "Navigate" },
	{ id: "overview-routine", label: "Routine", href: "/overview/routine", keywords: "review monthly tasks", section: "Navigate" },
	{ id: "overview-expenses", label: "Expenses", href: "/overview/expenses", keywords: "spending history", section: "Navigate" },
	{ id: "overview-tax", label: "Tax", href: "/overview/tax", keywords: "allowances psa isa year", section: "Navigate" },
	{ id: "alerts", label: "Alerts", href: "/alerts", keywords: "warnings ack snooze", section: "Navigate" },
	{ id: "tools", label: "Tools", href: "/tools", keywords: "simulators what-if", section: "Navigate" },
	{ id: "reports", label: "Reports", href: "/overview/reports", keywords: "charts trends analysis", section: "Navigate" },
	{ id: "settings-general", label: "Settings — General", href: "/settings/general", keywords: "categories preferences", section: "Navigate" },
	{ id: "settings-security", label: "Settings — Session & Security", href: "/settings/profile", keywords: "session logout devices", section: "Navigate" },
];

/** Current calendar month as a YYYY-MM budget slug. */
export function currentMonthSlug(now = new Date()): string {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function dynamicPaletteCommands(now = new Date()): PaletteCommand[] {
	const month = currentMonthSlug(now);
	return [
		{
			id: "budget-current",
			label: `Budget — ${month}`,
			href: `/overview/budgets/${month}`,
			keywords: "spend target pace current month",
			section: "Jump",
		},
		{
			id: "budget-triage",
			label: `Uncategorised — ${month}`,
			href: `/overview/budgets/${month}/uncategorised`,
			keywords: "tag triage categorise spending",
			section: "Jump",
		},
	];
}

/** Filter commands by a query; empty/blank query → all, in given order. */
export function filterCommands(
	commands: readonly PaletteCommand[],
	query: string,
): PaletteCommand[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...commands];
	return commands.filter((cmd) =>
		`${cmd.label} ${cmd.section} ${cmd.keywords ?? ""}`.toLowerCase().includes(q),
	);
}
