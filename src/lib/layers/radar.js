// Mini radar (spider) glyph per region.
// normalize "max" (default): each axis = series / its max over regions and periods; "share": the region's own mix.
// { "type": "radar", "series": ["a", "b", "c", "d"], "normalize": "share" }
import { attrs } from '../core/dom.js';
import { polar, polyPath } from '../core/shapes.js';
import { catLegend } from '../core/legend.js';
import { radarBasis } from '../panels/radar.js';
import { glyphLayer, child } from './_glyph.js';

export default {
  mount(ctx, cfg) {
    const ids = cfg.series;
    const ms = ids.map((id) => ctx.measure(id));
    const L = glyphLayer(ctx, 'radar');
    const { raw, maxes } = radarBasis(ctx, ms, cfg.normalize);
    const n = ids.length;
    const color = ctx.color(cfg.slot ?? 1);

    function draw() {
      L.run(
        (r, p) => (raw(r, p) || ms.map(() => 0)).map((x, i) => x / maxes[i]),
        (node, fr, [x, y], size, r) => {
          const R = cfg.radius ?? size * 0.46;
          const has = ctx.data.has(r, ctx.period());
          const ring = Array.from({ length: n }, (_, i) => polar(x, y, R, (i / n) * Math.PI * 2));
          attrs(child(node, 0, 'path', 'radar-grid'), { d: has ? polyPath(ring) + ring.map(([px, py]) => `M${x} ${y}L${px.toFixed(2)} ${py.toFixed(2)}`).join('') : '' });
          const shape = child(node, 1, 'path', 'radar-shape');
          attrs(shape, { d: has ? polyPath(fr.map((f, i) => polar(x, y, Math.max(0.5, f * R), (i / n) * Math.PI * 2))) : '' });
          shape.style.setProperty('--sw', color);
        },
      );
    }
    draw();
    ctx.legend.add(
      catLegend({
        title: ctx.pick(cfg.legendTitle) || ids.map((id, i) => `${i + 1}. ${ctx.label(id)}`).join(' · '),
        items: [
          {
            label:
              cfg.normalize === 'share'
                ? ctx.lang() === 'en' ? 'axes clockwise from top; each shows the share in the region total' : 'осі за годинниковою стрілкою від верху; кожна — частка в сумі регіону'
                : ctx.lang() === 'en' ? 'axes clockwise from top, scaled to each series maximum' : 'осі за годинниковою стрілкою від верху, кожна до свого максимуму',
            color,
            shape: 'square',
          },
        ],
      }),
    );
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
