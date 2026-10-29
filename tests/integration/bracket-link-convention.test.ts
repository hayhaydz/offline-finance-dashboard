import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// R-H4 regression net: bracket-link elements must not carry LITERAL
// brackets in their text — the CSS utility supplies exactly one pair
// (app.css ::before/::after). Literal brackets rendered `[[Text]]`
// (the R16 bug class, found app-wide in B09's vision review).

describe("bracket-link text convention (R-H4)", () => {
	it("no bracket-link element renders literal brackets around its label", () => {
		const offenders: string[] = [];
		const stack = [path.resolve("src")];
		while (stack.length > 0) {
			const dir = stack.pop() as string;
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					stack.push(full);
					continue;
				}
				if (!entry.name.endsWith(".svelte")) continue;
				const content = fs.readFileSync(full, "utf8");
				for (const line of content.split("\n")) {
					if (!line.includes("bracket-link")) continue;
					// checkbox glyphs [X]/[ ] are sibling spans, not the label
					for (const match of line.matchAll(
						/>[([][^\[\]{}<]{1,60}[\])]</g,
					)) {
						if (match[0].includes("[X]") || match[0].includes("[ ]")) continue;
						// the owning tag must itself be the bracket-link (not a
						// neighbouring span on the same line)
						const before = line.slice(0, match.index ?? 0);
						const lastClass = /class="([^"]*)"[^>]*>$/.exec(before);
						if (lastClass?.[1].includes("bracket-link")) {
							offenders.push(
								`${path.relative(".", full)}: ${match[0].slice(1, -2)}`,
							);
						}
					}
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
