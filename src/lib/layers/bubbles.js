// Proportional circles (area ∝ value) at region anchors.
// { "type": "bubbles", "value": "<series|measure>", "slot": 1, "maxRadius": 26 }
import { attrs } from '../core/dom.js';
import { sqrtRadius, niceTicks } from '../core/scales.js';
import { formatTick } from '../core/format.js';
import { sizeLegend } from '../core/legend.js';
import { glyphLayer, child } from './_glyph.js';

/** The largest "nice" number (1, 2, 2.5 or 5 × 10ⁿ) not above v. */
function niceAtMost(v) {
  if (!(v > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  return [5, 2.5, 2, 1].map((m) => m * p).find((x) => x <= v + 1e-9);
}

export default {
  options: (cfg) => [{ key: 'values', type: 'toggle', label: { uk: 'Цифри', en: 'Values' }, default: cfg.values ?? false }],
  mount(ctx, cfg) {
    const id = cfg.value;
    const m = ctx.measure(id);
    const L = glyphLayer(ctx, 'bubbles');
    const color = ctx.color(cfg.slot ?? m.slot ?? 1);
    const [, max] = ctx.domain([id]);
    const rMax = () => cfg.maxRadius ?? ctx.map.glyphSize() * 0.6;
    let legendNode = null;

    function draw() {
      const radius = sqrtRadius(max, rMax());
      L.run(
        (r, p) => m.get(r, p) ?? 0,
        (node, v, [x, y]) => {
          const c = child(node, 0, 'circle', 'bubble');
          attrs(c, { cx: x, cy: y, r: Math.max(0, radius(v)), style: `fill:${color}` });
        },
      );
      const p = ctx.period();
      L.order((r) => m.get(r, p) ?? 0);
    }
    function legend() {
      if (legendNode) legendNode.remove();
      const t = niceTicks(0, max, 3).filter((v) => v > 0 && v <= max);
      const top = t[t.length - 1];
      // three sizes: the largest nice tick, one below it and a small one (~a fifth: 5 000 → 2 500 → 1 000)
      const vals = [top, t[Math.floor(t.length / 3)], niceAtMost(top / 5)].filter((v, i, a) => v && a.indexOf(v) === i && (i === 0 || v < a[i - 1]));
      legendNode = sizeLegend({ title: ctx.label(id), values: vals, radius: sqrtRadius(max, rMax()), fmt: (v) => formatTick(v, m.format, ctx.lang()), k: ctx.map.scale(), color });
      ctx.legend.add(legendNode);
    }
    draw();
    legend();
    return {
      measures: [id],
      labelValue: cfg.values ? id : null,
      glyph: true,
      update(ch) {
        if (ch.has('period')) draw();
      },
      resize: legend,
      destroy: () => L.destroy(),
    };
  },
};
