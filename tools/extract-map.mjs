#!/usr/bin/env node
// Extracts the region map from the PDF-compatible Illustrator file into:
//   src/map/ukraine.svg   — region shapes (ids = ISO 3166-2:UA) + optional 2020 occupation layer
//   src/map/regions.json  — per-region geometry: anchor (pole of inaccessibility), inscribed radius,
//                           label point, capital point, bbox; plus the lat/lon → SVG georeference
//   .tmp/map-debug.html   — visual check of ids and anchors
//
// Usage: node tools/extract-map.mjs maps/_UKRAINE_2020.ai
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdfDoc, interpretPage } from './lib/pdf.mjs';
import { flatten, area, centroid, bbox, pointInPolygon, signedDist, polylabel, fitPoly2, evalPoly2 } from './lib/geom.mjs';
import { REGIONS, BY_ID, matchRegion } from '../src/map/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || path.join(ROOT, 'maps/_UKRAINE_2020.ai');
const WIDTH = 1000; // viewBox width
const PAD = 40; // padding around the country, in page points

// Layer names in the AI file
const L = {
  regions: 'Ukraine',
  fullDonbas: 'Before ORDLO objects',
  ordloLine: 'ORDLO line',
  regionLabels: 'regions_UKR',
  cityLabels: 'cities_UKR',
  cityDots: 'сities_dots_in_dots', // note: starts with a Cyrillic "с" in the source file
};

// Oblast-centre labels in the cities layer → region id
const CITY_LABELS = {
  Луцьк: 'UA-07', Рівне: 'UA-56', Львів: 'UA-46', Ужгород: 'UA-21', Франківськ: 'UA-26', Тернопіль: 'UA-61',
  Чернівці: 'UA-77', Хмельницький: 'UA-68', Житомир: 'UA-18', Вінниця: 'UA-05', КИЇВ: 'UA-30', Черкаси: 'UA-71',
  Кропивницький: 'UA-35', Миколаїв: 'UA-48', Одеса: 'UA-51', Херсон: 'UA-65', Сімферополь: 'UA-43',
  Запоріжжя: 'UA-23', Дніпропетровськ: 'UA-12', Донецьк: 'UA-14', Луганськ: 'UA-09', Харків: 'UA-63',
  Полтава: 'UA-53', Суми: 'UA-59', Чернігів: 'UA-74',
};

// City-regions without their own polygon in the source: drawn as circles of (roughly) true area.
const CITY_AREA_KM2 = { 'UA-30': 839, 'UA-40': 864 };
const CITY_PARENT = { 'UA-30': 'UA-32', 'UA-40': 'UA-43' };

// Islands and spits drawn as separate shapes. Nearest-shape logic gets several wrong
// (e.g. Kinburn Spit touches Kherson Oblast but belongs to Mykolaiv), so match by coordinates first.
const KNOWN_ISLANDS = [
  { name: 'Zmiinyi Island', at: [45.255, 30.204], id: 'UA-51' },
  { name: 'Kinburn Spit', at: [46.56, 31.6], id: 'UA-48' },
  { name: 'Berezan Island', at: [46.6, 31.41], id: 'UA-48' },
  { name: 'Tendra Spit', at: [46.27, 31.7], id: 'UA-65' },
  { name: 'Dzharylhach Island', at: [46.02, 32.95], id: 'UA-65' },
  { name: 'Arabat Spit (north)', at: [46.1, 34.88], id: 'UA-65' },
  { name: 'Biriuchyi Island', at: [46.22, 35.25], id: 'UA-23' },
];

