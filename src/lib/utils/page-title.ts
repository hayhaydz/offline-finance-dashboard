// src/lib/utils/page-title.ts

/**
 * v3 R-H13: per-page document titles (lighthouse document-title audit
 * failed app-wide — no <title> anywhere). Pure path→title mapping used
 * by the root layout's <svelte:head>; unknown/slug paths fall back to
 * the deepest recognised segment so detail pages stay honest
 * ("ACCOUNTS · DETAIL") without needing server data.
 */

const SEGMENT_LABELS: Record<string, string> = {
	"": "HOME",
	login: "LOGIN",
	register: "REGISTER",
	unlock: "UNLOCK",
	"dev-login": "DEV LOGIN",
	"forgot-password": "FORGOT PASSWORD",
	accounts: "ACCOUNTS",
	create: "CREATE",
	interest: "INTEREST",
	isa: "ISA",
	balances: "BALANCES",
	liabilities: "LIABILITIES",
	goals: "GOALS",
	debt: "DEBT PAYOFF",
	archived: "ARCHIVED",
	overview: "OVERVIEW",
	snapshots: "SNAPSHOTS",
	routine: "ROUTINE",
	budgets: "BUDGETS",
	expenses: "EXPENSES",
	bills: "BILLS",
	reports: "REPORTS",
	tax: "TAX",
	income: "INCOME",
	alerts: "ALERTS",
	tools: "TOOLS",
	settings: "SETTINGS",
	general: "GENERAL",
	profile: "PROFILE & SESSION",
	security: "SECURITY",
	data: "DATA MANAGEMENT",
	uncategorised: "UNCATEGORISED",
	notes: "NOTES",
	"confirm-archive": "CONFIRM ARCHIVE",
	edit: "EDIT",
};

/** Nanoid(21) route slugs (no vowels/l-style chars) are detail pages. */
function looksLikeSlug(segment: string): boolean {
	return segment.length >= 15 && /^[a-zA-Z0-9_-]+$/.test(segment);
}

export function documentTitle(pathname: string, app = "OFFLINE-FINANCE"): string {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return app;

	const parts: string[] = [];
	for (const segment of segments) {
		if (looksLikeSlug(segment)) {
			parts.push("DETAIL");
			break; // nothing meaningful after a slug
		}
		const label = SEGMENT_LABELS[segment];
		if (label) {
			parts.push(label);
		} else if (/^\d{4}-\d{2}(-\d{2})?$/.test(segment)) {
			parts.push(segment); // budget month / tax year-style segment
		}
	}
	if (parts.length === 0) return app;
	return `${app} — ${parts.join(" · ")}`;
}
