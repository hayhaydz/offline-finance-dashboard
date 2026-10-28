import { describe, expect, it } from "vitest";
import {
	asciiBars,
	asciiLineChart,
	asciiSparkline,
} from "$lib/utils/ascii-charts";

// Phase 7 line 3: Variant A ASCII renderers — deterministic, pure.

describe("asciiBars", () => {
	it("scales the max value to exactly `width` blocks", () => {
		const out = asciiBars([100, 50, 0], { width: 10 });
		// max fills 10 blocks; 50% → 5; zero renders an empty cell
		expect(out).toBe("[██████████ █████ ]");
	});

	it("handles empty data with [no data]", () => {
		expect(asciiBars([])).toBe("[no data]");
		expect(asciiBars([], { label: "spend" })).toBe("spend [no data]");
	});

	it("prefixes the label when given", () => {
		const out = asciiBars([10, 10], { width: 4, label: "net" });
		expect(out).toMatch(/^net \[/);
	});

	it("uses eighths for sub-block precision (deterministic)", () => {
		// 5 of 40 → 1 eighth of one block
		const out = asciiBars([5, 40], { width: 1 });
		expect(out).toBe("[▏ █]");
	});
});

describe("asciiSparkline", () => {
	it("maps a rising series onto the ramp", () => {
		expect(asciiSparkline([0, 1, 2, 3, 4, 5, 6, 7])).toBe("▁▂▃▄▅▆▇█");
	});

	it("flat series renders mid-ramp everywhere", () => {
		expect(asciiSparkline([5, 5, 5])).toBe("▄▄▄");
	});

	it("empty series renders one flat step", () => {
		expect(asciiSparkline([])).toBe("▁");
	});

	it("descending series renders the mirrored ramp", () => {
		expect(asciiSparkline([7, 0])).toBe("█▁");
	});
});

describe("asciiLineChart", () => {
	it("places points in the right rows for a simple rise", () => {
		// 2 rows, values 0→3 (left→right): low value bottom-left, high top-right
		const out = asciiLineChart([0, 3], { rows: 2, label: "net" });
		const [top, bottom] = out.split("\n");
		expect(top).toBe("net  ●");
		expect(bottom).toBe("● ");
	});

	it("says [no data] for empty input", () => {
		expect(asciiLineChart([])).toBe("[no data]");
		expect(asciiLineChart([], { label: "net" })).toBe("net: [no data]");
	});

	it("is deterministic — same input, same output", () => {
		const vals = [5, 3, 8, 1, 9, 4];
		expect(asciiLineChart(vals, { rows: 5 })).toBe(
			asciiLineChart(vals, { rows: 5 }),
		);
	});

	it("flat data marks the top row (max band) across all columns", () => {
		const out = asciiLineChart([4, 4, 4], { rows: 3 });
		expect(out.split("\n")[0]).toBe("●●●");
	});
});
