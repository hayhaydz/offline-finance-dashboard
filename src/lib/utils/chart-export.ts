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

/** Serialise an SVG element to a standalone XML string with xmlns. */
export function serialiseSvg(svg: SVGSVGElement): string {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	clone.setAttribute("width", String(svg.clientWidth || 600));
	clone.setAttribute("height", String(svg.clientHeight || 200));
	return new XMLSerializer().serializeToString(clone);
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
		"data:image/svg+xml;charset=utf-8," + encodeURIComponent(serialiseSvg(svg)),
		`${chartFileName(title)}.svg`,
	);
	return true;
}

/** Rasterise the panel's SVG to PNG (2× for crispness) and download it. */
export async function exportChartPng(
	panel: HTMLElement,
	title: string,
): Promise<boolean> {
	const svg = panel.querySelector("svg");
	if (!svg) return false;

	const xml = serialiseSvg(svg);
	const scale = 2;
	const w = svg.clientWidth || 600;
	const h = svg.clientHeight || 200;

	const img = new Image();
	img.crossOrigin = "anonymous";
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error("svg rasterise failed"));
		img.src = svgToDataUrl(xml);
	});

	const canvas = document.createElement("canvas");
	canvas.width = w * scale;
	canvas.height = h * scale;
	const ctx = canvas.getContext("2d");
	if (!ctx) return false;
	ctx.fillStyle = "#fff"; // keep the terminal white background in exports
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

	const url = canvas.toDataURL("image/png");
	download(url, `${chartFileName(title)}.png`);
	return true;
}
