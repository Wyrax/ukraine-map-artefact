// Mini grouped column chart per region (one column per series), shared scale across regions and periods.
// { "type": "bars", "series": ["dev", "test", "prod"], "maxHeight": 40, "heightScale": 2 }
// heightScale (view option "Висота"): ×1 … ×3 of the glyph box; default ×2 on the geographic map, ×1 on hex tiles.
import { attrs } from '../core/dom.js';
import { barUp } from '../core/shapes.js';
import { catLegend } from '../core/legend.js';
import { glyphLayer, child, trim, columnFrame } from './_glyph.js';

export default {
  options: (cfg, { layout }) => [{
      key: 'heightScale',
      type: 'choice',
      label: { uk: 'Висота', en: 'Height' },
      default: cfg.heightScale ?? (layout === 'hex' ? 1 : 2),
      choices: [1, 2, 3].map((v) => ({ value: v, label: '×' + v })),
    }],
  mount(ctx, cfg) {
    const ids = cfg.series;
    const ms = ids.map((id) => ctx.measure(id));
    const L = glyphLayer(ctx, 'bars');
    const [, max] = ctx.domain(ids);

    function draw() {
      L.run(
        (r, p) => ms.map((m) => m.get(r, p) ?? 0),
        (node, vals, [x, y], size) => {
          const { hMax, baseOff } = columnFrame(size, cfg, 0.95);
          const n = vals.length;
          const gap = 1;
          const bw = Math.min(cfg.barWidth ?? 6.5, (size * 0.9 - gap * (n - 1)) / n);
          const total = n * bw + (n - 1) * gap;
          const x0 = x - total / 2;
          const base = y + baseOff;
          attrs(child(node, 0, 'line', 'glyph-base'), { x1: x0 - 2, x2: x0 + total + 2, y1: base, y2: base });
          vals.forEach((v, i) => {
            const path = child(node, i + 1, 'path', 'bar');
            attrs(path, { d: barUp(x0 + i * (bw + gap), base, bw, max > 0 ? (v / max) * hMax : 0, 1.6), style: `fill:${ctx.color(ms[i].slot ?? i + 1)}` });
          });
          trim(node, n + 1);
        },
      );
    }
    draw();
    ctx.legend.add(catLegend({ title: ctx.pick(cfg.legendTitle), items: ids.map((id, i) => ({ label: ctx.label(id), color: ctx.color(ms[i].slot ?? i + 1) })) }));
    // names go under the base, or above the region's tallest column for "above" regions
    const labelOffset = (r) => {
      const size = ctx.map.glyphSize();
      const { hMax, baseOff } = columnFrame(size, cfg, 0.95);
      const top = max > 0 ? Math.max(...ms.map((m) => m.get(r, ctx.period()) ?? 0)) / max * hMax : 0;
      return { below: baseOff, above: Math.max(top - baseOff, size * 0.15) };
    };
    return {
      measures: ids,
      glyph: true,
      labelOffset,
      update(ch) {
        if (ch.has('period')) draw();
      },
      destroy: () => L.destroy(),
    };
  },
};
