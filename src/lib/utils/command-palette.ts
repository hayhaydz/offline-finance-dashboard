// src/lib/utils/command-palette.ts

// ⌘K command palette (#19) — pure command registry + matching.
// v3 R-H11: the palette mirrors the v3 registries — tools come straight
// from tool-registry (client-safe pure data); reports are duplicated
// here (the server registry pulls server-only engines) and pinned by a
// sync test so the two can never drift.

import { TOOLS } from "./tool-registry";

/** Quick actions the component executes instead of navigating (#19's
 * "jump + quick actions" — actions landed in a Phase 9 polish cycle). */
export type PaletteActionId = "toggle-ascii" | "open-help";

/** Report mirror of src/lib/server/reports-v2.ts (slugs + titles only;
 * kept in sync by tests/unit/palette-registry-sync.test.ts). */
export const REPORT_MIRROR: readonly { slug: string; title: string }[] = [
	{ slug: "net-worth-trajectory", title: "Net Worth Trajectory" },
	{ slug: "savings-rate", title: "Savings Rate & Runway" },
	{ slug: "interest-vs-allowance", title: "Interest vs the Personal Savings Allowance" },
	{ slug: "credit-strategy", title: "Credit Strategy — Stoozing & Payoff Pressure" },
	{ slug: "spending-profile", title: "Spending Profile — Where the Money Goes" },
	{ slug: "debt-horizon", title: "Debt Horizon" },
	{ slug: "income-vs-deposits", title: "Income vs Deposit Evidence" },
	{ slug: "rate-shop", title: "Rate Shop — Your Own Best Rates" },
	{ slug: "net-worth-seasonality", title: "Net-Worth Seasonality" },
];

export interface PaletteCommand {
	id: string;
	label: string;
	href: string;
	/** Extra match terms (section names, synonyms). */
	keywords?: string;
	/** Section heading in the palette list. */
	section: string;
	/** When set, the palette runs this action instead of navigating. */
	action?: PaletteActionId;
}

/** v3 R-H11: one command per report paper (reports registry mirror). */
export const REPORT_COMMANDS: readonly PaletteCommand[] = REPORT_MIRROR.map((r) => ({
	id: `report-${r.slug}`,
	label: r.title,
	href: `/overview/reports/${r.slug}`,
	keywords: "report paper findings dated science",
	section: "Reports",
}));

/** v3 R-H11: one command per tool sub-page (single source: tool-registry). */
export const TOOL_COMMANDS: readonly PaletteCommand[] = TOOLS.map((t) => ({
	id: `tool-${t.slug}`,
	label: t.name,
	href: `/tools/${t.slug}`,
	keywords: `tool calculator ${t.blurb}`,
	section: "Tools",
}));

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
	{ id: "overview-bills", label: "Bills", href: "/overview/bills", keywords: "regular payments direct debits next due", section: "Navigate" },
	{ id: "overview-tax", label: "Tax", href: "/overview/tax", keywords: "allowances psa isa year", section: "Navigate" },
	{ id: "alerts", label: "Alerts", href: "/alerts", keywords: "warnings ack snooze", section: "Navigate" },
	{ id: "tools", label: "Tools", href: "/tools", keywords: "simulators what-if", section: "Navigate" },
	{ id: "reports", label: "Reports", href: "/overview/reports", keywords: "charts trends analysis", section: "Navigate" },
	{ id: "settings-general", label: "Settings — General", href: "/settings/general", keywords: "categories preferences", section: "Navigate" },
	{ id: "settings-security", label: "Settings — Profile & Session", href: "/settings/profile", keywords: "session logout devices user info", section: "Navigate" },
	{ id: "settings-data", label: "Settings — Data Management", href: "/settings/data", keywords: "import export csv reimport queue bulk history", section: "Navigate" },
];

/** Quick actions (executed by the component, not navigation). */
export const PALETTE_ACTIONS: readonly PaletteCommand[] = [
	{
		id: "action-ascii",
		label: "Toggle ASCII chart mode",
		href: "/overview/reports",
		action: "toggle-ascii",
		keywords: "ascii terminal variant pure text charts",
		section: "Action",
	},
	{
		id: "action-help",
		label: "Keyboard shortcuts",
		href: "",
		action: "open-help",
		keywords: "help keys j k enter question overlay",
		section: "Action",
	},
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
			href: `/overview/trends/${month}`,
			keywords: "spend target pace current month",
			section: "Jump",
		},
		{
			id: "budget-triage",
			label: `Uncategorised — ${month}`,
			href: `/overview/trends/${month}/uncategorised`,
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
