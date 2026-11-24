// Two-column Sankey for flows at the current period.
//   "flows": "series"             — regions → series, built from values (e.g. users per environment)
//   "flows": "category" (default) — regions → categories, from data.flows with `to` = a category id
//   "flows": "region"             — origin regions → destination regions, from data.flows
// { "type": "sankey", "flows": "series", "series": ["dev","test","prod"], "limit": 8, "height": 320 }
import { s, h, clear, esc } from '../core/dom.js';
import { tween } from '../core/anim.js';
import { formatValue } from '../core/format.js';

export default {
  title: (ctx, cfg) => (cfg.flows === 'region' ? `${ctx.t('from')} → ${ctx.t('to')}` : ctx.lang() === 'en' ? 'Regions → categories' : 'Регіони → категорії'),
  mount(body, ctx, cfg) {
    const toRegion = cfg.flows === 'region';
    const fromSeries = cfg.flows === 'series';
    const seriesIds = fromSeries ? cfg.series || ctx.data.series.map((x) => x.id) : [];
    let flowsAt;
    let all;
    if (fromSeries) {
      flowsAt = (p) => ctx.data.regionIds.flatMap((r) => seriesIds.map((sid) => ({ from: r, to: sid, p, value: ctx.measure(sid).get(r, p) ?? 0 }))).filter((f) => f.value > 0);
      all = ctx.data.periods.flatMap((_, p) => flowsAt(p));
    } else {
      const pick = (f) => f.toRegion === toRegion && (!cfg.series || f.series === cfg.series) && !(toRegion && f.from === f.to);
      flowsAt = (p) => ctx.data.flowsAt(p).filter(pick);
      all = ctx.data.flows.filter(pick);
    }
    if (!all.length) {
      body.closest('.panel').hidden = true;
      return {};
    }
    const limit = cfg.limit ?? 8;
    const OTHER = '__other';
    // fixed node order from totals over all periods, so nodes don't jump while the timeline plays
    const tot = (key) => {
      const m = new Map();
      for (const f of all) m.set(f[key], (m.get(f[key]) || 0) + f.value);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    };
    const leftAll = tot('from');
    const left = leftAll.slice(0, limit);
    const rightAll = toRegion ? tot('to') : fromSeries ? seriesIds : ctx.data.categories.map((c) => c.id).filter((id) => all.some((f) => f.to === id));
    const right = toRegion ? rightAll.slice(0, limit) : rightAll;
    const lk = (id) => (left.includes(id) ? id : OTHER);
    const rk = (id) => (right.includes(id) ? id : OTHER);
    const L = leftAll.length > left.length ? [...left, OTHER] : left;
    const R = rightAll.length > right.length ? [...right, OTHER] : right;
    const host = h('div', { class: 'sk' });
    body.appendChild(host);
    const owner = {};

    // label widths: measured with a canvas in the labels' own fonts, so the label columns fit their text
    const probe = s('svg', { class: 'sk-svg', width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;visibility:hidden' }, s('text', { class: 'sk-label' }, 'x', s('tspan', { class: 'sk-val' }, '0')));
    body.appendChild(probe);
    const fontOf = (el) => {
      const cs = getComputedStyle(el);
      return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    };
    const c2 = document.createElement('canvas').getContext('2d');
    let fonts = null; // read once: draw() runs on every animation frame
    const textW = (name, val) => {
      fonts ||= [fontOf(probe.querySelector('text')), fontOf(probe.querySelector('tspan'))];
      c2.font = fonts[0];
      const a = c2.measureText(name + ' ').width;
      c2.font = fonts[1];
      return (a + c2.measureText(val).width) * 1.02; // small margin for the web font arriving later
    };
    /** Shortens the name with "…" until name + value fit in maxW. */
    const fitName = (name, val, maxW) => {
      if (textW(name, val) <= maxW) return name;
      let n = name;
      while (n.length > 1 && textW(n + '…', val) > maxW) n = n.slice(0, -1);
      return n + '…';
    };
    const H = cfg.height ?? Math.max(220, L.length * 30);

    const nameL = (id) => (id === OTHER ? ctx.t('other') : ctx.regionName(id));
    const nameR = (id) =>
      id === OTHER ? ctx.t('other') : toRegion ? ctx.regionName(id) : fromSeries ? ctx.label(id) : ctx.pick(ctx.data.categories.find((c) => c.id === id)?.label) || id;
    const colorR = (id) =>
      id === OTHER ? 'var(--muted)' : toRegion ? ctx.color(2) : fromSeries ? ctx.seriesColor(id) : ctx.color(ctx.data.categories.find((c) => c.id === id)?.slot ?? 1);
    const fmtId = fromSeries ? seriesIds[0] : typeof cfg.series === 'string' ? cfg.series : ctx.data.series[0].id;

    function target() {
      const m = {};
      for (const a of L) for (const b of R) m[`${a}|${b}`] = 0;
      for (const f of flowsAt(ctx.period())) m[`${lk(f.from)}|${rk(f.to)}`] += f.value;
      return m;
    }

    function draw(vals) {
      clear(host);
      const W = Math.max(260, host.clientWidth || body.clientWidth || 320);
      const nodeW = 9;
      const pad = 6;
      const sumL = L.map((a) => R.reduce((acc, b) => acc + vals[`${a}|${b}`], 0));
      const sumR = R.map((b) => L.reduce((acc, a) => acc + vals[`${a}|${b}`], 0));
      const total = sumL.reduce((a, b) => a + b, 0);
      const k = total > 0 ? Math.min((H - pad * (L.length - 1)) / total, (H - pad * (R.length - 1)) / total) : 0;
      // label columns as wide as their visible labels (nodes too thin for a label are reachable through hover),
      // capped so the links keep at least ~18 % of the width; longer names get "…"
      const showL = sumL.map((v) => v * k + pad >= 12);
      const showR = sumR.map((v) => v * k + pad >= 12);
      const needL = Math.max(0, ...L.map((a, i) => (showL[i] ? textW(nameL(a), ctx.fmt(sumL[i], fmtId)) : 0)));
      const needR = Math.max(0, ...R.map((b, j) => (showR[j] ? textW(nameR(b), ctx.fmt(sumR[j], fmtId)) : 0)));
      const room = W - 2 * nodeW - 12 - W * 0.18;
      const scale = needL + needR > room ? room / (needL + needR) : 1;
      const lw = needL * scale + 6;
      const rw = needR * scale + 6;
      const x0 = lw;
      const x1 = W - rw - nodeW;
      const svg = s('svg', { class: 'sk-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ctx.pick(cfg.title) || 'Sankey' });
      const yL = [];
      let acc = 0;
      L.forEach((a, i) => {
        yL.push(acc);
        acc += sumL[i] * k + pad;
      });
      const yR = [];
      acc = 0;
      R.forEach((b, i) => {
        yR.push(acc);
        acc += sumR[i] * k + pad;
      });
      // links: stacked in node order on both sides
      const offL = L.map(() => 0);
      const offR = R.map(() => 0);
      const links = s('g', { class: 'sk-links' });
      L.forEach((a, i) => {
        R.forEach((b, j) => {
          const v = vals[`${a}|${b}`];
          if (!(v > 0)) return;
          const hgt = v * k;
          const ya = yL[i] + offL[i];
          const yb = yR[j] + offR[j];
          offL[i] += hgt;
          offR[j] += hgt;
          const xm = (x0 + nodeW + x1) / 2;
          const d = `M${x0 + nodeW} ${ya}C${xm} ${ya} ${xm} ${yb} ${x1} ${yb}L${x1} ${yb + hgt}C${xm} ${yb + hgt} ${xm} ${ya + hgt} ${x0 + nodeW} ${ya + hgt}Z`;
          const p = s('path', { class: 'sk-link', d, 'data-owntip': '' });
          if (a !== OTHER) p.setAttribute('data-region', a);
          p.style.fill = colorR(b);
          p.addEventListener('pointerenter', (e) => {
            const share = sumL[i] ? v / sumL[i] : 0;
            const of = ctx.lang() === 'en' ? `of ${nameL(a)}` : `від ${nameL(a)}`;
            ctx.tooltip.show(`<div class="tip__h"><b>${esc(nameL(a))} → ${esc(nameR(b))}</b><span>${esc(ctx.periodLabel(ctx.period()))}</span></div><div class="tip__big">${esc(ctx.fmtUnit(v, fmtId))} <small>${esc(formatValue(share, 'pct', ctx.lang()))} ${esc(of)}</small></div>`, e.clientX, e.clientY);
          });
          p.addEventListener('pointerleave', () => ctx.tooltip.hide());
          links.appendChild(p);
        });
      });
      svg.appendChild(links);
      L.forEach((a, i) => {
        const g = s('g', { class: 'sk-node' + (a === OTHER ? '' : ' is-region'), 'data-owntip': '' });
        if (a !== OTHER) g.setAttribute('data-region', a);
        g.appendChild(s('rect', { x: x0, y: yL[i], width: nodeW, height: Math.max(1, sumL[i] * k), rx: 2 }, s('title', {}, `${nameL(a)}: ${ctx.fmt(sumL[i], fmtId)}`)));
        // label only nodes tall enough to hold one line; the rest stay reachable through hover
        if (showL[i]) {
          const v = ctx.fmt(sumL[i], fmtId);
          g.appendChild(s('text', { x: x0 - 6, y: yL[i] + (sumL[i] * k) / 2 + 3.5, 'text-anchor': 'end', class: 'sk-label' }, `${fitName(nameL(a), v, lw - 6)} `, s('tspan', { class: 'sk-val' }, v)));
        }
        svg.appendChild(g);
      });
      R.forEach((b, j) => {
        const g = s('g', { class: 'sk-node sk-node--r' });
        if (toRegion && b !== OTHER) g.setAttribute('data-region', b);
        const r = s('rect', { x: x1, y: yR[j], width: nodeW, height: Math.max(1, sumR[j] * k), rx: 2 });
        r.style.fill = colorR(b);
        r.appendChild(s('title', {}, `${nameR(b)}: ${ctx.fmt(sumR[j], fmtId)}`));
        g.appendChild(r);
        if (showR[j]) {
          const v = ctx.fmt(sumR[j], fmtId);
          g.appendChild(s('text', { x: x1 + nodeW + 6, y: yR[j] + (sumR[j] * k) / 2 + 3.5, class: 'sk-label' }, `${fitName(nameR(b), v, rw - 6)} `, s('tspan', { class: 'sk-val' }, v)));
        }
        svg.appendChild(g);
      });
      host.appendChild(svg);
    }

    const run = () => tween(owner, target(), draw);
    run();
    // label widths depend on the web font: measure again once it has loaded
    document.fonts?.ready.then(() => host.isConnected && draw(owner._cur || target()));
    return {
      update(ch) {
        if (ch.has('period')) run();
      },
      resize: () => draw(owner._cur || target()),
    };
  },
};
