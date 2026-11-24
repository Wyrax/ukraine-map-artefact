// Radar (spider) chart comparing selected regions with the average region across several series.
// Up to 8 selected regions get series colours; with more, every selected profile is a thin ink outline that is
// emphasised (and named in a tooltip) on hover, here or anywhere else on the page.
// normalize "max" (default): each axis scaled to that series' maximum over regions and periods.
// normalize "share": each region's own mix (series / region total); axes scaled to the largest share seen.
// { "type": "radar", "series": ["a", "b", "c", "d", "e"], "normalize": "share" }
import { s, h, clear } from '../core/dom.js';
import { polar, polyPath } from '../core/shapes.js';
import { tween } from '../core/anim.js';

/** Raw per-region vector (values or shares) and per-axis maxima over all regions and periods. */
export function radarBasis(ctx, ms, normalize) {
  const share = normalize === 'share';
  const raw = (r, p) => {
    if (!ctx.data.has(r, p)) return null;
    const v = ms.map((m) => m.get(r, p) ?? 0);
    if (!share) return v;
    const t = v.reduce((a, b) => a + b, 0);
    return v.map((x) => (t ? x / t : 0));
  };
  const maxes = ms.map(() => 0);
  for (const r of ctx.data.regionIds)
    for (let p = 0; p < ctx.data.periods.length; p++) {
      const v = raw(r, p);
      if (v) v.forEach((x, i) => (maxes[i] = Math.max(maxes[i], x)));
    }
  return { raw, maxes: maxes.map((m) => m || 1) };
}

const MAX_COLOURED = 8;

export default {
  title: (ctx) => (ctx.lang() === 'en' ? 'Region profile' : 'Профіль регіонів'),
  mount(body, ctx, cfg) {
    const ids = cfg.series;
    const ms = ids.map((id) => ctx.measure(id));
    const { raw, maxes } = radarBasis(ctx, ms, cfg.normalize);
    const n = ids.length;
    const slots = new Map();
    const host = h('div', { class: 'rd' });
    const keyEl = h('div', { class: 'tc-key' });
    body.append(keyEl, host);
    const owner = {};

    function series() {
      const p = ctx.period();
      const sel = ctx.state.get().selected;
      for (const id of [...slots.keys()]) if (!sel.includes(id)) slots.delete(id);
      for (const id of sel) if (!slots.has(id)) {
        const used = new Set(slots.values());
        let k = 1;
        while (used.has(k)) k++;
        slots.set(id, k);
      }
      const vecs = ctx.data.regionIds.map((r) => raw(r, p)).filter(Boolean);
      const avg = ms.map((_, i) => (vecs.length ? vecs.reduce((a, v) => a + v[i], 0) / vecs.length / maxes[i] : 0));
      const out = [{ key: 'avg', label: ctx.t('average'), color: 'var(--ink-2)', fr: avg, avg: true }];
      const many = sel.length > MAX_COLOURED;
      for (const id of sel) {
        const v = raw(id, p) || ms.map(() => 0);
        out.push({ key: id, region: id, label: ctx.regionName(id), color: many ? 'var(--ink)' : ctx.color(slots.get(id)), many, fr: v.map((x, i) => x / maxes[i]) });
      }
      return out;
    }

    function draw(frs) {
      clear(host);
      clear(keyEl);
      const W = Math.min(340, Math.max(220, host.clientWidth || body.clientWidth || 300));
      const Hh = W * 0.86;
      const cx = W / 2;
      const cy = Hh / 2 + 4;
      const R = Math.min(W, Hh) / 2 - 34;
      const svg = s('svg', { class: 'rd-svg', viewBox: `0 0 ${W} ${Hh + 8}`, width: W, height: Hh + 8, role: 'img', 'aria-label': ids.map((id) => ctx.label(id)).join(', ') });
      for (const lv of [0.25, 0.5, 0.75, 1]) svg.appendChild(s('path', { class: 'rd-grid', d: polyPath(Array.from({ length: n }, (_, i) => polar(cx, cy, R * lv, (i / n) * Math.PI * 2))) }));
      ids.forEach((id, i) => {
        const [x, y] = polar(cx, cy, R, (i / n) * Math.PI * 2);
        svg.appendChild(s('line', { class: 'rd-axis', x1: cx, y1: cy, x2: x, y2: y }));
        const [lx, ly] = polar(cx, cy, R + 12, (i / n) * Math.PI * 2);
        svg.appendChild(s('text', { class: 'rd-label', x: lx, y: ly + 4, 'text-anchor': Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end' }, ctx.label(id)));
      });
      const list = series();
      const many = list.filter((sr) => sr.many).length;
      list.forEach((sr) => {
        const fr = frs[sr.key] || sr.fr;
        const p = s('path', { class: 'rd-shape' + (sr.avg ? ' rd-shape--avg' : '') + (sr.many ? ' rd-shape--many' : ''), d: polyPath(fr.map((f, i) => polar(cx, cy, Math.max(0, Math.min(1.05, f)) * R, (i / n) * Math.PI * 2))) });
        p.style.setProperty('--sw', sr.color);
        if (sr.region) {
          p.setAttribute('data-region', sr.region);
          p.setAttribute('data-tip', ''); // hovering a profile shows the region's tooltip
        }
        svg.appendChild(p);
        if (!sr.many) keyEl.appendChild(h('span', { class: 'lg-item' }, h('span', { class: 'lg-sw lg-sw--line', style: `--sw:${sr.color}` }), sr.label));
      });
      if (many) {
        // keep the average readable above the bundle of outlines
        const avgPath = svg.querySelector('.rd-shape--avg');
        avgPath?.classList.add('rd-shape--ref');
        if (avgPath) svg.appendChild(avgPath);
        keyEl.appendChild(h('span', { class: 'lg-item' }, h('span', { class: 'lg-sw lg-sw--line lg-sw--sel' }), `${ctx.t('cmpSelectedN')} (${many})`));
        keyEl.appendChild(h('span', { class: 'tc-hint' }, ctx.t('radarManyHint')));
      }
      if (list.length === 1) keyEl.appendChild(h('span', { class: 'tc-hint' }, ctx.t('selectHint')));
      host.appendChild(svg);
      curSvg = svg;
      raise(ctx.state.get().hover);
    }

    let curSvg = null;
    // keep the hovered profile on top of the others
    function raise(id) {
      const p = id && curSvg?.querySelector(`.rd-shape[data-region="${id}"]`);
      if (p) p.parentNode.appendChild(p);
    }
    const unsub = ctx.state.on((st, ch) => {
      if (ch.has('hover')) raise(st.hover);
    });

    const run = () => tween(owner, Object.fromEntries(series().map((x) => [x.key, x.fr])), draw);
    run();
    return {
      update(ch) {
        if (ch.has('period') || ch.has('selected')) run();
      },
      resize: () => draw(owner._cur || {}),
      destroy: unsub,
    };
  },
};
