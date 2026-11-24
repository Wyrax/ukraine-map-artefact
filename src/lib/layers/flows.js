// Region → region flow map: curved arrows between anchors, width ∝ value.
// { "type": "flows", "series": null, "slot": 2, "maxWidth": 7, "min": 0 }
import { s, attrs, clear, esc } from '../core/dom.js';
import { tween } from '../core/anim.js';
import { catLegend } from '../core/legend.js';

export default {
  mount(ctx, cfg) {
    const g = s('g', { class: 'flows' });
    ctx.map.layers.flows.appendChild(g);
    const color = ctx.color(cfg.slot ?? 2);
    const pick = (f) => f.toRegion && (!cfg.series || f.series === cfg.series) && f.from !== f.to;
    const all = ctx.data.flows.filter(pick);
    const max = Math.max(1, ...all.map((f) => f.value));
    const keys = [...new Set(all.map((f) => `${f.from}>${f.to}`))];
    const nodes = {};
    for (const k of keys) {
      const [from, to] = k.split('>');
      const el = s('g', { class: 'flow', 'data-from': from, 'data-to': to }, s('path', { class: 'flow-line' }), s('path', { class: 'flow-head' }));
      el.style.setProperty('--fc', color);
      g.appendChild(el);
      nodes[k] = el;
    }
    const owner = {};
    const fmtKey = (k) => k.split('>').map((id) => ctx.regionName(id)).join(' → ');

    function geom(k, v) {
      const [from, to] = k.split('>');
      const [x1, y1] = ctx.map.anchor(from);
      const [x2, y2] = ctx.map.anchor(to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const bend = cfg.curve ?? 0.22;
      const cx = (x1 + x2) / 2 - (dy / len) * len * bend;
      const cy = (y1 + y2) / 2 + (dx / len) * len * bend;
      const w = v > 0 ? 0.8 + (v / max) * (cfg.maxWidth ?? 7) : 0;
      // stop short of the target so the head sits beside, not on, the anchor
      const tx = x2 - cx;
      const ty = y2 - cy;
      const tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl;
      const uy = ty / tl;
      const head = Math.max(5, w * 1.8);
      const ex = x2 - ux * 5;
      const ey = y2 - uy * 5;
      const bx = ex - ux * head;
      const by = ey - uy * head;
      const hw = Math.max(3, w * 1.1);
      return {
        line: `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`,
        headD: `M${ex.toFixed(1)} ${ey.toFixed(1)}L${(bx - uy * hw).toFixed(1)} ${(by + ux * hw).toFixed(1)}L${(bx + uy * hw).toFixed(1)} ${(by - ux * hw).toFixed(1)}Z`,
        w,
      };
    }

    function draw() {
      const p = ctx.period();
      const target = Object.fromEntries(keys.map((k) => [k, 0]));
      for (const f of ctx.data.flowsAt(p).filter(pick)) target[`${f.from}>${f.to}`] += f.value;
      tween(owner, target, (vals) => {
        for (const k of keys) {
          const v = vals[k];
          const el = nodes[k];
          const show = v > (cfg.min ?? 0) + 1e-9;
          el.style.display = show ? '' : 'none';
          if (!show) continue;
          const gm = geom(k, v);
          attrs(el.children[0], { d: gm.line, 'stroke-width': gm.w });
          attrs(el.children[1], { d: gm.headD });
          el.dataset.value = String(v);
        }
      });
      // thin flows on top
      const cur = owner._cur || target;
      [...keys].sort((a, b) => target[b] - target[a]).forEach((k) => g.appendChild(nodes[k]));
      void cur;
    }

    function related() {
      const hv = ctx.state.get().hover;
      g.classList.toggle('has-focus', !!hv);
      for (const k of keys) {
        const [from, to] = k.split('>');
        nodes[k].classList.toggle('is-related', !!hv && (from === hv || to === hv));
      }
    }

    g.addEventListener('pointerover', (e) => {
      const el = e.target.closest('.flow');
      if (!el) return;
      const k = `${el.dataset.from}>${el.dataset.to}`;
      const target = ctx.data.flowsAt(ctx.period()).filter(pick).filter((f) => `${f.from}>${f.to}` === k).reduce((a, f) => a + f.value, 0);
      el.classList.add('is-hot');
      ctx.tooltip.show(`<div class="tip__h"><b>${esc(fmtKey(k))}</b><span>${esc(ctx.periodLabel(ctx.period()))}</span></div><div class="tip__big">${esc(ctx.fmtUnit(target, cfg.series || ctx.data.series[0].id))}</div>`, e.clientX, e.clientY);
    });
    g.addEventListener('pointerout', (e) => {
      const el = e.target.closest('.flow');
      if (el) el.classList.remove('is-hot');
      ctx.tooltip.hide();
    });

    const off = ctx.state.on((st, ch) => ch.has('hover') && related());
    draw();
    ctx.legend.add(catLegend({ title: ctx.pick(cfg.legendTitle) || (ctx.lang() === 'en' ? 'Flows between regions' : 'Потоки між регіонами'), items: [{ label: ctx.lang() === 'en' ? 'arrow width = volume' : 'товщина стрілки = обсяг', color, shape: 'line' }] }));
    return {
      measures: [],
      update(ch) {
        if (ch.has('period')) draw();
      },
      destroy() {
        off();
        if (owner._raf) cancelAnimationFrame(owner._raf);
        clear(g);
        g.remove();
      },
    };
  },
};
