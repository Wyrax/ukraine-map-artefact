// Value tweening for timeline transitions. Views keep their last drawn values on an owner object
// and call tween(owner, target, draw): numbers (also nested in arrays/objects) interpolate.

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DURATION = 450;

function lerp(a, b, t) {
  if (typeof b === 'number') return typeof a === 'number' ? a + (b - a) * t : b;
  if (Array.isArray(b)) return b.map((v, i) => lerp(Array.isArray(a) ? a[i] : undefined, v, t));
  if (b && typeof b === 'object') {
    const o = {};
    for (const k of Object.keys(b)) o[k] = lerp(a && typeof a === 'object' ? a[k] : undefined, b[k], t);
    return o;
  }
  return b;
}

export function tween(owner, target, draw, dur = DURATION) {
  if (owner._raf) cancelAnimationFrame(owner._raf);
  const from = owner._cur;
  if (reduced || from === undefined || dur <= 0) {
    owner._cur = target;
    draw(target);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    owner._cur = lerp(from, target, e);
    draw(owner._cur);
    if (k < 1) owner._raf = requestAnimationFrame(step);
    else owner._raf = 0;
  };
  owner._raf = requestAnimationFrame(step);
}
