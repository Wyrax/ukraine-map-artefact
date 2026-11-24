// Ranked horizontal bars (single measure) or stacked bars (several series), animated re-ordering.
// { "type": "ranking", "value": "users" }  or  { "type": "ranking", "series": ["dev","test","prod"], "limit": 10 }
import { h, clear } from '../core/dom.js';

export default {
  title: (ctx, cfg) => (cfg.value ? ctx.label(cfg.value) : cfg.series.map((id) => ctx.label(id)).join(' · ')),
  mount(body, ctx, cfg) {
    const stacked = !cfg.value;
    const ids = stacked ? cfg.series : [cfg.value];
    const ms = ids.map((id) => ctx.measure(id));
    const limit = cfg.limit ?? 10;
    let expanded = false;
    let maxAll = 0;
    for (const r of ctx.data.regionIds)
      for (let p = 0; p < ctx.data.periods.length; p++) {
        const v = ms.reduce((a, m) => a + (m.get(r, p) ?? 0), 0);
        if (v > maxAll) maxAll = v;
      }
    const list = h('ol', { class: 'rk' });
    const natEl = h('p', { class: 'rk-nat' });
    const more = h('button', { type: 'button', class: 'link-btn', onclick: () => ((expanded = !expanded), render()) });
    body.append(list, h('div', { class: 'rk-foot' }, natEl, more));
    const rows = {};

    function row(id) {
      if (rows[id]) return rows[id];
      const bar = h('span', { class: 'rk-bar' });
      const val = h('span', { class: 'rk-val' });
      const el = h('li', { class: 'rk-row', 'data-region': id, tabindex: 0, role: 'button' }, h('span', { class: 'rk-name' }), h('span', { class: 'rk-track' }, bar), val);
      rows[id] = { el, bar, val, name: el.firstChild };
      return rows[id];
    }

    function render() {
      const p = ctx.period();
      const items = ctx.data.regionIds
        .map((id) => ({ id, vals: ms.map((m) => m.get(id, p)), tot: ms.reduce((a, m) => a + (m.get(id, p) ?? 0), 0) }))
        .filter((it) => it.vals.some((v) => v != null))
        .sort((a, b) => b.tot - a.tot);
      const shown = expanded ? items : items.slice(0, limit);
      // FLIP: remember positions, reorder, animate from old position
      const before = new Map(Object.entries(rows).map(([id, r]) => [id, r.el.isConnected ? r.el.getBoundingClientRect().top : null]));
      clear(list);
      shown.forEach((it, i) => {
        const r = row(it.id);
        r.name.textContent = `${i + 1}. ${ctx.regionName(it.id)}`;
        r.val.textContent = stacked ? ctx.fmt(it.tot, ids[0]) : ctx.fmt(it.vals[0], ids[0]);
        if (stacked) {
          clear(r.bar);
          r.bar.style.width = `${maxAll ? (it.tot / maxAll) * 100 : 0}%`;
          it.vals.forEach((v, k) => {
            if (!v) return;
            r.bar.appendChild(h('span', { class: 'rk-seg', style: `flex:${v} 0 0;background:${ctx.color(ms[k].slot ?? k + 1)}` }));
          });
        } else {
          r.bar.style.width = `${maxAll ? (Math.max(0, it.vals[0] ?? 0) / maxAll) * 100 : 0}%`;
          r.bar.style.background = ctx.color(cfg.slot ?? ms[0].slot ?? 1);
        }
        list.appendChild(r.el);
      });
      for (const it of shown) {
        const r = rows[it.id];
        const old = before.get(it.id);
        if (old == null) continue;
        const dy = old - r.el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          r.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
      }
      const nat = stacked ? ms.reduce((a, m) => a + m.nat(p), 0) : ms[0].nat(p);
      natEl.textContent = `${ctx.t('ukraine')}: ${ctx.fmtUnit(nat, ids[0])}`;
      more.hidden = items.length <= limit;
      more.textContent = expanded ? ctx.t('showLess') : `${ctx.t('showAll')} (${items.length})`;
    }
    render();
    return {
      update(ch) {
        if (ch.has('period')) render();
      },
    };
  },
};
