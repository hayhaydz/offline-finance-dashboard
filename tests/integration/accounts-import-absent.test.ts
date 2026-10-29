import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { actions } from "../../src/routes/settings/data/+page.server";
import ImportWizard from "../../src/lib/components/import-wizard/import-wizard.svelte";

// v3 B06 slice S6 (R21): the "accounts" CSV import is GONE and stays gone.
// Accounts are created through the app UI (or seeded), never bulk-imported
// — the CSV pipeline is transaction-shaped only. This is the verification
// net for that absence: if an accounts-import surface ever reappears, this
// fails and forces a conscious decision.

describe("accounts CSV import is absent (R21)", () => {
	it("settings/data actions contain no accounts-import action", () => {
		const keys = Object.keys(actions);
		expect(
			keys.filter((key) => /account/i.test(key) && /import|csv/i.test(key)),
		).toEqual([]);
		// The import actions that DO exist are transaction/history-shaped
		expect(keys).toContain("import");
		expect(keys).toContain("bulk-analyze");
	});

	it("no route or component mentions an accounts csv import", () => {
		const roots = ["src/routes", "src/lib/components"];
		const offenders: string[] = [];
		// CSV-import semantics only; plain ES `import AccountHeader` must not match
		const pattern = /(accounts?[ _-]+)+(csv[ _-]+)?import|import[ _-]+accounts?[ _-]+csv|import[ _-]+csv[ _-]+accounts?/i;
		for (const root of roots) {
			const stack = [path.resolve(root)];
			while (stack.length > 0) {
				const dir = stack.pop() as string;
				for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
					const full = path.join(dir, entry.name);
					if (entry.isDirectory()) {
						stack.push(full);
						continue;
					}
					if (!/\.(svelte|ts)$/.test(entry.name)) continue;
					const content = fs.readFileSync(full, "utf8");
					if (pattern.test(content)) offenders.push(path.relative(".", full));
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("the transaction import wizard only targets accounts, never creates them", () => {
		const { body } = render(ImportWizard, {
			props: {
				accounts: [
					{
						id: 1,
						slug: "slug1",
						name: "A",
						type: "current",
						txCount: 0,
						firstDate: null,
						lastDate: null,
					},
				],
				categories: [],
				form: undefined,
			},
		});
		// It lists accounts as import TARGETS (a select) — it never offers
		// account creation or an accounts file upload
		expect(body).not.toMatch(/import accounts?|accounts? import/i);
	});
});