// Fixes on top of the automatic glyph anchors and the source map's label points.
//   cityClearance — extra room (viewBox units) kept around a city circle inside the region when placing its glyph
//   label         — [lat, lon] for the name when no glyph is shown
//   labelShift    — [dx, dy] (viewBox units) added to the source map's label point
//   labelAtGlyph  — 'above' | 'below': without a glyph, put the name where it sits on glyph maps
//   glyphLabel    — 'above' puts the name above the glyph instead of below it
//   anchor        — [x, y] (viewBox units) for the glyph instead of the pole of inaccessibility (must be inside)
//   glyphLabelDy  — extra distance (viewBox units) between the glyph and the name on glyph maps
//   labelLines    — without a glyph, move the name (and its number) by this many text lines (−1 = one line up);
//                   in lines rather than units so the step matches the text at every map width
//   glyphView     — per glyph view (layer type), overriding the above: { bubbles: { lines: -2 } } lifts the name by
//                   two text lines on the bubble map only; { bars: { label: 'below', dy: 0 } } puts it under the
//                   columns with no extra gap; { bars: { move: -2 } } moves the columns and their name together by
//                   two text lines (+ = down)
const COLUMNS = (o) => ({ bars: o, stacked: o }); // the same placement on both column views
// glyph kinds: bubbles, bars, stacked, pies, radar, "progress" (a radial layer with one value), "radial" (radial bars)
const UP2 = { move: -2 }; // a glyph with its name and number two text lines higher
const PLACEMENT = {
  // Kyiv Oblast wraps around the Kyiv circle: keep its glyph clear of the city's glyph and name,
  // and put its own name far south, away from the circle and from a chart drawn on Kyiv.
  // The name is also moved left, towards the middle of the oblast at that height. Columns: two lines higher.
  'UA-32': { cityClearance: 42, label: [49.72, 30.62], labelShift: [-18, 0], glyphView: COLUMNS({ move: -2 }) },
  // "Тернопільська" and "Хмельницька" run into each other at the same height: on every map, Ternopil's name goes
  // above the glyph spot and Khmelnytskyi's below it, as on the glyph maps.
  // Columns (bars, stacked) grow upwards, so there the name goes under them at the usual gap, and the columns with
  // their name sit one line lower than Khmelnytskyi's so the two names do not meet.
  'UA-61': { labelAtGlyph: 'above', glyphLabel: 'above', glyphView: COLUMNS({ label: 'below', move: 1 }) },
  'UA-68': { labelAtGlyph: 'below', labelLines: -2 },
  // "Закарпатська" and "Івано-Франківська" sit side by side at one height: drop the first, lift the second,
  // and on glyph maps put Zakarpattia's name above its glyph (IF's stays below); on bars / stacked under the columns
  // at the usual gap, the columns with their name a line and a half lower than IF's (whose name starts just right of it)
  'UA-21': { labelShift: [-6, 18], glyphLabel: 'above', glyphView: COLUMNS({ label: 'below', move: 1.5 }) },
  'UA-26': { labelShift: [4, -18] },
  // keeps "Вінницька" clear of "Хмельницька" on narrow maps; then one text line up, like its neighbour
  'UA-05': { labelShift: [0, 10], labelLines: -1, glyphView: { bubbles: UP2, radar: UP2 } },
  // the Chernivtsi glyph sat under the end of "Івано-Франківська" (written below IF's glyph): move it east,
  // as far as the narrowing oblast allows while staying clear of the Khmelnytskyi and Vinnytsia glyphs
  // and its name a little lower, clear of that IF name on narrow maps (under columns: the usual gap, like the others)
  'UA-77': { anchor: [270, 319], glyphLabelDy: 8, glyphView: COLUMNS({ dy: 0 }) },
  // the source map writes "Сумська" near the oblast's western border: centre it across the oblast instead
  'UA-59': { labelShift: [26, 0], glyphView: { bubbles: UP2, pies: UP2, progress: UP2, radar: UP2 } },
  // bubble map: these glyphs (with names and numbers) two lines higher
  'UA-14': { glyphView: { bubbles: UP2 } },
  'UA-65': { glyphView: { bubbles: UP2 } },
  // names (and numbers) sitting low in their oblasts: one text line up (Kharkiv and Khmelnytskyi: two)
  'UA-63': { labelLines: -2 },
  // Crimea: on bubbles, pies and progress rings the name sits two lines up (on the glyph) and the glyph with its name
  // two lines higher still; on radial bars and the radar the glyph goes two lines up with its name under it
  'UA-43': {
    labelLines: -1,
    glyphView: { ...COLUMNS(UP2), ...Object.fromEntries(['bubbles', 'pies', 'progress'].map((k) => [k, { lines: -2, move: -2 }])), radial: UP2, radar: UP2 },
  },
  'UA-71': { labelLines: -1 },
  // on bubbles and progress rings "Львівська" sits two lines up, close above "Закарпатська"; on pies, radial bars
  // and the radar the glyph goes up instead, so it no longer sits on the name
  'UA-46': { glyphView: { bubbles: { lines: -2 }, progress: { lines: -2 }, pies: UP2, radial: UP2, radar: UP2 } },
  'UA-53': { labelLines: -1 },
  'UA-07': { labelLines: -1 },
  'UA-35': { labelLines: -1 },
  'UA-23': { labelLines: -1, glyphView: { bubbles: UP2 } },
  // pies: the Mykolaiv pie and its name a text size and a half to the left, towards the middle of the oblast (more
  // would meet "Одеська" on narrow maps); on bubbles too (1.85: between "Одеська" and the raised "Херсонська")
  'UA-48': { labelLines: -1, glyphView: { pies: { move: [-1.5, 0] }, bubbles: { move: [-1.85, 0] }, radar: { move: [-1.5, 0] } } },
  // "Дніпропетровська" also to the right (towards the middle of the oblast), "Чернігівська" to the left
  'UA-12': { labelShift: [32, 0], labelLines: -1 },
  'UA-74': { labelShift: [-20, 0], glyphView: { pies: UP2 } },
};
const GLYPH_HALF = 29; // half of the default glyph box (options.glyphSize 58); map.js puts names 3 above / 7 below it

