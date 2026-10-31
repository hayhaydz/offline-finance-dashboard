/**
 * Per-chart export (Phase 5 line 3): serialise the first <svg> inside a
 * chart panel to a standalone .svg file, or rasterise it to PNG via
 * canvas. Pure helpers are separated for testability; the download glue
 * is browser-only (guarded — no-op on server).
 */

/** Kebab-case file-stem from a panel title ("Spend burn-down" → "spend-burn-down"). */
export function chartFileName(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "chart"
	);
}

/** Serialise an SVG element to a standalone XML string with xmlns.
 *
 * v3.1 A09: when title+summary are supplied the export becomes
 * SELF-CONTAINED — a header band (title) and footer band (the panel's
 * plain-text summary) are composed around the chart so the downloaded
 * file carries its own numbers (hover data is otherwise lost).
 */
export function serialiseSvg(
	svg: SVGSVGElement,
	meta?: { title?: string; summary?: string },
): string {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	const w = svg.clientWidth || 600;
	const h = svg.clientHeight || 200;
	clone.setAttribute("width", String(w));
	clone.setAttribute("height", String(h));

	if (!meta?.title && !meta?.summary) {
		return new XMLSerializer().serializeToString(clone);
	}

	const headerH = meta?.title ? 22 : 0;
	const footerH = meta?.summary ? 26 : 0;
	const outW = w;
	const outH = h + headerH + footerH;

	const NS = "http://www.w3.org/2000/svg";
	const wrap = document.createElementNS(NS, "svg");
	wrap.setAttribute("xmlns", NS);
	wrap.setAttribute("width", String(outW));
	wrap.setAttribute("height", String(outH));

	if (meta?.title) {
		const t = document.createElementNS(NS, "text");
		t.setAttribute("x", "4");
		t.setAttribute("y", "14");
		t.setAttribute("font-family", "monospace");
		t.setAttribute("font-size", "12");
		t.setAttribute("font-weight", "bold");
		t.setAttribute("fill", "#111827");
		t.textContent = meta.title;
		wrap.appendChild(t);
	}

	const g = document.createElementNS(NS, "g");
	g.setAttribute("transform", `translate(0, ${headerH})`);
	while (clone.firstChild) g.appendChild(clone.firstChild);
	wrap.appendChild(g);

	if (meta?.summary) {
		const s = document.createElementNS(NS, "text");
		s.setAttribute("x", "4");
		s.setAttribute("y", String(outH - 8));
		s.setAttribute("font-family", "monospace");
		s.setAttribute("font-size", "10");
		s.setAttribute("fill", "#4b5563");
		s.textContent = meta.summary.length > 180 ? `${meta.summary.slice(0, 177)}…` : meta.summary;
		wrap.appendChild(s);
	}

	return new XMLSerializer().serializeToString(wrap);
}

/** SVG XML string → data URL (base64 keeps unicode safe in downloads). */
export function svgToDataUrl(xml: string): string {
	return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
}

function download(href: string, filename: string) {
	const a = document.createElement("a");
	a.href = href;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
}

/** Download the panel's SVG. Returns false when no SVG is present. */
export function exportChartSvg(panel: HTMLElement, title: string): boolean {
	const svg = panel.querySelector("svg");
	if (!svg) return false;
	download(
		"data:image/svg+xml;charset=utf-8," +
			encodeURIComponent(serialiseSvg(svg, panelMeta(panel, title))),
		`${chartFileName(title)}.svg`,
	);
	return true;
}

/** Title + summary pulled from the panel so exports are self-contained. */
function panelMeta(panel: HTMLElement, title: string): { title: string; summary?: string } {
	const summary = panel.querySelector(".chart-panel-summary")?.textContent?.trim();
	return { title, summary: summary || undefined };
}

/** Rasterise the panel's SVG to PNG (2× for crispness) and download it. */
export async function exportChartPng(
	panel: HTMLElement,
	title: string,
): Promise<boolean> {
	const svg = panel.querySelector("svg");
	if (!svg) return false;

	const xml = serialiseSvg(svg, panelMeta(panel, title));
	const scale = 2;
	const w = svg.clientWidth || 600;
	const h = svg.clientHeight || 200;
	const metaPad = 22 + 26; // header + footer bands added by serialiseSvg

	const img = new Image();
	img.crossOrigin = "anonymous";
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error("svg rasterise failed"));
		img.src = svgToDataUrl(xml);
	});

	const canvas = document.createElement("canvas");
	canvas.width = w * scale;
	canvas.height = (h + metaPad) * scale;
	const ctx = canvas.getContext("2d");
	if (!ctx) return false;
	ctx.fillStyle = "#fff"; // keep the terminal white background in exports
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

	const url = canvas.toDataURL("image/png");
	download(url, `${chartFileName(title)}.png`);
	return true;
}
