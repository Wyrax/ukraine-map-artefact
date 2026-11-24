// Shared scaffolding for glyph layers: one <g class="glyph" data-region> per region at its anchor,
// values tweened between periods.
import { s, clear } from '../core/dom.js';
import { tween } from '../core/anim.js';
import { REGIONS } from '../../map/catalog.js';

export function glyphLayer(ctx, kind) {
  const g = s('g', { class: `glyphs glyphs--${kind}` });
  ctx.map.layers.glyphs.appendChild(g);
  const nodes = {};
  for (const r of REGIONS) {
    nodes[r.id] = s('g', { class: 'glyph', 'data-region': r.id });
    g.appendChild(nodes[r.id]);
  }
  const owner = {};
  return {
    g,
    nodes,
    ids: REGIONS.map((r) => r.id),
    /** compute(regionId, period) → numbers; draw(node, values, [x, y], size, regionId) */
    run(compute, draw) {
      const p = ctx.period();
      const target = {};
      for (const id of this.ids) target[id] = compute(id, p);
      const size = ctx.map.glyphSize();
      tween(owner, target, (vals) => {
        for (const id of this.ids) draw(nodes[id], vals[id], ctx.map.anchor(id), size, id);
      });
    },
    /** Draw larger glyphs first so small ones stay visible on top. */
    order(sizeOf) {
      const sorted = [...this.ids].sort((a, b) => sizeOf(b) - sizeOf(a));
      for (const id of sorted) g.appendChild(nodes[id]);
    },
    destroy() {
      if (owner._raf) cancelAnimationFrame(owner._raf);
      clear(g);
      g.remove();
    },
  };
}

/**
 * Vertical frame for column glyphs (bars, stacked): columns stand on a base just below the anchor and grow up,
 * so taller columns (heightScale > 1) rise above the region instead of sinking into the one below.
 */
export function columnFrame(size, cfg, k0) {
  const hMax = (cfg.maxHeight ?? size * k0) * (cfg.heightScale ?? 1);
  const baseOff = Math.min(hMax / 2, size * 0.45);
  return { hMax, baseOff };
}

/** Reuses (or creates) the n-th child element of a glyph node. */
export function child(node, i, tag, cls) {
  let el = node.children[i];
  if (!el || el.tagName.toLowerCase() !== tag) {
    el = s(tag, { class: cls });
    if (node.children[i]) node.replaceChild(el, node.children[i]);
    else node.appendChild(el);
  }
  return el;
}

export function trim(node, n) {
  while (node.children.length > n) node.lastChild.remove();
}