const log = (...a) => console.log(...a);
const isPink = (c) => c && Math.abs(c[0] - 0.788) < 0.02 && Math.abs(c[1] - 0.694) < 0.02;

// ---------- read ----------
const doc = new PdfDoc(fs.readFileSync(src));
const page = doc.pages()[0];
const { paths, texts } = interpretPage(doc, page);
const inLayer = (name) => (p) => p.outer === name;

const makeShape = (p, i) => {
  const polys = p.subpaths.map((s) => flatten(s));
  const a = polys.reduce((s, poly) => s + area(poly), 0);
  return { i, src: p, polys, area: a, pink: isPink(p.fill), layer: p.outer };
};
const shapes = paths.filter((p) => p.fill && p.outer === L.regions).map(makeShape);
// Whole Donetsk/Luhansk outlines. They are a rougher drawing (up to ±20 pt off the neighbouring oblasts),
// so they are only used to find which pieces of the precise "Ukraine" layer belong to each of the two oblasts.
const donbasOutlines = paths.filter((p) => p.fill && p.outer === L.fullDonbas).map(makeShape);

/** Union of pieces that touch along identical edges (e.g. free part + ORDLO part of an oblast):
 *  edges walked in opposite directions by two pieces cancel out, the rest are stitched into closed loops. */
function unionTouching(pieces, eps = 0.01) {
  const near = (p, q) => Math.abs(p[0] - q[0]) < eps && Math.abs(p[1] - q[1]) < eps;
  const segs = [];
  for (const sp of pieces.flatMap((s) => s.src.subpaths)) {
    let cur = null;
    let start = null;
    for (const g of sp.segs) {
      if (g.cmd === 'M') {
        cur = start = g.pts[0];
        continue;
      }
      segs.push({ cmd: g.cmd, a: cur, pts: g.pts, b: g.pts[g.pts.length - 1] });
      cur = g.pts[g.pts.length - 1];
    }
    if (start && !near(cur, start)) segs.push({ cmd: 'L', a: cur, pts: [start], b: start });
  }
  const dead = new Set();
  for (let i = 0; i < segs.length; i++) {
    if (dead.has(i)) continue;
    for (let j = i + 1; j < segs.length; j++) {
      if (!dead.has(j) && near(segs[i].a, segs[j].b) && near(segs[i].b, segs[j].a)) {
        dead.add(i).add(j);
        break;
      }
    }
  }
  const rest = segs.filter((_, i) => !dead.has(i));
  const left = new Set(rest.keys());
  const subpaths = [];
  while (left.size) {
    const first = left.values().next().value;
    left.delete(first);
    const loop = [rest[first]];
    while (!near(loop[loop.length - 1].b, loop[0].a)) {
      const end = loop[loop.length - 1].b;
      const next = [...left].find((k) => near(rest[k].a, end));
      if (next == null) throw new Error('unionTouching: pieces do not share exact edges');
      left.delete(next);
      loop.push(rest[next]);
    }
    subpaths.push({ closed: true, segs: [{ cmd: 'M', pts: [loop[0].a] }, ...loop.map((s) => ({ cmd: s.cmd, pts: s.pts }))] });
  }
  const src = { ...pieces[0].src, subpaths };
  return { ...makeShape(src, -1), cancelled: dead.size / 2 };
}

