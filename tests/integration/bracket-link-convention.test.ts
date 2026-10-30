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

	// Form 3 (sweep 9): template-literal labels inside bracket-link element
	// bodies — e.g. `[Hide ${n} closed]` in a ternary (the accounts closed-
	// toggle relapse). Window: 10 lines after a bracket-link tag open.
	// Requires a space inside the brackets so glyph codes ([+], [-], [!!])
	// and pure placeholders stay legal; comment lines are skipped.
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (!/class="[^"]*bracket-link/.test(lines[i])) continue;
		const window = lines.slice(i + 1, i + 11);
		for (const w of window) {
			const trimmed = w.trim();
			if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
			for (const m of trimmed.matchAll(/`(\[[^`\]]{0,80}\])`/g)) {
				if (!m[1].includes(" ")) continue; // glyph codes stay legal
				offenders.push(`template-literal label: ${m[1]}`);
			}
		}
	}
	// Form 4 (sweep 9): bracket-link elements whose label expression is
	// ALWAYS empty — `{cond ? '' : ''}` renders an unnamed control (the
	// NotesSection add-note relapse; axe button-name failure).
	for (let i = 0; i < lines.length; i++) {
		if (!/class="[^"]*bracket-link/.test(lines[i])) continue;
		const window = lines.slice(i + 1, i + 8);
		for (const w of window) {
			if (/\?\s*''\s*:\s*''/.test(w)) {
				offenders.push(`always-empty label: ${w.trim().slice(0, 60)}`);
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

	it("self-test: template-literal ternary labels are flagged (Form 3)", () => {
		const tmp = path.join(
			path.resolve("tests/integration"),
			".bracket-self-test.svelte",
		);
		try {
			fs.writeFileSync(
				tmp,
				[
					'<button type="button" class="bracket-link text-xs"',
					"	onclick={() => toggle()}>",
					"{open",
					"	? `[Hide ${n} closed]`",
					"	: `Show ${n} closed`}",
					"</button>",
				].join("\n"),
			);
			const found = scan(tmp);
			expect(found.join("\n")).toContain("template-literal label: [Hide ${n} closed]");
			// the bracket-free branch must NOT be flagged
			expect(found.join("\n")).not.toContain("Show ${n} closed`}");
		} finally {
			fs.rmSync(tmp, { force: true });
		}
	});
});
