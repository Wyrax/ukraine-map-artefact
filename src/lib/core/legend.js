// Legend builders. Text always uses ink tokens; identity is carried by the swatch beside it.
import { h, s } from './dom.js';

/** Classed sequential legend: swatches with threshold labels between them, plus "no data". */
export function seqLegend({ title, colors, breaks, fmt, noDataLabel, min, max }) {
  const k = colors.length;
  const marks = [min, ...breaks, max];
  const bar = h('div', { class: 'lg-seq__bar' }, colors.map((c) => h('span', { style: `background:${c}` })));
  const labs = h(
    'div',
    { class: 'lg-seq__labs' },
    marks.map((v, i) => h('span', { class: i === 0 ? 'is-first' : i === k ? 'is-last' : '', style: `left:calc(${(i / k) * 100}% ${i === 0 ? '' : '- 1px'})` }, fmt(v))),
  );
  return h(
    'div',
    { class: 'lg' },
    title ? h('div', { class: 'lg__title' }, title) : null,
    h('div', { class: 'lg-seq', role: 'img', 'aria-label': `${title || ''} ${marks.map(fmt).join(' – ')}` }, bar, labs),
    noDataLabel ? h('div', { class: 'lg-item' }, h('span', { class: 'lg-sw lg-sw--nodata' }), noDataLabel) : null,
  );
}

/** Categorical legend: [{label, color, shape: 'square'|'line'|'dot'}]. */
export function catLegend({ title, items }) {
  return h(
    'div',
    { class: 'lg' },
    title ? h('div', { class: 'lg__title' }, title) : null,
    h('div', { class: 'lg-cat' }, items.map((it) => h('span', { class: 'lg-item' }, h('span', { class: `lg-sw lg-sw--${it.shape || 'square'}`, style: `--sw:${it.color}` }), it.label))),
  );
}

/** Proportional-size legend: nested circles for 2–3 reference values. radius(v) in viewBox units, k = px per unit. */
export function sizeLegend({ title, values, radius, fmt, k, color = 'var(--c1)' }) {
  const rs = values.map((v) => radius(v) * k);
  const rMax = Math.max(...rs, 4);
  const w = rMax * 2 + 70;
  const hgt = rMax * 2 + 4;
  const svg = s('svg', { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: 'lg-size', 'aria-hidden': 'true' });
  // labels at the circles' tops, kept at least one label height apart when the circles are small (narrow maps)
  const GAP = 13;
  let prevY = -Infinity;
  values.forEach((v, i) => {
    const r = rs[i];
    if (r <= 0) return;
    const cy = hgt - 2 - r;
    const top = cy - r;
    const ly = Math.max(top, prevY + GAP);
    prevY = ly;
    svg.appendChild(s('circle', { cx: rMax, cy, r, fill: 'none', stroke: color, 'stroke-width': 1.25 }));
    svg.appendChild(s('polyline', { points: `${rMax},${top} ${rMax * 2 + 4},${top} ${rMax * 2 + 8},${ly}`, fill: 'none', class: 'lg-size__tick' }));
    svg.appendChild(s('text', { x: rMax * 2 + 11, y: ly + 3.5, class: 'lg-size__lab' }, fmt(v)));
  });
  // a label pushed below the smallest circle's top may need more room
  if (prevY + 6 > hgt) {
    svg.setAttribute('height', prevY + 6);
    svg.setAttribute('viewBox', `0 0 ${w} ${prevY + 6}`);
  }
  return h('div', { class: 'lg' }, title ? h('div', { class: 'lg__title' }, title) : null, svg);
}