// Region label points (centre of the text run)
const labelPts = texts
  .filter((t) => t.outer === L.regionLabels)
  .map((t) => ({ text: t.text.trim(), id: matchRegion(t.text.trim()), pt: [t.x + t.adv / 2, t.y + t.size * 0.3] }))
  .filter((l) => l.id);

// ---------- georeference (lat/lon → page) from oblast-centre dots ----------
const dots = [];
for (const p of paths.filter(inLayer(L.cityDots))) {
  const [x0, y0, x1, y1] = bbox(p.subpaths.flatMap((s) => s.segs.flatMap((g) => g.pts)));
  const c = [(x0 + x1) / 2, (y0 + y1) / 2];
  if (!dots.some((d) => Math.hypot(d[0] - c[0], d[1] - c[1]) < 5)) dots.push(c);
}
const cityLabels = texts.filter((t) => t.outer === L.cityLabels && CITY_LABELS[t.text.trim()]);
const capitals = {};
for (const d of dots) {
  const near = cityLabels
    .map((t) => ({ id: CITY_LABELS[t.text.trim()], dist: Math.hypot(t.x + t.adv / 2 - d[0], t.y - d[1]) }))
    .sort((a, b) => a.dist - b.dist)[0];
  if (near && near.dist < 600 && !capitals[near.id]) capitals[near.id] = d;
}
const LON0 = 31;
const LAT0 = 48.5;
const samples = Object.entries(capitals).map(([id, pt]) => ({ id, u: BY_ID[id].city[1] - LON0, v: BY_ID[id].city[0] - LAT0, pt }));
const gx = fitPoly2(samples.map((s) => ({ u: s.u, v: s.v, z: s.pt[0] })));
const gy = fitPoly2(samples.map((s) => ({ u: s.u, v: s.v, z: s.pt[1] })));
const geoToPage = ([lat, lon]) => [evalPoly2(gx, lon - LON0, lat - LAT0), evalPoly2(gy, lon - LON0, lat - LAT0)];
const resid = samples.map((s) => Math.hypot(...geoToPage(BY_ID[s.id].city).map((v, k) => v - s.pt[k])));
log(`georef: ${samples.length} cities, residual mean ${(resid.reduce((a, b) => a + b, 0) / resid.length).toFixed(1)} pt, max ${Math.max(...resid).toFixed(1)} pt`);

// ---------- assign shapes to regions ----------
const regionShape = {};
for (const l of labelPts) {
  const hits = shapes.filter((s) => s.polys.some((poly) => pointInPolygon(l.pt, poly)));
  if (!hits.length) throw new Error('No shape under label ' + l.text);
  const best = hits.reduce((a, b) => (b.area > a.area ? b : a));
  regionShape[l.id] = { shape: best, label: l.pt, extra: [] };
}
// Donetsk and Luhansk are split into a free and an ORDLO-2020 piece: join them back into one shape.
for (const outline of donbasOutlines) {
  const l = labelPts.find((x) => outline.polys.some((poly) => pointInPolygon(x.pt, poly)));
  if (!l) throw new Error('No region label inside a Donbas outline');
  const pieces = shapes.filter((s) => outline.polys.some((poly) => pointInPolygon(centroid(s.polys.reduce((a, b) => (area(b) > area(a) ? b : a))), poly)));
  const merged = unionTouching(pieces);
  const loss = Math.abs(merged.area - pieces.reduce((a, s) => a + s.area, 0)) / merged.area;
  if (merged.src.subpaths.length !== 1 || loss > 1e-6) throw new Error(`${l.id}: union of ${pieces.length} pieces gave ${merged.src.subpaths.length} loops, area off by ${(loss * 100).toFixed(3)}%`);
  regionShape[l.id].shape = merged;
  log(`${l.id} ${BY_ID[l.id].short.en}: joined ${pieces.length} pieces (${merged.cancelled} shared edges)`);
}
const used = new Set(Object.values(regionShape).map((r) => r.shape));
const insideRegion = (pt) => Object.entries(regionShape).find(([, r]) => r.shape.polys.some((poly) => pointInPolygon(pt, poly)));

