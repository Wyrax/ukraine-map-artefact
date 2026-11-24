// Choropleth: fills each region by a classed sequential scale.
// { "type": "choropleth", "value": "<series|measure>", "classes": 5, "breaks": "quantile"|"equal"|[thresholds] }
import { classBreaks, classify, rampSteps } from '../core/scales.js';
import { formatTick } from '../core/format.js';
import { seqLegend } from '../core/legend.js';

export default {
  mount(ctx, cfg) {
    const id = cfg.value;
    const m = ctx.measure(id);
    const k = cfg.classes ?? 5;
    let breaks = [];
    let steps = [];
    let legendNode = null;

    function compute() {
      breaks = classBreaks(ctx.values(id), k, cfg.breaks ?? (m.format === 'pct' ? 'equal' : 'quantile'));
      steps = rampSteps(breaks.length + 1);
    }
    function paint() {
      const p = ctx.period();
      for (const r of ctx.data.regionIds) {
        const c = classify(m.get(r, p), breaks);
        for (const el of ctx.map.regionEls(r)) {
          el.style.fill = c < 0 ? 'url(#ua-nodata)' : `var(--seq-${steps[c]})`;
          el.classList.toggle('is-nodata', c < 0);
        }
      }
    }
    function legend() {
      if (legendNode) legendNode.remove();
      const [min, max] = ctx.domain([id]);
      const anyMissing = ctx.data.regionIds.some((r) => m.get(r, ctx.period()) == null);
      legendNode = seqLegend({
        title: ctx.pick(cfg.legendTitle) || ctx.label(id),
        colors: steps.map((st) => `var(--seq-${st})`),
        breaks,
        min,
        max,
        fmt: (v) => formatTick(v, m.format, ctx.lang()),
        noDataLabel: anyMissing ? ctx.t('legendNoData') : null,
      });
      ctx.legend.add(legendNode);
    }
    compute();
    paint();
    legend();
    return {
      measures: [id],
      update(ch) {
        if (!ch.has('period')) return;
        if (ctx.config.options?.domain === 'per-period') compute();
        paint();
        legend();
      },
      destroy() {
        for (const el of ctx.map.svg.querySelectorAll('.region')) {
          el.style.fill = '';
          el.classList.remove('is-nodata');
        }
      },
    };
  },
};
