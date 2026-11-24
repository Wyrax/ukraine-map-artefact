// Pie or donut per region showing shares of series.
// { "type": "pies", "series": ["pledged", "no_pledge"], "donut": true, "size": "fixed" | "value" }
// size "value": radius ∝ √total (comparable across regions and periods).
import { attrs } from '../core/dom.js';
import { arcPath } from '../core/shapes.js';
import { sqrtRadius } from '../core/scales.js';
import { catLegend } from '../core/legend.js';
import { glyphLayer, child, trim } from './_glyph.js';

export default {
  mount(ctx, cfg) {
    const ids = cfg.series;
    const ms = ids.map((id) => ctx.measure(id));
    const L = glyphLayer(ctx, 'pies');
    const byValue = cfg.size === 'value';
    let maxTotal = 0;
    if (byValue)
      for (const r of ctx.data.regionIds)
        for (let p = 0; p < ctx.data.periods.length; p++) maxTotal = Math.max(maxTotal, ms.reduce((a, m) => a + (m.get(r, p) ?? 0), 0));

    function draw() {
      L.run(
        (r, p) => ms.map((m) => m.get(r, p) ?? 0),
        (node, vals, [x, y], size) => {
          const tot = vals.reduce((a, b) => a + b, 0);
          const rMax = cfg.radius ?? size * 0.46;
          const R = byValue ? sqrtRadius(maxTotal, rMax)(tot) : tot > 0 ? rMax : 0;
          const r0 = cfg.donut ? R * 0.56 : 0;
          attrs(child(node, 0, 'circle', 'pie-bg'), { cx: x, cy: y, r: R > 0 ? R + 0.8 : 0 });
          let a = 0;
          vals.forEach((v, i) => {
            const span = tot > 0 ? (v / tot) * Math.PI * 2 : 0;
            const el = child(node, i + 1, 'path', 'slice');
            attrs(el, { d: arcPath(x, y, r0, R, a, a + span) });
            el.style.fill = ctx.color(ms[i].slot ?? i + 1);
            a += span;
          });
          trim(node, vals.length + 1);
        },
      );
      if (byValue) {
        const p = ctx.period();
        L.order((r) => ms.reduce((acc, m) => acc + (m.get(r, p) ?? 0), 0));
      }
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