const ordloAreas = [];
for (const s of shapes) {
  if (used.has(s) || s.layer !== L.regions) continue;
  const c = centroid(s.polys.reduce((a, b) => (area(b) > area(a) ? b : a)));
  const host = insideRegion(c);
  if (s.pink) {
    ordloAreas.push(s); // occupied parts of Donetsk/Luhansk, contact line as it stood until 2022
  } else if (host) {
    // free parts of Donetsk/Luhansk: covered by the whole outline → drop
  } else {
    // island / spit → known feature by coordinates, else nearest region
    const known = KNOWN_ISLANDS.map((k) => ({ ...k, d: Math.hypot(...geoToPage(k.at).map((v, j) => v - c[j])) })).sort((a, b) => a.d - b.d)[0];
    let best = null;
    if (known && known.d < 250) best = { id: known.id, why: known.name };
    else {
      for (const [id, r] of Object.entries(regionShape)) {
        const d = -signedDist(c, r.shape.polys);
        if (!best || d < best.d) best = { id, d, why: 'nearest region' };
      }
    }
    regionShape[best.id].extra.push(s);
    log(`island #${s.i} (${s.area.toFixed(0)} pt²) → ${best.id} ${BY_ID[best.id].short.en} (${best.why})`);
  }
}
log("occupied areas (since 2014):", ordloAreas.length);

