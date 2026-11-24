// Line chart over periods.
//   "Selected" view: selected regions (colour kept per region while selected), plus Ukraine when the measure is
//   not additive (ratios) or nothing is selected.
//   "All regions" view: every region as a thin muted line; the line under the pointer (or the region hovered on the
//   map, ranking, table…) is emphasised and named; selected regions keep their colours; click a line to select it.
//   More regions selected than series colours (8): selected lines are drawn the same hover-to-name way instead of
//   repeating colours that could no longer be told apart.
// { "type": "timeline-chart", "value": "share", "compare": "selected" | "all" }
// { "type": "timeline-chart", "series": ["dev","test","prod"] }  — one line per series for Ukraine or the first selected region
import { s, h, clear, esc } from '../core/dom.js';
import { niceTicks, linear } from '../core/scales.js';
import { formatTick } from '../core/format.js';

const MAX_COLOURED = 8; // categorical palette size: beyond it a colour would stand for two regions
const viewMemo = new WeakMap(); // cfg → 'selected' | 'all', kept across re-mounts (language switch)

export default {
  title: (ctx, cfg) => (cfg.value ? ctx.label(cfg.value) : ctx.t('timeline')),
  mount(body, ctx, cfg) {
    const { periods } = ctx.data;
    if (periods.length < 2) {
      body.closest('.panel').hidden = true;
      return {};
    }
    const bySeries = !!cfg.series;
    const canAll = !bySeries;
    let view = viewMemo.get(cfg) || (cfg.compare === 'all' ? 'all' : 'selected');
    const slots = new Map(); // region → colour slot, stable while selected
    const modeEl = h('div', { class: 'seg seg--sm tc-mode', role: 'group', 'aria-label': ctx.t('compare') });
    const keyEl = h('div', { class: 'tc-key' });
    const wrap = h('div', { class: 'tc' });
    body.append(...(canAll ? [modeEl] : []), keyEl, wrap);
    const H = cfg.height ?? 190;
    const M = { t: 10, r: 12, b: 24, l: 44 };

    function renderMode() {
      clear(modeEl);
      for (const [id, label] of [['selected', ctx.t('cmpSelected')], ['all', ctx.t('cmpAll')]]) {
        modeEl.appendChild(
          h('button', {
            type: 'button',
            class: 'seg__btn',
            'aria-pressed': String(view === id),
            onclick: () => {
              view = id;
              viewMemo.set(cfg, id);
              renderMode();
              render();
            },
          }, label),
        );
      }
    }

    function selectedLines(many) {
      const sel = ctx.state.get().selected;
      for (const id of [...slots.keys()]) if (!sel.includes(id)) slots.delete(id);
      for (const id of sel) {
        if (slots.has(id)) continue;
        const used = new Set(slots.values());
        let k = 1;
        while (used.has(k)) k++;
        slots.set(id, k);
      }
      if (bySeries) {
        const who = sel[0] || null;
        return cfg.series.map((id) => {
          const m = ctx.measure(id);
          return { key: id, label: ctx.label(id), mid: id, color: ctx.color(m.slot ?? 1), vals: periods.map((_, p) => (who ? m.get(who, p) : m.nat(p))) };
        });
      }
      const m = ctx.measure(cfg.value);
      const out = [];
      const showNat = view === 'all' || many ? !m.additive : !sel.length || !m.additive;
      if (showNat) out.push({ key: 'ua', label: ctx.t('ukraine'), mid: cfg.value, color: 'var(--ink-2)', nat: true, vals: periods.map((_, p) => m.nat(p)) });
      if (!many) for (const id of sel) out.push({ key: id, region: id, label: ctx.regionName(id), mid: cfg.value, color: ctx.color(slots.get(id)), vals: periods.map((_, p) => m.get(id, p)) });
      return out;
    }

    // every region with data: [{ id, vals }]
    function allLines() {
      const m = ctx.measure(cfg.value);
      return ctx.data.regionIds.map((id) => ({ id, vals: periods.map((_, p) => m.get(id, p)) })).filter((l) => l.vals.some((v) => v != null));
    }

    const pathD = (vals, x, y) => {
      let d = '';
      vals.forEach((v, i) => {
        if (v == null) return;
        d += (d && vals[i - 1] != null ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      });
      return d;
    };

    let geom = null; // { x, y, svg, allG, hlG, every } for hover updates without a full redraw
    let ownHover = null; // region hovered from inside this chart

    function render() {
      clear(wrap);
      clear(keyEl);
      const W = Math.max(240, wrap.clientWidth || body.clientWidth || 320);
      const isAll = canAll && view === 'all';
      const sel = ctx.state.get().selected;
      const many = !bySeries && sel.length > MAX_COLOURED;
      const ls = selectedLines(many);
      // hover-to-name lines: every region ("all" view) or the selected ones when there are too many to colour;
      // selected ones are drawn last so they sit above the muted rest
      const every = (isAll ? allLines() : many ? allLines().filter((l) => sel.includes(l.id)) : []).sort((a, b) => sel.includes(a.id) - sel.includes(b.id));
      const spaghetti = every.length > 0;
      const values = [...ls, ...every].flatMap((l) => l.vals).filter((v) => v != null);
      const fmtId = bySeries ? cfg.series[0] : cfg.value;
      const format = ctx.measure(fmtId).format;
      const ticks = niceTicks(Math.min(0, ...values), Math.max(...values, 0) || 1, 4);
      const y = linear(ticks[0], ticks[ticks.length - 1], H - M.b, M.t);
      const x = linear(0, periods.length - 1, M.l, W - M.r);
      const label = isAll ? `${ctx.t('cmpAll')} (${every.length})` : many ? `${ctx.t('cmpSelectedN')} (${sel.length})` : ls.map((l) => l.label).join(', ');
      const svg = s('svg', { class: 'tc-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label });
      for (const t of ticks) {
        svg.appendChild(s('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) }));
        svg.appendChild(s('text', { class: 'tick', x: M.l - 6, y: y(t) + 3.5, 'text-anchor': 'end' }, formatTick(t, format, ctx.lang())));
      }
      const cur = ctx.period();
      const labelIdx = [...new Set([0, Math.round((periods.length - 1) / 2), periods.length - 1])];
      for (const i of labelIdx) svg.appendChild(s('text', { class: 'tick', x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === periods.length - 1 ? 'end' : 'middle' }, ctx.periodLabel(i)));
      svg.appendChild(s('line', { class: 'tc-now', x1: x(cur), x2: x(cur), y1: M.t, y2: H - M.b }));

      // all regions, muted (data-region lets the page-wide hover highlight them)
      const allG = s('g', { class: 'tc-all' });
      for (const l of every) allG.appendChild(s('path', { class: 'tc-line tc-line--all' + (many && sel.includes(l.id) ? ' tc-line--sel' : ''), d: pathD(l.vals, x, y), 'data-region': l.id, 'data-owntip': '' }));
      svg.appendChild(allG);

      for (const l of ls) {
        const path = s('path', { class: 'tc-line' + (l.nat ? ' tc-line--nat' : ''), d: pathD(l.vals, x, y) });
        path.style.stroke = l.color;
        if (l.region && !spaghetti) path.setAttribute('data-region', l.region);
        svg.appendChild(path);
        const v = l.vals[cur];
        if (v != null) {
          const dot = s('circle', { class: 'tc-dot', cx: x(cur), cy: y(v), r: 4 });
          dot.style.fill = l.color;
          svg.appendChild(dot);
        }
      }
      const hlG = s('g', { class: 'tc-hl', 'aria-hidden': 'true' });
      svg.appendChild(hlG);

      // key
      if (isAll) keyEl.appendChild(h('span', { class: 'lg-item' }, h('span', { class: 'lg-sw lg-sw--line lg-sw--muted' }), `${ctx.t('cmpAll')} (${every.length})`));
      if (many) keyEl.appendChild(h('span', { class: 'lg-item' }, h('span', { class: 'lg-sw lg-sw--line lg-sw--sel' }), `${ctx.t('cmpSelectedN')} (${sel.length})`));
      for (const l of ls) keyEl.appendChild(h('span', { class: 'lg-item' }, h('span', { class: 'lg-sw lg-sw--line', style: `--sw:${l.color}` }), l.label));
      if (spaghetti) keyEl.appendChild(h('span', { class: 'tc-hint' }, ctx.t('allHint')));
      else if (!bySeries && ctx.measure(cfg.value).additive && !ctx.state.get().selected.length) keyEl.appendChild(h('span', { class: 'tc-hint' }, ctx.t('selectHint')));

      // hit columns: hover shows values, click jumps the timeline (or selects the line under the pointer)
      const hit = s('g', { class: 'tc-hit' });
      const cw = (W - M.l - M.r) / Math.max(1, periods.length - 1);
      const nearest = (i, clientY) => {
        const box = svg.getBoundingClientRect();
        const py = ((clientY - box.top) / box.height) * H;
        let best = null;
        for (const l of every) {
          const v = l.vals[i];
          if (v == null) continue;
          const d = Math.abs(y(v) - py);
          if (d < 12 && (!best || d < best.d)) best = { id: l.id, v, d };
        }
        return best;
      };
      const tipRows = (rows) => `<table class="tip__rows">${rows.join('')}</table>`;
      const row = (color, name, val, extra = '') => `<tr><th>${color ? `<i class="tip__sw" style="--sw:${color}"></i>` : ''}${esc(name)}${extra}</th><td>${esc(val)}</td></tr>`;
      const showTip = (i, e) => {
        let rows = [];
        if (spaghetti) {
          const n = nearest(i, e.clientY);
          setOwnHover(n?.id || null);
          const ranked = every.filter((l) => l.vals[i] != null).sort((a, b) => b.vals[i] - a.vals[i]);
          if (n) {
            const k = ranked.findIndex((l) => l.id === n.id) + 1;
            rows.push(row('var(--ink)', ctx.regionName(n.id), ctx.fmtUnit(n.v, cfg.value), ` <span class="tip__muted">${esc(ctx.t('rankOf').replace('{k}', k).replace('{n}', ranked.length))}</span>`));
          } else {
            rows = ranked.slice(0, 5).map((l) => row('', ctx.regionName(l.id), ctx.fmtUnit(l.vals[i], cfg.value)));
          }
        }
        for (const l of ls) rows.push(row(l.color, l.label, ctx.fmtUnit(l.vals[i], l.mid)));
        ctx.tooltip.show(`<div class="tip__h"><b>${esc(ctx.periodLabel(i))}</b></div>${tipRows(rows)}`, e.clientX, e.clientY);
      };
      periods.forEach((_, i) => {
        const r = s('rect', { x: x(i) - cw / 2, y: M.t, width: cw, height: H - M.t - M.b, 'data-period': i, 'data-owntip': '' });
        r.addEventListener('pointerenter', (e) => showTip(i, e));
        r.addEventListener('pointermove', (e) => (spaghetti ? showTip(i, e) : ctx.tooltip.move(e.clientX, e.clientY)));
        r.addEventListener('pointerleave', () => ctx.tooltip.hide());
        if (spaghetti) {
          r.addEventListener('click', (e) => {
            const n = nearest(i, e.clientY);
            if (!n) return; // falls through to the page handler: jump to this period
            e.stopPropagation();
            ctx.toggleSelect(n.id);
          });
        }
        hit.appendChild(r);
      });
      if (spaghetti) hit.addEventListener('pointerleave', () => setOwnHover(null));
      svg.appendChild(hit);
      wrap.appendChild(svg);
      geom = spaghetti ? { x, y, allG, hlG, every, cur } : null;
      drawHighlight(ctx.state.get().hover);
    }

    function setOwnHover(id) {
      if (id === ownHover) return;
      ownHover = id;
      ctx.state.set({ hover: id });
    }

    // emphasise one region's line: raise it, add its dot and name at the current period
    function drawHighlight(id) {
      if (!geom) return;
      clear(geom.hlG);
      const l = id && geom.every.find((e) => e.id === id);
      if (!l) return;
      const path = geom.allG.querySelector(`[data-region="${id}"]`);
      if (path) geom.allG.appendChild(path);
      let i = geom.cur;
      while (i >= 0 && l.vals[i] == null) i--; // last period with data
      if (i < 0) return;
      const cx = geom.x(i);
      const cy = geom.y(l.vals[i]);
      geom.hlG.appendChild(s('circle', { class: 'tc-dot tc-dot--hl', cx, cy, r: 3.5 }));
      const right = cx > (geom.x(0) + geom.x(periods.length - 1)) / 2;
      geom.hlG.appendChild(s('text', { class: 'tc-hl-label', x: cx + (right ? -7 : 7), y: cy - 6, 'text-anchor': right ? 'end' : 'start' }, ctx.regionName(id)));
    }

    const unsub = ctx.state.on((st, ch) => {
      if (ch.has('hover')) drawHighlight(st.hover);
    });
    if (canAll) renderMode();
    render();
    return {
      update(ch) {
        if (ch.has('period') || ch.has('selected')) render();
      },
      resize: render,
      destroy: unsub,
    };
  },
};
