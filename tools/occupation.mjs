#!/usr/bin/env node
// Builds the "current occupation" map layer from a DeepStateMap snapshot (deepstatemap.live, Ukrainian OSINT project).
//
//   node tools/occupation.mjs --fetch            download the latest snapshot into .tmp/ and build
//   node tools/occupation.mjs --file x.geojson   build from a saved snapshot
//   --label-year 2027                            year shown on the toggle ("Окупація (2027)"); kept on later runs
//                                                until the snapshot itself is newer. The footnote always gives asOf.
//
// Output: src/map/occupation.json — { asOf, source, area (SVG path, even-odd), line (front line polylines), … }.
//
// How it is fitted to our map (whose projection is only known through a lat/lon → SVG polynomial fit):
//   1. occupied + ORDLO + Crimea polygons are projected with regions.json georef;
//   2. an affine correction is fitted by ICP: polygon vertices lying on the state border / coast are pulled onto
//      the map's own outline (this removes most of the local georef error around the front);
//   3. the polygons are rasterised (4 px per unit), cut to the map's land, thin strips left along the border or coast
//      are filled, Crimea and Sevastopol are taken from the map's own shapes;
//   4. the result is traced back to vector: `area` for the hatch, `line` only where occupied land meets free land.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalPoly2 } from './lib/geom.mjs';
import { readRegionShapes } from './lib/svgpath.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);
const args = process.argv.slice(2);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const log = (...a) => console.log(...a);

const API = 'https://deepstatemap.live/api/history';
const K = 4; // raster pixels per viewBox unit
const KEEP = [/geoJSON\.status\.occupied\b/, /geoJSON\.territories\.ordlo\b/, /geoJSON\.territories\.crimea\b/];

