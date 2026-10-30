// tests/unit/palette-registry-sync.test.ts
//
// v3 R-H11: the ⌘K palette mirrors the v3 registries. The server
// reports registry pulls server-only engines, so its slugs+titles are
// duplicated in the client-safe REPORT_MIRROR. These tests make that
// duplication safe: drift in either direction fails the suite.

import { describe, expect, it } from "vitest";

import { REPORTS } from "../../src/lib/server/reports-v2";
import { TOOLS } from "../../src/lib/utils/tool-registry";
import {
	PALETTE_COMMANDS,
	REPORT_COMMANDS,
	REPORT_MIRROR,
	TOOL_COMMANDS,
} from "../../src/lib/utils/command-palette";

describe("palette registry sync (R-H11)", () => {
	it("every server report has a palette mirror entry with the same slug and title", () => {
		expect(REPORTS).not.toHaveLength(0);
		for (const def of REPORTS) {
			const mirror = REPORT_MIRROR.find((m) => m.slug === def.slug);
			expect(mirror, `report ${def.slug} missing from REPORT_MIRROR`).toBeDefined();
			expect(mirror!.title).toBe(def.title);
		}
	});

	it("REPORT_MIRROR has no stale entries", () => {
		for (const m of REPORT_MIRROR) {
			expect(
				REPORTS.some((def) => def.slug === m.slug),
				`mirror slug ${m.slug} not in server registry`,
			).toBe(true);
		}
		expect(REPORT_MIRROR).toHaveLength(REPORTS.length);
	});

	it("report commands point at the registry route pattern", () => {
		for (const m of REPORT_MIRROR) {
			const cmd = REPORT_COMMANDS.find((c) => c.id === `report-${m.slug}`);
			expect(cmd, `no command for report ${m.slug}`).toBeDefined();
			expect(cmd!.href).toBe(`/overview/reports/${m.slug}`);
			expect(cmd!.section).toBe("Reports");
		}
	});

	it("every tool has a palette command with the right href", () => {
		expect(TOOLS).not.toHaveLength(0);
		for (const t of TOOLS) {
			const cmd = TOOL_COMMANDS.find((c) => c.id === `tool-${t.slug}`);
			expect(cmd, `no command for tool ${t.slug}`).toBeDefined();
			expect(cmd!.href).toBe(`/tools/${t.slug}`);
			expect(cmd!.label).toBe(t.name);
			expect(cmd!.section).toBe("Tools");
		}
		expect(TOOL_COMMANDS).toHaveLength(TOOLS.length);
	});

	it("v3 surfaces are navigable: bills + data management present", () => {
		const hrefs = new Set(PALETTE_COMMANDS.map((c) => c.href));
		expect(hrefs.has("/overview/bills")).toBe(true);
		expect(hrefs.has("/settings/data")).toBe(true);
	});

	it("the full command set has unique ids", () => {
		const ids = [
			...PALETTE_COMMANDS,
			...REPORT_COMMANDS,
			...TOOL_COMMANDS,
		].map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
