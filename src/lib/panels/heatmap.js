// Heatmap grid: rows = regions, columns = periods (default) or series ("by": "series").
// Same classed sequential scale idea as the choropleth. Clicking a cell selects the region and jumps to that period.
// { "type": "heatmap", "value": "users", "by": "period" | "series", "series": [...], "sort": "name" | "value" }
import { h, clear, esc } from '../core/dom.js';
import { classBreaks, classify, rampSteps } from '../core/scales.js';
import { formatTick } from '../core/format.js';
import { seqLegend } from '../core/legend.js';

export default {
  title: (ctx, cfg) => (cfg.by === 'series' ? cfg.series.map((id) => ctx.label(id)).join(' · ') : ctx.label(cfg.value)),
  mount(body, ctx, cfg) {
    const bySeries = cfg.by === 'series';
    const cols = bySeries ? cfg.series : ctx.data.periods.map((_, i) => i);
    const ids = bySeries ? cfg.series : [cfg.value];
    const fmtId = ids[0];
    const vals = [];
    for (const id of ids) vals.push(...ctx.values(id, false));
    const breaks = classBreaks(vals, cfg.classes ?? 5, cfg.breaks ?? (ctx.measure(fmtId).format === 'pct' ? 'equal' : 'quantile'));
    const steps = rampSteps(breaks.length + 1);
    const grid = h('div', { class: 'hm', role: 'grid' });
    const scroll = h('div', { class: 'hm-scroll' }, grid);
    const legendHost = h('div', { class: 'hm-legend' });
    body.append(scroll, legendHost);

    function cellValue(r, c, p) {
      return bySeries ? ctx.measure(c).get(r, p) : ctx.measure(cfg.value).get(r, c);
    }

    function render() {
      clear(grid);
      const p = ctx.period();
      // names shrink (with "…") before the grid would overflow the panel; month columns can get as thin as 3px
      grid.style.gridTemplateColumns = `minmax(64px, max-content) repeat(${cols.length}, minmax(${bySeries ? 44 : 3}px, 1fr))`;
      grid.classList.toggle('hm--periods', !bySeries);
      grid.appendChild(h('span', { class: 'hm-corner' }));
      const n = cols.length;
      // first and last months are pinned to the grid's edges; the current one is named when it is clear of them
      const clearOfEnds = (i) => Math.min(i, n - 1 - i) >= Math.max(3, n * 0.22);
      cols.forEach((c, i) => {
        if (bySeries) {
          grid.appendChild(h('span', { class: 'hm-col', title: ctx.label(c) }, ctx.label(c)));
          return;
        }
        const named = i === 0 || i === n - 1 || (i === p && clearOfEnds(i));
        const edge = i === 0 ? ' hm-col--first' : i === n - 1 ? ' hm-col--last' : '';
        grid.appendChild(h('span', { class: 'hm-col' + edge + (i === p ? ' is-now' : ''), title: ctx.periodLabel(i) }, named ? h('span', { class: 'hm-col__t' }, ctx.periodLabel(i)) : null));
      });
      let rows = [...ctx.data.regionIds];
      if (cfg.sort === 'value') rows.sort((a, b) => (cellValue(b, cols[bySeries ? 0 : p], p) ?? -1) - (cellValue(a, cols[bySeries ? 0 : p], p) ?? -1));
      else rows.sort((a, b) => ctx.regionName(a).localeCompare(ctx.regionName(b), ctx.lang()));
      for (const r of rows) {
        grid.appendChild(h('span', { class: 'hm-row', 'data-region': r, title: ctx.regionName(r, true) }, ctx.regionName(r)));
        cols.forEach((c, i) => {
          const v = cellValue(r, c, p);
          const k = classify(v, breaks);
          const cell = h('span', {
            class: 'hm-cell' + (!bySeries && i === p ? ' is-now' : '') + (k < 0 ? ' is-nodata' : ''),
            'data-region': r,
            'data-owntip': '',
            style: k < 0 ? '' : `background:var(--seq-${steps[k]});color:var(--seq-on-${steps[k]})`,
          });
          if (!bySeries) cell.setAttribute('data-period', i);
          if (bySeries) cell.textContent = v == null ? '' : formatTick(v, ctx.measure(c).format, ctx.lang());
          cell.addEventListener('pointerenter', (e) => {
            const head = bySeries ? ctx.label(c) : ctx.periodLabel(i);
            ctx.tooltip.show(`<div class="tip__h"><b>${esc(ctx.regionName(r, true))}</b><span>${esc(head)}</span></div><div class="tip__big">${esc(ctx.fmtUnit(v, bySeries ? c : cfg.value))}</div>`, e.clientX, e.clientY);
          });
          cell.addEventListener('pointerleave', () => ctx.tooltip.hide());
          grid.appendChild(cell);
        });
      }
      clear(legendHost);
      const [min, max] = [Math.min(...vals), Math.max(...vals)];
      legendHost.appendChild(seqLegend({ colors: steps.map((st) => `var(--seq-${st})`), breaks, min, max, fmt: (v) => formatTick(v, ctx.measure(fmtId).format, ctx.lang()) }));
    }
    render();
    return {
      update(ch) {
        if (ch.has('period')) render();
      },
    };
  },
};
