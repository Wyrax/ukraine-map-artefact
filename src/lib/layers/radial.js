// Radial glyphs.
// Progress ring: { "type": "radial", "value": "share", "max": 1 }  — arc = value / max (max: number | measure id | "domain")
// Radial bars:   { "type": "radial", "series": ["a", "b", "c"] }   — one concentric arc per series, 270° = series max
import { attrs } from '../core/dom.js';
import { arcStroke } from '../core/shapes.js';
import { catLegend } from '../core/legend.js';
import { glyphLayer, child, trim } from './_glyph.js';

export default {
  mount(ctx, cfg) {
    const ring = !!cfg.value;
    const ids = ring ? [cfg.value] : cfg.series;
    const ms = ids.map((id) => ctx.measure(id));
    const L = glyphLayer(ctx, 'radial');
    const sweep = ring ? Math.PI * 2 : (Math.PI * 3) / 2;
    const maxes = ids.map((id) => {
      if (ring) {
        if (typeof cfg.max === 'number') return cfg.max;
        if (typeof cfg.max === 'string' && cfg.max !== 'domain') return null; // per-region target measure
        return ctx.measure(id).format === 'pct' && cfg.max !== 'domain' ? 1 : ctx.domain([id])[1];
      }
      return ctx.domain([id])[1];
    });
    const target = ring && typeof cfg.max === 'string' && cfg.max !== 'domain' ? ctx.measure(cfg.max) : null;

    function draw() {
      L.run(
        (r, p) => ms.map((m, i) => {
          const v = m.get(r, p) ?? 0;
          const mx = target ? target.get(r, p) : maxes[i];
          return mx > 0 ? Math.min(1, v / mx) : 0;
        }),
        (node, fr, [x, y], size, r) => {
          const has = ctx.data.has(r, ctx.period());
          const R = cfg.radius ?? size * 0.42;
          if (ring) {
            const w = Math.max(3, R * 0.3);
            attrs(child(node, 0, 'circle', 'ring-face'), { cx: x, cy: y, r: R + w / 2 + 0.6 });
            attrs(child(node, 1, 'path', 'ring-track'), { d: has ? arcStroke(x, y, R, 0, Math.PI * 2) : '', 'stroke-width': w });
            const arc = child(node, 2, 'path', 'ring-arc');
            attrs(arc, { d: arcStroke(x, y, R, 0, fr[0] * sweep), 'stroke-width': w });
            arc.style.stroke = ctx.color(cfg.slot ?? ms[0].slot ?? 1);
            const label = child(node, 3, 'text', 'ring-label');
            const show = ctx.map.layout === 'hex' && has;
            attrs(label, { x, y: y + 3.5 });
            label.textContent = show ? ctx.fmt(ms[0].get(r, ctx.period()), ids[0]) : '';
            trim(node, 4);
          } else {
            const n = fr.length;
            const w = Math.max(2.2, (R * 0.8) / n - 0.8);
            fr.forEach((f, i) => {
              const rr = R - i * (w + 0.9);
              attrs(child(node, i * 2, 'path', 'ring-track'), { d: has ? arcStroke(x, y, rr, 0, sweep) : '', 'stroke-width': w });
              const arc = child(node, i * 2 + 1, 'path', 'ring-arc');
              attrs(arc, { d: arcStroke(x, y, rr, 0, f * sweep), 'stroke-width': w });
              arc.style.stroke = ctx.color(ms[i].slot ?? i + 1);
            });
            trim(node, n * 2);
          }
        },
      );
    }
    draw();
    if (!ring || ms[0].slot) {
      ctx.legend.add(catLegend({ title: ctx.pick(cfg.legendTitle) || (ring ? ctx.label(ids[0]) : ''), items: ids.map((id, i) => ({ label: ctx.label(id), color: ctx.color(ms[i].slot ?? i + 1), shape: 'line' })) }));
    } else {
      ctx.legend.add(catLegend({ title: ctx.pick(cfg.legendTitle) || ctx.label(ids[0]), items: [{ label: `${ctx.fmt(0, ids[0])} → ${ctx.fmt(maxes[0] ?? 1, ids[0])}`, color: ctx.color(cfg.slot ?? 1), shape: 'line' }] }));
    }
    return {
      measures: target ? [...ids, cfg.max] : ids,
      glyph: true,
      update(ch) {
        if (ch.has('period')) draw();
      },
      destroy: () => L.destroy(),
    };
  },
};
