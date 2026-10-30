import fs from "node:fs";
import path from "path";
import { describe, expect, it } from "vitest";

// R-H4 regression net (hardened 2026-10-30): bracket-link elements must not
// carry LITERAL brackets in their text — the CSS utility supplies exactly one
// pair (app.css ::before/::after). Literal brackets rendered `[[Text]]`
// (the R16 bug class; found app-wide in B09's vision review, again on account
// pages in sweep 8). This version is multiline-aware (the sweep-8 fixes moved
// labels onto their own lines) and catches both the owning-tag form and the
// plain-text-child form.

const CHECKBOX_GLYPHS = ["[X]", "[ ]", "[x]"];

function scan(file: string): string[] {
	const content = fs.readFileSync(file, "utf8");
	const offenders: string[] = [];

	// Form 1: owning tag carries the class AND the literal-bracket label
	// (multiline: tag open ... > then optional whitespace, [label], close)
	const owning =
		/class="[^"]*bracket-link[^"]*"[^>]*>\s*\[([^\][\s][^\]]{0,80})\]\s*</g;
	for (const m of content.matchAll(owning)) {
		if (CHECKBOX_GLYPHS.some((g) => `[${m[1]}]`.includes(g))) continue;
		offenders.push(`owning-tag label: [${m[1]}]`);
	}

	// Form 2: a line contains bracket-link AND a >[label]< text node whose
	// owning tag (nearest preceding class attr) is the bracket-link element
	for (const line of content.split("\n")) {
		if (!line.includes("bracket-link")) continue;
		for (const m of line.matchAll(/>\[([^\][\s][^\]]{0,80})\]</g)) {
			if (CHECKBOX_GLYPHS.some((g) => `[${m[1]}]`.includes(g))) continue;
			const before = line.slice(0, m.index ?? 0);
			const lastClass = /class="([^"]*)"[^>]*>$/.exec(before);
			if (lastClass?.[1].includes("bracket-link")) {
				offenders.push(`same-line label: [${m[1]}]`);
			}
		}
	}
	return offenders.map((o) => `${path.relative(".", file)}: ${o}`);
}

describe("bracket-link text convention (R-H4, hardened)", () => {
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
				offenders.push(...scan(full));
			}
		}
		expect(offenders).toEqual([]);
	});

	it("self-test: the scanner flags a known-bad snippet", () => {
		const tmp = path.join(
			path.resolve("tests/integration"),
			".bracket-self-test.svelte",
		);
		try {
			fs.writeFileSync(
				tmp,
				'<button class="bracket-link text-xs">[Delete]</button>',
			);
			expect(scan(tmp).length).toBeGreaterThan(0);
		} finally {
			fs.rmSync(tmp, { force: true });
		}
	});
});
