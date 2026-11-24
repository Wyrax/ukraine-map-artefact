// Geometry helpers for map extraction.

/** Flattens a subpath ({segs:[{cmd,pts}]}) into a polygon, sampling cubic curves. */
export function flatten(sub, steps = 6) {
  const out = [];
  for (const s of sub.segs) {
    if (s.cmd === 'C') {
      const p0 = out[out.length - 1];
      const [a, b, c] = s.pts;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        out.push([
          mt * mt * mt * p0[0] + 3 * mt * mt * t * a[0] + 3 * mt * t * t * b[0] + t * t * t * c[0],
          mt * mt * mt * p0[1] + 3 * mt * mt * t * a[1] + 3 * mt * t * t * b[1] + t * t * t * c[1],
        ]);
      }
    } else out.push(s.pts[0]);
  }
  return out;
}

export function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

export function centroid(poly) {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    x += (poly[j][0] + poly[i][0]) * f;
    y += (poly[j][1] + poly[i][1]) * f;
    a += f * 3;
  }
  return a ? [x / a, y / a] : poly[0];
}

export function bbox(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist2(px, py, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Signed distance from point to polygon set boundary (positive inside any polygon). */
export function signedDist(p, polys) {
  let inside = false;
  let min = Infinity;
  for (const poly of polys) {
    if (pointInPolygon(p, poly)) inside = !inside;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) min = Math.min(min, segDist2(p[0], p[1], poly[i], poly[j]));
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

/**
 * Pole of inaccessibility (Mapbox "polylabel" algorithm): the interior point farthest from the edges.
 * obstacles: [{c:[x,y], r}] circles the point should also keep away from.
 * Returns {pt:[x,y], r: distance to nearest edge/obstacle}.
 */
export function polylabel(polys, precision = 0.5, obstacles = []) {
  const [x0, y0, x1, y1] = bbox(polys.flat());
  const w = x1 - x0;
  const h = y1 - y0;
  const dist = (x, y) => {
    let d = signedDist([x, y], polys);
    for (const o of obstacles) d = Math.min(d, Math.hypot(x - o.c[0], y - o.c[1]) - o.r);
    return d;
  };
  const cell = (x, y, half) => {
    const d = dist(x, y);
    return { x, y, h: half, d, max: d + half * Math.SQRT2 };
  };
  let size = Math.min(w, h);
  let half = size / 2;
  const queue = [];
  for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) queue.push(cell(x + half, y + half, half));
  const c = centroid(polys.reduce((a, b) => (area(b) > area(a) ? b : a)));
  let best = cell(c[0], c[1], 0);
  for (const q of queue) if (q.d > best.d) best = q;
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const q = queue.pop();
    if (q.d > best.d) best = q;
    if (q.max - best.d <= precision) continue;
    const hh = q.h / 2;
    queue.push(cell(q.x - hh, q.y - hh, hh), cell(q.x + hh, q.y - hh, hh), cell(q.x - hh, q.y + hh, hh), cell(q.x + hh, q.y + hh, hh));
  }
  return { pt: [best.x, best.y], r: best.d };
}

/** Least-squares fit of a 2nd-order polynomial z = f(u, v). Returns 6 coefficients. */
export function fitPoly2(samples /* [{u, v, z}] */) {
  const feat = (u, v) => [1, u, v, u * u, u * v, v * v];
  const n = 6;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (const s of samples) {
    const f = feat(s.u, s.v);
    for (let i = 0; i < n; i++) {
      b[i] += f[i] * s.z;
      for (let j = 0; j < n; j++) A[i][j] += f[i] * f[j];
    }
  }
  // Gaussian elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

export const evalPoly2 = (c, u, v) => c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v;
