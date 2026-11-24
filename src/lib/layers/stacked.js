// One stacked column per region. mode "abs": height ∝ total (shared scale); "pct": every column is 100%.
// { "type": "stacked", "series": ["a", "b", "c"], "mode": "abs" | "pct" }
import { attrs } from '../core/dom.js';
import { barUp } from '../core/shapes.js';
import { catLegend } from '../core/legend.js';
import { glyphLayer, child, trim } from './_glyph.js';

export default {
  mount(ctx, cfg) {
    const ids = cfg.series;
    const ms = ids.map((id) => ctx.measure(id));
    const pct = cfg.mode === 'pct';
    const L = glyphLayer(ctx, 'stacked');
    let maxTotal = 0;
    for (const r of ctx.data.regionIds)
      for (let p = 0; p < ctx.data.periods.length; p++) maxTotal = Math.max(maxTotal, ms.reduce((a, m) => a + (m.get(r, p) ?? 0), 0));

    function draw() {
      L.run(
        (r, p) => ms.map((m) => m.get(r, p) ?? 0),
        (node, vals, [x, y], size) => {
          const hMax = cfg.maxHeight ?? size * 1.0;
          const w = cfg.width ?? Math.max(8, size * 0.2);
          const tot = vals.reduce((a, b) => a + b, 0);
          const hTot = pct ? (tot > 0 ? hMax : 0) : maxTotal > 0 ? (tot / maxTotal) * hMax : 0;
          const base = y + hMax / 2;
          const gap = 0.8;
          let acc = 0;
          const lastIdx = vals.reduce((li, v, i) => (v > 0 ? i : li), -1);
          vals.forEach((v, i) => {
            const hSeg = tot > 0 ? (v / tot) * hTot : 0;
            const y0 = base - acc;
            const el = child(node, i, 'path', 'bar');
            const hDraw = Math.max(0, hSeg - (i < lastIdx ? gap : 0));
            if (i === lastIdx) attrs(el, { d: barUp(x - w / 2, y0, w, hDraw, 1.6) });
            else attrs(el, { d: hDraw > 0.01 ? `M${x - w / 2} ${y0}h${w}v${-hDraw}h${-w}Z` : '' });
            el.style.fill = ctx.color(ms[i].slot ?? i + 1);
            acc += hSeg;
          });
          trim(node, vals.length);
        },
      );
    }
    draw();
    ctx.legend.add(catLegend({ title: ctx.pick(cfg.legendTitle), items: ids.map((id, i) => ({ label: ctx.label(id), color: ctx.color(ms[i].slot ?? i + 1) })) }));
    return {
      measures: ids,
      glyph: true,
      update(ch) {
        if (ch.has('period')) draw();
      },
      destroy: () => L.destroy(),
    };
  },
};
