// Mounts the inlined Ukraine SVG and adds: hex tile layout, glyph/flow/label layers,
// the optional occupation overlays (since 2014, and the latest DeepStateMap snapshot), and region accessibility attributes.
import { s, attrs, clear } from './dom.js';
import { hexPath } from './shapes.js';
import { REGIONS } from '../../map/catalog.js';

export function createMap(frame, ctx) {
  const svg = frame.querySelector('svg');
  const [, , W, H] = ctx.regions.viewBox;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('role', 'group');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const geoG = svg.querySelector('#regions');
  const occ2014G = svg.querySelector('#occupied-2014');
  for (const g of [geoG, occ2014G]) for (const a of ['fill', 'stroke', 'stroke-width', 'display']) g?.removeAttribute(a);
  geoG.setAttribute('class', 'geo');

  const regionAttrs = (el, id) => {
    el.setAttribute('data-region', id);
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
  };
  for (const el of geoG.querySelectorAll('.region')) {
    const id = el.id;
    el.removeAttribute('id');
    regionAttrs(el, id);
  }

  // ---- hex tile layout ----
  const cells = REGIONS.map((r) => ({ id: r.id, x: r.hex[0] + (r.hex[1] % 2 ? 0.5 : 0), y: r.hex[1] }));
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const maxY = Math.max(...cells.map((c) => c.y));
  const R = Math.min((W - 40) / ((maxX - minX + 1) * Math.sqrt(3)), (H - 30) / (maxY * 1.5 + 2));
  const hw = Math.sqrt(3) * R;
  const ox = (W - (maxX - minX + 1) * hw) / 2 + hw / 2;
  const oy = (H - (maxY * 1.5 + 2) * R) / 2 + R;
  const hexCenter = {};
  const hexG = s('g', { class: 'hexes' });
  for (const c of cells) {
    const cx = ox + (c.x - minX) * hw;
    const cy = oy + c.y * 1.5 * R;
    hexCenter[c.id] = [cx, cy];
    const p = s('path', { class: 'region region--hex', d: hexPath(cx, cy, R - 1.5) });
    regionAttrs(p, c.id);
    hexG.appendChild(p);
  }
  geoG.after(hexG);

  // ---- occupation overlays: since 2014 (source map ORDLO areas + Crimea/Sevastopol) and the latest DeepStateMap snapshot ----
  const defs = s('defs');
  for (const [id, angle] of [['ua-hatch', 45], ['ua-hatch-now', -45]]) {
    defs.appendChild(s('pattern', { id, width: 3.2, height: 3.2, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${angle})` }, s('line', { x1: 0, y1: 0, x2: 0, y2: 3.2, class: 'hatch-line' })));
  }
  defs.appendChild(
    s(
      'pattern',
      { id: 'ua-nodata', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 4, height: 4, class: 'nodata-bg' }),
      s('line', { x1: 0, y1: 0, x2: 0, y2: 4, class: 'nodata-line' }),
    ),
  );
  svg.insertBefore(defs, svg.firstChild);
  const occupation = [];
  let occAnchor = hexG;
  if (occ2014G) {
    occ2014G.removeAttribute('id');
    occ2014G.setAttribute('class', 'occupied occ-2014');
    occ2014G.setAttribute('aria-hidden', 'true');
    // Crimea and Sevastopol (occupied since 2014) in full: hatched like the ORDLO areas, and Crimea outlined with the
    // same dashed line (the Sevastopol circle lies inside Crimea, so the peninsula's outline encloses both)
    const clone = (src, cls) => {
      const c = src.cloneNode();
      for (const a of ['data-region', 'tabindex', 'role', 'aria-label', 'aria-pressed', 'style']) c.removeAttribute(a);
      c.setAttribute('class', cls);
      return c;
    };
    const firstLine = occ2014G.querySelector('.line');
    for (const id of ctx.regions.occupied2014?.regions || []) {
      const src = geoG.querySelector(`[data-region="${id}"]`);
      if (!src) continue;
      occ2014G.insertBefore(clone(src, 'area'), occ2014G.firstChild);
      if (src.tagName.toLowerCase() === 'path') occ2014G.insertBefore(clone(src, 'line'), firstLine);
    }
    occAnchor.after(occ2014G);
    occAnchor = occ2014G;
    occupation.push({ id: '2014' });
  }
  const now = ctx.regions.occupation;
  if (now?.area) {
    const g = s('g', { class: 'occupied occ-now', 'aria-hidden': 'true' }, s('path', { class: 'area', d: now.area }), s('path', { class: 'line', d: now.line || '' }));
    occAnchor.after(g);
    occupation.push({ id: 'now', asOf: now.asOf, labelYear: now.labelYear, source: now.source });
  }

  const flowsG = s('g', { class: 'layer-flows' });
  const glyphsG = s('g', { class: 'layer-glyphs' });
  const labelsG = s('g', { class: 'layer-labels', 'aria-hidden': 'true' });
  svg.append(flowsG, glyphsG, labelsG);

  let layout = 'geo';
  const api = {
    svg,
    W,
    H,
    hexR: R,
    /** Occupation overlays available in this build: [{ id: '2014' }, { id: 'now', asOf, labelYear, source }] */
    occupation,
    layers: { flows: flowsG, glyphs: glyphsG, labels: labelsG },
    get layout() {
      return layout;
    },
    setLayout(l) {
      layout = l === 'hex' ? 'hex' : 'geo';
      svg.setAttribute('data-layout', layout);
    },
    anchor(id) {
      return layout === 'hex' ? hexCenter[id] : ctx.regions.regions[id].anchor;
    },
    /** Glyph box size (viewBox units) for the current layout. */
    glyphSize() {
      return layout === 'hex' ? R * 0.86 : ctx.config.options?.glyphSize ?? 58;
    },
    regionEls(id) {
      return svg.querySelectorAll(`.region[data-region="${id}"]`);
    },
    /** Pixels per viewBox unit at the current rendered size. */
    scale() {
      const w = svg.getBoundingClientRect().width;
      return w ? w / W : 1;
    },
    renderLabels({ show, lang, offset = 0, value }) {
      clear(labelsG);
      if (!show) return;
      // keep labels ~11px on screen whatever the rendered map width (hex labels also must fit the tile)
      const px = 10.5 / api.scale();
      labelsG.setAttribute('font-size', (layout === 'hex' ? Math.min(px, R * 0.25) : Math.max(7.5, Math.min(16, px))).toFixed(2));
      for (const r of REGIONS) {
        const name = r.short[lang] || r.short.uk;
        const [x, y] = api.anchor(r.id);
        if (layout === 'hex') {
          const abbr = r.abbr?.[lang] || name;
          const v = value?.(r.id);
          labelsG.appendChild(s('text', { x, y: offset ? y - R * 0.56 : v ? y - R * 0.1 : y + R * 0.08, class: 'map-label map-label--hex', 'data-region': r.id }, abbr));
          if (v) labelsG.appendChild(s('text', { x, y: y + R * 0.38, class: 'map-value', 'data-region': r.id }, v));
        } else {
          const city = r.kind === 'city';
          const geo = ctx.regions.regions[r.id];
          let at;
          if (city) at = offset ? { x, y: y + offset + 7, anchor: 'middle' } : { x: x + geo.r + 3, y: y + 3, anchor: 'start' };
          else if (offset) at = { x, y: geo.glyphLabel === 'above' ? y - offset - 3 : y + offset + 7, anchor: 'middle' };
          else at = { x: geo.label[0], y: geo.label[1], anchor: 'middle' }; // label point from the source map (with fixes from extract-map)
          labelsG.appendChild(s('text', { x: at.x, y: at.y, class: 'map-label' + (city ? ' map-label--city' : ''), 'text-anchor': at.anchor, 'data-region': r.id }, name));
        }
      }
    },
  };
  api.setLayout('geo');
  return api;
}

export { attrs };
