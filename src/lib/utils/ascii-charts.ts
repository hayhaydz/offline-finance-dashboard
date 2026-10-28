/**
 * ASCII chart rendering (Phase 7 line 3, Variant A): pure text-mode
 * renderers so every chart carries a "pure terminal" representation.
 * Deterministic — same numbers, same glyphs, every render (SSR-safe,
 * no DOM, no randomness).
 */

/** Block characters from empty to full (eighths, left-anchored). */
const BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

/** Render values as a one-line horizontal block bar chart.
 *  £ [▍ ██ █ ] style: `label [bars]` — bars are scaled to `width`. */
export function asciiBars(
	values: number[],
	options: { width?: number; label?: string } = {},
): string {
	const { width = 40, label = "" } = options;
	if (values.length === 0) return label ? `${label} [no data]` : "[no data]";

	const max = Math.max(...values.map((v) => Math.abs(v)), 0);
	const scale = max > 0 ? (width * 8) / max : 0;
	const bars = values
		.map((v) => {
			const eighths = Math.round(Math.abs(v) * scale);
			const full = Math.floor(eighths / 8);
			const rem = eighths % 8;
			// partial eighth only when non-zero (no trailing padding space)
			return BLOCKS[8].repeat(full) + (rem > 0 ? BLOCKS[rem] : "");
		})
		.join(" ");

	return `${label ? label + " " : ""}[${bars}]`;
}

/** Render a series as a single-line trend spark: ▁▂▃▄▅▆▇█ steps.
 *  Falls back to a flat line for empty/flat data. */
const RAMP = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export function asciiSparkline(values: number[]): string {
	if (values.length === 0) return "▁";
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min;
	return values
		.map((v) => {
			if (span === 0) return RAMP[3];
			const step = Math.round(((v - min) / span) * (RAMP.length - 1));
			return RAMP[Math.max(0, Math.min(RAMP.length - 1, step))];
		})
		.join("");
}

/** Multi-line ASCII line chart with a y-axis label, for the ASCII render
 *  mode toggle: rows top→bottom, x one column per point. Heights are
 *  quantised to `rows` buckets — deterministic, terminal-friendly. */
export function asciiLineChart(
	values: number[],
	options: { rows?: number; label?: string } = {},
): string {
	const { rows = 6, label = "" } = options;
	if (values.length === 0) return label ? `${label}: [no data]` : "[no data]";

	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;

	const lines: string[] = [];
	for (let r = rows - 1; r >= 0; r--) {
		// threshold this row represents (top row = max band)
		const lo = min + (r / rows) * span;
		const hi = min + ((r + 1) / rows) * span;
		const flat = max === min;
		const marks = values.map((v) => {
			if (flat) return r === rows - 1 ? "●" : " ";
			if (r === rows - 1) return v >= lo - span * 0.001 ? "●" : " ";
			return v >= lo && v < hi ? "●" : " ";
		});
		const rowLabel = r === rows - 1 && label ? `${label} ` : "";
		lines.push(`${rowLabel}${marks.join("")}`);
	}
	return lines.join("\n");
}
