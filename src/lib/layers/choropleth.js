// Choropleth: fills each region by a classed sequential scale.
// { "type": "choropleth", "value": "<series|measure>", "classes": 5, "breaks": "quantile"|"equal"|[thresholds], "values": false }
// "values": the number on each region (under its name). All three are also view options the viewer can change.
import { classBreaks, classify, rampSteps } from '../core/scales.js';
import { formatTick } from '../core/format.js';
import { seqLegend } from '../core/legend.js';

export default {
  options: (cfg, { layout, measure }) => [
    { key: 'values', type: 'toggle', label: { uk: 'Цифри на областях', en: 'Values on regions' }, default: cfg.values ?? layout === 'hex' },
    { key: 'classes', type: 'choice', label: { uk: 'Класи', en: 'Classes' }, default: cfg.classes ?? 5, choices: [3, 5, 7].map((v) => ({ value: v, label: String(v) })) },
    ...(Array.isArray(cfg.breaks)
      ? []
      : [
          {
            key: 'breaks',
            type: 'choice',
            label: { uk: 'Межі класів', en: 'Class breaks' },
            default: cfg.breaks ?? (measure(cfg.value).format === 'pct' ? 'equal' : 'quantile'),
            choices: [
              { value: 'quantile', label: { uk: 'Квантилі', en: 'Quantiles' } },
              { value: 'equal', label: { uk: 'Рівні', en: 'Equal' } },
            ],
          },
        ]),
  ],
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
      labelValue: cfg.values ? id : null,
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