// ---------- page → SVG transform ----------
const allPts = Object.values(regionShape).flatMap((r) => [...r.shape.polys, ...r.extra.flatMap((e) => e.polys)].flat());
const [bx0, by0, bx1, by1] = bbox(allPts);
const S = WIDTH / (bx1 - bx0 + 2 * PAD);
const HEIGHT = Math.round((by1 - by0 + 2 * PAD) * S);
const T = ([x, y]) => [(x - bx0 + PAD) * S, (by1 - y + PAD) * S];
const TP = (polys) => polys.map((poly) => poly.map(T));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// km → SVG units, measured between Lviv and Kharkiv
const hav = ([la1, lo1], [la2, lo2]) => {
  const R = 6371;
  const rad = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const unitsPerKm = Math.hypot(...T(geoToPage(BY_ID['UA-46'].city)).map((v, k) => v - T(geoToPage(BY_ID['UA-63'].city))[k])) / hav(BY_ID['UA-46'].city, BY_ID['UA-63'].city);

// ---------- path serialization ----------
function fmt(n) {
  let s = r1(n).toFixed(1).replace(/\.0$/, '');
  if (s === '-0') s = '0';
  return s.replace(/^(-?)0\./, '$1.');
}
function joinNums(nums) {
  let out = '';
  for (const n of nums) {
    const s = fmt(n);
    if (out && !s.startsWith('-') && !(s.startsWith('.') && /\.\d*$/.test(out.split(/[ -]/).pop()))) out += ' ';
    out += s;
  }
  return out;
}
function toPathD(subpaths) {
  let d = '';
  for (const sub of subpaths) {
    let cur = null;
    let lastCmd = '';
    for (const seg of sub.segs) {
      const pts = seg.pts.map((p) => T(p).map(r1));
      if (seg.cmd === 'M') {
        d += 'M' + joinNums(pts[0]);
        cur = pts[0];
        lastCmd = 'M';
        continue;
      }
      const rel = pts.flatMap((p) => [r1(p[0] - cur[0]), r1(p[1] - cur[1])]);
      const end = pts[pts.length - 1];
      if (seg.cmd === 'L' && rel[0] === 0 && rel[1] === 0) continue;
      const c = seg.cmd === 'L' ? 'l' : 'c';
      d += (c === lastCmd ? (rel[0] < 0 ? '' : ' ') : c) + joinNums(rel);
      lastCmd = c;
      cur = end;
    }
    if (sub.closed) {
      d += 'z';
      lastCmd = 'z';
    }
  }
  return d;
}

// ---------- city-regions (circles) ----------
const circles = {};
for (const [id, km2] of Object.entries(CITY_AREA_KM2)) {
  const r = Math.max(7, Math.sqrt(km2 / Math.PI) * unitsPerKm);
  const parent = regionShape[CITY_PARENT[id]];
  const parentPolys = TP(parent.shape.polys);
  const city = T(capitals[id] || geoToPage(BY_ID[id].city));
  // nudge the circle inland so it sits inside its parent region, staying close to the real city
  let best = { pt: city, score: -Infinity };
  for (let dx = -2 * r; dx <= 2 * r; dx += r / 6) {
    for (let dy = -2 * r; dy <= 2 * r; dy += r / 6) {
      const p = [city[0] + dx, city[1] + dy];
      const score = Math.min(signedDist(p, parentPolys), r * 1.15) - Math.hypot(dx, dy) * 0.05;
      if (score > best.score) best = { pt: p, score };
    }
  }
  circles[id] = { c: best.pt.map(r1), r: r1(r), city: city.map(r1) };
  log(`${id} ${BY_ID[id].short.en}: circle r=${r.toFixed(1)} at ${best.pt.map(r1)} (city ${city.map(r1)})`);
}

// ---------- per-region geometry ----------
const geo = {};
for (const reg of REGIONS) {
  if (circles[reg.id]) {
    const c = circles[reg.id];
    geo[reg.id] = { shape: 'circle', anchor: c.c, r: c.r, label: c.c, capital: c.city, bbox: [c.c[0] - c.r, c.c[1] - c.r, c.c[0] + c.r, c.c[1] + c.r].map(r1) };
    continue;
  }
  const rs = regionShape[reg.id];
  if (!rs) throw new Error('Region without shape: ' + reg.id);
  const main = TP(rs.shape.polys);
  const fix = PLACEMENT[reg.id] || {};
  const obstacles = Object.entries(CITY_PARENT)
    .filter(([, p]) => p === reg.id)
    .map(([cid]) => ({ c: circles[cid].c, r: circles[cid].r + (fix.cityClearance ?? 3) }));
  const pl = polylabel(main, 0.2, obstacles);
  if (fix.anchor) {
    if (!main.some((poly) => pointInPolygon(fix.anchor, poly))) throw new Error(`${reg.id}: anchor ${fix.anchor} is outside the region`);
    pl.pt = fix.anchor;
    pl.r = signedDist(fix.anchor, main);
  }
  let label = T(rs.label);
  if (fix.label) label = T(geoToPage(fix.label));
  if (fix.labelShift) label = [label[0] + fix.labelShift[0], label[1] + fix.labelShift[1]];
  if (fix.labelAtGlyph === 'above') label = [pl.pt[0], pl.pt[1] - GLYPH_HALF - 3];
  if (fix.labelAtGlyph === 'below') label = [pl.pt[0], pl.pt[1] + GLYPH_HALF + 7];
  if (!main.some((poly) => pointInPolygon(label, poly))) throw new Error(`${reg.id}: label point ${label.map(r1)} is outside the region`);
  geo[reg.id] = {
    shape: 'path',
    anchor: pl.pt.map(r1),
    r: r1(pl.r),
    label: label.map(r1),
    ...(fix.glyphLabel ? { glyphLabel: fix.glyphLabel } : {}),
    ...(fix.glyphLabelDy ? { glyphLabelDy: fix.glyphLabelDy } : {}),
    ...(fix.labelLines ? { labelLines: fix.labelLines } : {}),
    ...(fix.glyphView ? { glyphView: fix.glyphView } : {}),
    capital: capitals[reg.id] ? T(capitals[reg.id]).map(r1) : null,
    bbox: bbox([...main, ...TP(rs.extra.flatMap((e) => e.polys))].flat()).map(r1),
  };
}

// ---------- write SVG ----------
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" class="ua-map">\n`;
svg += `<!-- Generated by tools/extract-map.mjs from ${path.basename(src)}. Do not edit by hand. -->\n`;
svg += `<g id="regions" fill="#c9cdd2" stroke="#fff" stroke-width=".6" stroke-linejoin="round">\n`;
// each shape carries its ISO id plus the region's own KOATUU and first-level KATOTTG codes (from the catalog)
const codes = (reg) => `data-koatuu="${reg.koatuu}" data-katottg="${reg.katottg}"`;
for (const reg of REGIONS) {
  if (circles[reg.id]) continue;
  const rs = regionShape[reg.id];
  const d = toPathD([...rs.shape.src.subpaths, ...rs.extra.flatMap((e) => e.src.subpaths)]);
  svg += `<path id="${reg.id}" class="region" ${codes(reg)} d="${d}"/>\n`;
}
for (const reg of REGIONS) {
  if (!circles[reg.id]) continue;
  const c = circles[reg.id];
  svg += `<circle id="${reg.id}" class="region region--city" ${codes(reg)} cx="${c.c[0]}" cy="${c.c[1]}" r="${c.r}"/>\n`;
}
svg += `</g>\n<g id="occupied-2014" fill="none" stroke="#b33" stroke-width="1.2" display="none">\n`;
for (const s of ordloAreas) svg += `<path class="area" d="${toPathD(s.src.subpaths)}"/>\n`;
const line = paths.find(inLayer(L.ordloLine));
if (line) svg += `<path class="line" d="${toPathD(line.subpaths)}"/>\n`;
svg += `</g>\n</svg>\n`;

const outDir = path.join(ROOT, 'src/map');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'ukraine.svg'), svg);

