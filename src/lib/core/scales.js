// Scales, ticks and class breaks.

export const linear = (d0, d1, r0, r1) => (v) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

/** Area-true radius: r ∝ √value. */
export const sqrtRadius = (max, rMax) => (v) => (max > 0 && v > 0 ? Math.sqrt(v / max) * rMax : 0);

function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Round tick values covering [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, count);
  const start = Math.floor(min / step) * step;
  const out = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toPrecision(12));
  return out;
}

export function niceMax(max) {
  if (!(max > 0)) return 1;
  const t = niceTicks(0, max, 4);
  return t[t.length - 1];
}

/**
 * Class breaks for a classed choropleth.
 * method: 'quantile' (default, good for skewed counts) | 'equal' (good for shares) | number[] (custom thresholds)
 * Returns k-1 thresholds.
 */
export function classBreaks(values, k = 5, method = 'quantile') {
  if (Array.isArray(method)) return method.slice();
  const vals = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!vals.length) return [];
  const min = vals[0];
  const max = vals[vals.length - 1];
  let br;
  if (method === 'equal') {
    const ticks = niceTicks(min, max, k);
    br = ticks.slice(1, -1);
    if (br.length > k - 1) br = br.slice(0, k - 1);
  } else {
    br = [];
    for (let i = 1; i < k; i++) {
      const q = vals[Math.min(vals.length - 1, Math.floor((i / k) * vals.length))];
      br.push(roundNice(q, max - min));
    }
  }
  return [...new Set(br)].filter((b) => b > min && b <= max);
}

function roundNice(v, span) {
  if (span <= 0) return v;
  const step = 10 ** Math.floor(Math.log10(span / 20));
  return Math.round(v / step) * step;
}

export function classify(v, breaks) {
  if (v == null || !Number.isFinite(v)) return -1;
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i++;
  return i;
}

/** Picks k evenly spread steps (1-based) out of a 7-step sequential ramp. */
export function rampSteps(k, total = 7) {
  if (k <= 1) return [Math.ceil(total / 2)];
  return Array.from({ length: k }, (_, i) => 1 + Math.round((i * (total - 1)) / (k - 1)));
}
