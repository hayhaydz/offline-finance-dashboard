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
	// Sweep-9 hardening: arrow functions in attributes (onclick={() => …})
	// contain ">" which truncated the tag-end match — neutralise them before
	// the owning-tag scan so labels after the REAL tag close are still seen.
	const neutralised = content.replace(/=>/g, "==");
	const offenders: string[] = [];

	// Form 1: owning tag carries the class AND the literal-bracket label
	// (multiline: tag open ... > then optional whitespace, [label], close)
	const owning =
		/class="[^"]*bracket-link[^"]*"[^>]*>\s*\[([^\][\s][^\]]{0,80})\]\s*</g;
	for (const m of neutralised.matchAll(owning)) {
		if (CHECKBOX_GLYPHS.some((g) => `[${m[1]}]`.includes(g))) continue;
		offenders.push(`owning-tag label: [${m[1]}]`);
	}

	// Form 2: a line contains bracket-link AND a >[label]< text node whose
	// owning tag (nearest preceding class attr) is the bracket-link element
	for (const line of neutralised.split("\n")) {
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
	const lines = neutralised.split("\n");
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
	// Form 5 (v3.1 A03): single/double-quoted bracketed labels in
	// expressions within the bracket-link window — e.g. the balances
	// submit ternary `cond ? 'Working…' : '[Update Balances]'` (Forms 3/4
	// only scan backticks and empty ternaries). Same space guard so
	// glyph codes stay legal; checkbox glyph pairs ([X]/[ ]) are state
	// marks on non-bracket elements and stay legal too.
	for (let i = 0; i < lines.length; i++) {
		if (!/class="[^"]*bracket-link/.test(lines[i])) continue;
		const window = lines.slice(i + 1, i + 11);
		for (const w of window) {
			const trimmed = w.trim();
			if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
			for (const m of trimmed.matchAll(/(['"])(\[[^\]'"]{0,80}\])\1/g)) {
				if (!m[2].includes(" ")) continue; // glyph codes stay legal
				if (CHECKBOX_GLYPHS.includes(m[2])) continue; // state marks
				offenders.push(`quoted-label: ${m[2]}`);
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

	it("self-test: quoted-string ternary labels are flagged (Form 5)", () => {
		const tmp = path.join(
			path.resolve("tests/integration"),
			".bracket-self-test.svelte",
		);
		try {
			fs.writeFileSync(
				tmp,
				[
					'<button type="submit" class="bracket-link text-sm">',
					"	{busy ? 'Working…' : '[Update Things]'}",
					"</button>",
				].join("\n"),
			);
			const found = scan(tmp);
			expect(found.join("\n")).toContain("quoted-label: [Update Things]");
			// bracket-free branch and glyph codes stay legal
			fs.writeFileSync(
				tmp,
				[
					'<button type="submit" class="bracket-link text-sm">',
					"	{busy ? 'Working…' : 'Update Things'}",
					"</button>",
				].join("\n"),
			);
			expect(scan(tmp)).toEqual([]);
		} finally {
			fs.rmSync(tmp, { force: true });
		}
	});
});