// georef in SVG units: x = f(lon - lon0, lat - lat0)
const svgSamples = samples.map((s) => ({ ...s, svg: T(s.pt) }));
const sgx = fitPoly2(svgSamples.map((s) => ({ u: s.u, v: s.v, z: s.svg[0] })));
const sgy = fitPoly2(svgSamples.map((s) => ({ u: s.u, v: s.v, z: s.svg[1] })));
const regionsJson = {
  source: path.basename(src),
  viewBox: [0, 0, WIDTH, HEIGHT],
  unitsPerKm: r2(unitsPerKm),
  georef: { lon0: LON0, lat0: LAT0, x: sgx.map((v) => +v.toPrecision(8)), y: sgy.map((v) => +v.toPrecision(8)) },
  occupied2014: { regions: ["UA-43", "UA-40"], note: "Crimea, Sevastopol and the ORDLO areas, occupied since 2014; contact line as it stood until 2022 (from the 2020 source map)" },
  regions: geo,
};
fs.writeFileSync(path.join(outDir, 'regions.json'), JSON.stringify(regionsJson, null, 1) + '\n');

// ---------- debug preview ----------
const dbg = `<!doctype html><meta charset="utf-8"><title>Map debug</title>
<style>body{margin:0;font:12px system-ui;background:#fff}svg{width:100vw;height:auto}
.region{fill:#dfe3e8;stroke:#fff}.region:hover{fill:#9ec5fe}#occupied-2014{display:inline}
text{font-size:9px;text-anchor:middle;fill:#222;pointer-events:none}.cap{fill:#d00}.lab{fill:#06c}</style>
${svg.replace('display="none"', '').replace(/<svg[^>]*>/, (m) => m.replace('class="ua-map"', 'class="ua-map" id="m"'))}
<script>const g=${JSON.stringify(geo)};const s=document.getElementById('m');const ns='http://www.w3.org/2000/svg';
for(const [id,r] of Object.entries(g)){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',r.anchor[0]);c.setAttribute('cy',r.anchor[1]);c.setAttribute('r',r.r);c.setAttribute('fill','none');c.setAttribute('stroke','#888');c.setAttribute('stroke-dasharray','2 2');s.appendChild(c);
const t=document.createElementNS(ns,'text');t.setAttribute('x',r.anchor[0]);t.setAttribute('y',r.anchor[1]+3);t.textContent=id;s.appendChild(t);
for(const [k,cls] of [['capital','cap'],['label','lab']]) if(r[k]){const d=document.createElementNS(ns,'circle');d.setAttribute('cx',r[k][0]);d.setAttribute('cy',r[k][1]);d.setAttribute('r',2);d.setAttribute('class',cls);s.appendChild(d);}}
</script>`;
fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.tmp/map-debug.html'), dbg);

log(`regions: ${Object.keys(geo).length}, viewBox 0 0 ${WIDTH} ${HEIGHT}, svg ${(svg.length / 1024).toFixed(1)} KB`);