// ---------- snapshot ----------
async function fetchLatest() {
  const list = await (await fetch(`${API}/public`)).json();
  const last = list.filter((e) => e.status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const res = await fetch(`${API}/${last.id}/geojson`);
  if (!res.ok) throw new Error(`DeepStateMap ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(P('.tmp'), { recursive: true });
  const file = P('.tmp', `deepstate-${last.id}.geojson`);
  fs.writeFileSync(file, text);
  fs.writeFileSync(file.replace(/\.geojson$/, '.meta.json'), JSON.stringify(last, null, 1));
  log(`fetched snapshot ${last.id} (${last.createdAt}) → ${path.relative(ROOT, file)}`);
  return file;
}

const file = args.includes('--fetch') ? await fetchLatest() : opt('--file');
if (!file) {
  console.error('Usage: node tools/occupation.mjs --fetch | --file snapshot.geojson');
  process.exit(1);
}
const snapshotId = (path.basename(file).match(/(\d{9,})/) || [])[1] || null;
const metaFile = file.replace(/\.geojson$/, '.meta.json');
const snapMeta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const gj = JSON.parse(fs.readFileSync(file, 'utf8'));
const feats = gj.features.filter((f) => KEEP.some((re) => re.test(f.properties?.name || '')) && /Polygon/.test(f.geometry?.type));
const polysLL = feats.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
log(`features kept: ${feats.length} (${polysLL.length} polygons)`);

// ---------- our map ----------
const regions = JSON.parse(fs.readFileSync(P('src/map/regions.json'), 'utf8'));
const shapes = readRegionShapes(fs.readFileSync(P('src/map/ukraine.svg'), 'utf8'));
const [, , VW, VH] = regions.viewBox;
const W = Math.ceil(VW * K);
const H = Math.ceil(VH * K);
const N = W * H;
const g = regions.georef;
const project = ([lon, lat]) => [evalPoly2(g.x, lon - g.lon0, lat - g.lat0), evalPoly2(g.y, lon - g.lon0, lat - g.lat0)];

// ---------- raster helpers ----------
/** Even-odd fill of `rings` (viewBox units) into mask (OR). */
function fill(mask, rings) {
  const edges = [];
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const ay = a[1] * K;
      const by = b[1] * K;
      if (ay === by) continue;
      const lo = Math.max(0, Math.ceil(Math.min(ay, by) - 0.5));
      const hi = Math.min(H - 1, Math.ceil(Math.max(ay, by) - 0.5) - 1); // half-open: a vertex on a scanline counts once
      if (lo <= hi) edges.push({ ax: a[0] * K, ay, bx: b[0] * K, by, lo, hi });
    }
  }
  edges.sort((p, q) => p.lo - q.lo);
  let next = 0;
  let active = [];
  const xs = [];
  for (let y = edges[0]?.lo ?? H; y < H && (next < edges.length || active.length); y++) {
    while (next < edges.length && edges[next].lo === y) active.push(edges[next++]);
    active = active.filter((e) => e.hi >= y);
    const sy = y + 0.5;
    xs.length = 0;
    for (const e of active) xs.push(e.ax + ((sy - e.ay) / (e.by - e.ay)) * (e.bx - e.ax));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) mask[y * W + x] = 1;
    }
  }
}

/** Chamfer (3-4) distance in pixels to the nearest pixel where src === value. */
function distanceTo(src, value) {
  const INF = 65000;
  const d = new Uint16Array(N).fill(INF);
  for (let i = 0; i < N; i++) if (src[i] === value) d[i] = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 3);
        if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (!v) continue;
      if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 3);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
      }
      d[i] = v;
    }
  }
  return { at: (i) => d[i] / 3 };
}

/** Connected components (4-neighbour) of pixels where mask === value; calls visit(pixels[], touchesEdge). */
function components(mask, value, visit) {
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (seen[s] || mask[s] !== value) continue;
    let top = 0;
    stack[top++] = s;
    seen[s] = 1;
    const px = [];
    let edge = false;
    while (top) {
      const i = stack[--top];
      px.push(i);
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && !seen[j] && mask[j] === value) {
          seen[j] = 1;
          stack[top++] = j;
        }
      }
    }
    visit(px, edge);
  }
}

// ---------- land mask and its outline ----------
const land = new Uint8Array(N);
for (const rings of Object.values(shapes)) fill(land, rings);
const outline = []; // land pixels touching water / abroad, in viewBox units
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (land[i] && (!land[i - 1] || !land[i + 1] || !land[i - W] || !land[i + W])) outline.push([(x + 0.5) / K, (y + 0.5) / K]);
  }
}
const CELL = 4;
const grid = new Map();
for (const p of outline) {
  const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(p);
}
function nearestOutline(p, R) {
  let best = null;
  let bd = R;
  const cx = Math.floor(p[0] / CELL);
  const cy = Math.floor(p[1] / CELL);
  const n = Math.ceil(R / CELL);
  for (let dx = -n; dx <= n; dx++) {
    for (let dy = -n; dy <= n; dy++) {
      for (const q of grid.get(`${cx + dx},${cy + dy}`) || []) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
    }
  }
  return best && { q: best, d: bd };
}

// ---------- ICP: affine correction of the projected polygons onto the map outline ----------
const raw = polysLL.map((poly) => poly.map((ring) => ring.map(project)));
const pts = raw.flat(2);
let A = [1, 0, 0, 0, 1, 0]; // x' = a0 x + a1 y + a2, y' = a3 x + a4 y + a5
const apply = (p) => [A[0] * p[0] + A[1] * p[1] + A[2], A[3] * p[0] + A[4] * p[1] + A[5]];
function solve3(M, v) {
  // Gaussian elimination for a 3×3 system
  const a = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((r, i) => r[3] / a[i][i]);
}
const stats = (R) => {
  const ds = pts.map((p) => nearestOutline(apply(p), R)?.d).filter((d) => d != null).sort((a, b) => a - b);
  return ds.length ? `${ds.length} pts near outline, median ${ds[ds.length >> 1].toFixed(2)}, p90 ${ds[Math.floor(ds.length * 0.9)].toFixed(2)}` : 'no points';
};
log('before ICP:', stats(6));
for (const R of [10, 8, 6, 5, 4, 3, 3, 2.5, 2.5]) {
  let pairs = pts.map((p) => ({ p, m: nearestOutline(apply(p), R) })).filter((x) => x.m);
  pairs.sort((a, b) => a.m.d - b.m.d);
  pairs = pairs.slice(0, Math.floor(pairs.length * 0.8)); // trimmed: ignore the worst 20 %
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const vx = [0, 0, 0];
  const vy = [0, 0, 0];
  for (const { p, m } of pairs) {
    const f = [p[0], p[1], 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) M[r][c] += f[r] * f[c];
      vx[r] += f[r] * m.q[0];
      vy[r] += f[r] * m.q[1];
    }
  }
  A = [...solve3(M, vx), ...solve3(M, vy)];
}
log('after ICP: ', stats(6));
log(`affine: scale ${Math.hypot(A[0], A[3]).toFixed(4)}/${Math.hypot(A[1], A[4]).toFixed(4)}, shift ${A[2].toFixed(1)}, ${A[5].toFixed(1)}`);

// ---------- occupied mask ----------
const occ = new Uint8Array(N);
for (const poly of raw) fill(occ, poly.map((ring) => ring.map(apply))); // each polygon with its holes (even-odd), unioned
// morphological closing (0.5 unit): DeepStateMap cuts large areas into tiles whose shared edges leave hairline seams
{
  const R = 2; // px
  const grown = distanceTo(occ, 1);
  const dil = new Uint8Array(N);
  for (let i = 0; i < N; i++) dil[i] = grown.at(i) <= R ? 1 : 0;
  const toFree = distanceTo(dil, 0);
  for (let i = 0; i < N; i++) occ[i] = toFree.at(i) > R ? 1 : 0;
}
for (const id of regions.occupied2014.regions) fill(occ, shapes[id]); // Crimea and Sevastopol: the map's own shapes
// thin strips along the border / coast that the projected polygons miss
const BAND = 3; // units from the outline
const GROW = 2.5; // how far an occupied area may be grown inside that band
const toAbroad = distanceTo(land, 0);
const toOcc = distanceTo(occ, 1);
for (let i = 0; i < N; i++) {
  if (!land[i]) occ[i] = 0;
  else if (!occ[i] && toAbroad.at(i) <= BAND * K && toOcc.at(i) <= GROW * K) occ[i] = 1;
}
// drop specks, fill pinholes
let dropped = 0;
let filled = 0;
components(occ, 1, (px) => {
  if (px.length < 2 * K * K) {
    for (const i of px) occ[i] = 0;
    dropped++;
  }
});
components(occ, 0, (px, edge) => {
  if (!edge && px.length < 6 * K * K && px.every((i) => land[i])) {
    for (const i of px) occ[i] = 1;
    filled++;
  }
});
log(`cleanup: ${dropped} specks dropped, ${filled} pinholes filled`);

// ---------- trace back to vectors ----------
// Pixel-edge boundary, clockwise around occupied pixels (y down); shared edges never appear.
const O = (x, y) => x >= 0 && y >= 0 && x < W && y < H && occ[y * W + x] === 1;
const L = (x, y) => x >= 0 && y >= 0 && x < W && y < H && land[y * W + x] === 1;
const out = new Map(); // vertex → [edge]
const edges = [];
const addEdge = (x0, y0, x1, y1, front) => {
  const e = { x0, y0, x1, y1, front, used: false };
  edges.push(e);
  const k = y0 * (W + 1) + x0;
  if (!out.has(k)) out.set(k, []);
  out.get(k).push(e);
};
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!O(x, y)) continue;
    if (!O(x, y - 1)) addEdge(x, y, x + 1, y, L(x, y - 1));
    if (!O(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1, L(x + 1, y));
    if (!O(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1, L(x, y + 1));
    if (!O(x - 1, y)) addEdge(x, y + 1, x, y, L(x - 1, y));
  }
}
const loops = [];
for (const e0 of edges) {
  if (e0.used) continue;
  const loop = [];
  let e = e0;
  while (e && !e.used) {
    e.used = true;
    loop.push(e);
    const cands = (out.get(e.y1 * (W + 1) + e.x1) || []).filter((c) => !c.used);
    if (cands.length > 1) {
      // saddle: take the right turn so diagonal neighbours stay separate
      const dx = e.x1 - e.x0;
      const dy = e.y1 - e.y0;
      e = cands.find((c) => c.x1 - c.x0 === -dy && c.y1 - c.y0 === dx) || cands[0];
    } else e = cands[0];
  }
  loops.push(loop);
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let md = 0;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md > tol) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const fmt = (v) => {
  const s = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return (s === '-0' ? '0' : s).replace(/^(-?)0\./, '$1.');
};
function toD(lines, closed) {
  let d = '';
  for (const l of lines) {
    let [px, py] = l[0].map((v) => Math.round(v * 10) / 10);
    d += `M${fmt(px)} ${fmt(py)}`;
    let cmd = '';
    for (const p of l.slice(1, closed ? -1 : undefined)) {
      const [x, y] = p.map((v) => Math.round(v * 10) / 10);
      const dx = x - px;
      const dy = y - py;
      if (!dx && !dy) continue;
      const pair = `${fmt(dx)}${dy < 0 ? '' : ' '}${fmt(dy)}`;
      d += cmd ? (dx < 0 ? pair : ' ' + pair) : 'l' + pair;
      cmd = 'l';
      px = x;
      py = y;
    }
    if (closed) d += 'z';
  }
  return d;
}

/** Douglas–Peucker for a closed ring (first point = last): split at the vertex farthest from the start. */
function simplifyRing(vs, tol) {
  let far = 0;
  let fd = -1;
  vs.forEach((p, i) => {
    const d = Math.hypot(p[0] - vs[0][0], p[1] - vs[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  return [...simplify(vs.slice(0, far + 1), tol).slice(0, -1), ...simplify(vs.slice(far), tol)];
}

const TOL = 0.35; // units
const areaRings = [];
const frontLines = [];
for (const loop of loops) {
  const vs = [[loop[0].x0 / K, loop[0].y0 / K], ...loop.map((e) => [e.x1 / K, e.y1 / K])];
  areaRings.push(simplifyRing(vs, TOL));
  // runs of edges where occupied land meets free land
  if (loop.every((e) => e.front)) {
    frontLines.push(simplifyRing(vs, TOL));
    continue;
  }
  const start = loop.findIndex((e) => !e.front);
  let run = null;
  for (let k = 1; k <= loop.length; k++) {
    const e = loop[(start + k) % loop.length];
    if (e.front) {
      if (!run) run = [[e.x0 / K, e.y0 / K]];
      run.push([e.x1 / K, e.y1 / K]);
    } else if (run) {
      if (run.length > 2 * K) frontLines.push(simplify(run, TOL)); // ignore runs shorter than ~2 units
      run = null;
    }
  }
}
const area = toD(areaRings, true);
const line = toD(frontLines, false);
const asOf = (snapMeta.createdAt || '').slice(0, 10) || null;
const prevFile = P('src/map/occupation.json');
const prevLabel = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')).labelYear : null;
const snapYear = asOf ? +asOf.slice(0, 4) : null;
const labelYear = opt('--label-year') ? +opt('--label-year') : Math.max(prevLabel || 0, snapYear || 0) || null;
const result = {
  source: { uk: 'DeepStateMap', en: 'DeepStateMap', url: 'https://deepstatemap.live' },
  snapshot: snapshotId ? +snapshotId : null,
  asOf,
  labelYear,
  generated: new Date().toISOString().slice(0, 10),
  includes: 'DeepStateMap "occupied", "ORDLO" and "occupied Crimea" polygons; "unknown status" (grey zone) is not included',
  fit: 'projected with regions.json georef, then an affine correction fitted on the state border and coast (ICP)',
  area,
  line,
};
fs.writeFileSync(P('src/map/occupation.json'), JSON.stringify(result, null, 1) + '\n');
log(`occupation as of ${asOf}: area ${areaRings.length} rings (${(area.length / 1024).toFixed(1)} KB), front ${frontLines.length} lines (${(line.length / 1024).toFixed(1)} KB)`);

// debug preview over the map
const svg = fs.readFileSync(P('src/map/ukraine.svg'), 'utf8');
const dbg = `<!doctype html><meta charset="utf-8"><title>Occupation debug</title><style>body{margin:0;background:#fff}svg{width:100vw;height:auto}
.region{fill:#e4e8ec;stroke:#fff;stroke-width:.6}#occupied-2014{display:inline}#occupied-2014 .line{stroke:#06c;stroke-width:1;fill:none}#occupied-2014 .area{fill:none}</style>
${svg.replace('display="none"', '').replace('</svg>', `<path d="${area}" fill="#c33" fill-opacity=".25" fill-rule="evenodd"/><path d="${line}" fill="none" stroke="#a00" stroke-width="1.2"/></svg>`)}`;
fs.writeFileSync(P('.tmp/occupation-debug.html'), dbg);
