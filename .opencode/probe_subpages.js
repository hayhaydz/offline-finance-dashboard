// Route-rotation probe: boxed-panel compliance metrics at current window.
// Loaded via chrome-devtools evaluate_script sourcePath (v3.1 third mandate,
// queue item 2 — reports/tools sub-page rotation).
(() => {
  const main = document.querySelector('main') || document.body;
  const els = [...main.querySelectorAll('*')];
  // full-bleed border-b band: has border-b/-t class but NOT a full box
  let banded = [];
  for (const e of els) {
    const cls = typeof e.className === 'string' ? e.className : '';
    if (!cls.includes('border')) continue;
    const hasFullBox = /(^|\s)border(\s|$)/.test(cls) || /(^|\s)border-2(\s|$)/.test(cls) || cls.includes('border-black');
    const hasBand = /(^|\s)border-b(\s|$)|border-b-/.test(cls) || /(^|\s)border-t(\s|$)/.test(cls);
    if (hasBand && !hasFullBox) {
      const r = e.getBoundingClientRect();
      if (r.width > main.scrollWidth * 0.55) banded.push({ cls: cls.slice(0, 60), h: Math.round(r.height) });
    }
  }
  const caps = [...main.querySelectorAll('[class*="max-w-"]')].map(e => {
    const m = (typeof e.className === 'string' ? e.className : '').match(/max-w-[\w]+/);
    return m ? m[0] : '';
  }).filter(Boolean).reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
  const boxed = els.filter(e => {
    const cls = typeof e.className === 'string' ? e.className : '';
    return cls.includes('border-black') || /(^|\s)border(\s|$)/.test(cls);
  }).length;
  const bands = [...main.children].slice(0, 40);
  let maxGap = 0, gapAt = '';
  for (let i = 1; i < bands.length; i++) {
    const a = bands[i - 1].getBoundingClientRect(), b = bands[i].getBoundingClientRect();
    if (b.top > a.bottom) { const g = b.top - a.bottom; if (g > maxGap) { maxGap = g; gapAt = (b.textContent || '').trim().slice(0, 24); } }
  }
  return {
    path: location.pathname,
    scrollH: Math.round(main.scrollHeight),
    viewports: +(main.scrollHeight / window.innerHeight).toFixed(1),
    boxedEls: boxed,
    borderBands: banded.slice(0, 4),
    caps,
    hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    maxSiblingGap: Math.round(maxGap),
    gapBefore: gapAt
  };
})()
