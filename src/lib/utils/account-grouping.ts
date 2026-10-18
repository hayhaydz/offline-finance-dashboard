/**
 * Account grouping for the accounts index.
 *
 * Pure helper (no DB/Svelte imports) so placement is unit-testable:
 * accounts are grouped into per-type sections, open accounts first and
 * closed accounts behind a collapsed `[Show N closed]` toggle.
 */

export const ACCOUNT_TYPE_ORDER = [
	"current",
	"savings",
	"investment",
	"credit-card",
	"loan",
	"mortgage",
] as const;

export interface AccountTypeSection<T> {
	type: string;
	open: T[];
	closed: T[];
}

/**
 * Group accounts by type into sections.
 *
 * - Sections appear in canonical ACCOUNT_TYPE_ORDER first, then any
 *   unexpected types in first-appearance order.
 * - Within a section, open accounts come first (input order preserved),
 *   closed accounts after (input order preserved) — closed accounts sit
 *   behind the `[Show N closed]` toggle in the UI.
 * - Sections with no accounts are omitted.
 */
export function groupAccountsByType<
	T extends { type: string; closedAt: Date | null },
>(accounts: T[]): AccountTypeSection<T>[] {
	const sections = new Map<string, AccountTypeSection<T>>();
	const rank = new Map<string, number>(
		ACCOUNT_TYPE_ORDER.map((type, index) => [type, index]),
	);

	for (const account of accounts) {
		let section = sections.get(account.type);
		if (!section) {
			section = { type: account.type, open: [], closed: [] };
			sections.set(account.type, section);
			// Unexpected types rank after all canonical ones, in
			// first-appearance order (Map preserves insertion).
			if (!rank.has(account.type)) {
				rank.set(account.type, ACCOUNT_TYPE_ORDER.length + rank.size);
			}
		}
		if (account.closedAt) {
			section.closed.push(account);
		} else {
			section.open.push(account);
		}
	}

	return Array.from(sections.values()).sort(
		(a, b) => (rank.get(a.type) ?? 0) - (rank.get(b.type) ?? 0),
	);
}
