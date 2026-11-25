// Integrity of the generated map: src/map/ukraine.svg ↔ src/map/regions.json ↔ catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REGION_IDS, BY_ID } from '../src/map/catalog.js';

const svg = fs.readFileSync(new URL('../src/map/ukraine.svg', import.meta.url), 'utf8');
const geo = JSON.parse(fs.readFileSync(new URL('../src/map/regions.json', import.meta.url), 'utf8'));

/** Parses the path syntax the extractor writes (M absolute; l, c relative; z) into polygons. */
function polygons(d) {
  const polys = [];
  let cur = null;
  let pt = [0, 0];
  const re = /([MlcLCz])([^MlcLCz]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const nums = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    if (m[1] === 'M') {
      pt = [nums[0], nums[1]];
      cur = [pt];
      polys.push(cur);
    } else if (m[1] === 'l') {
      for (let i = 0; i < nums.length; i += 2) cur.push((pt = [pt[0] + nums[i], pt[1] + nums[i + 1]]));
    } else if (m[1] === 'c') {
      for (let i = 0; i < nums.length; i += 6) cur.push((pt = [pt[0] + nums[i + 4], pt[1] + nums[i + 5]]));
    }
  }
  return polys;
}
const inside = ([x, y], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

test('svg has one region element per catalog id', () => {
  const ids = [...svg.matchAll(/<(?:path|circle) id="(UA-\d\d)"/g)].map((m) => m[1]);
  assert.deepEqual([...ids].sort(), [...REGION_IDS].sort());
});

test('every region shape in the svg carries the catalog KOATUU and KATOTTG codes', () => {
  const tags = [...svg.matchAll(/<(?:path|circle) id="(UA-\d\d)"([^>]*)>/g)];
  assert.equal(tags.length, 27);
  for (const [, id, rest] of tags) {
    assert.ok(rest.includes(`data-koatuu="${BY_ID[id].koatuu}"`), id);
    assert.ok(rest.includes(`data-katottg="${BY_ID[id].katottg}"`), id);
  }
});

test('regions.json covers every region with anchor, radius and bbox', () => {
  assert.deepEqual(Object.keys(geo.regions).sort(), [...REGION_IDS].sort());
  const [, , W, H] = geo.viewBox;
  for (const [id, r] of Object.entries(geo.regions)) {
    assert.ok(r.r > 0, id);
    assert.ok(r.anchor[0] > 0 && r.anchor[0] < W && r.anchor[1] > 0 && r.anchor[1] < H, id);
  }
});

test('every path anchor and label point lies inside its own region', () => {
  for (const m of svg.matchAll(/<path id="(UA-\d\d)" class="region"[^>]*\sd="([^"]+)"/g)) {
    const [, id, d] = m;
    const polys = polygons(d);
    const r = geo.regions[id];
    assert.ok(polys.some((p) => inside(r.anchor, p)), `${id} anchor`);
    assert.ok(polys.some((p) => inside(r.label, p)), `${id} label`);
  }
});

test('georeference places capitals near their dots', () => {
  const { lon0, lat0, x, y } = geo.georef;
  const f = (c, u, v) => c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v;
  // Lviv 49.839, 24.029
  const p = [f(x, 24.029 - lon0, 49.839 - lat0), f(y, 24.029 - lon0, 49.839 - lat0)];
  const cap = geo.regions['UA-46'].capital;
  assert.ok(Math.hypot(p[0] - cap[0], p[1] - cap[1]) < 8, `Lviv off by ${Math.hypot(p[0] - cap[0], p[1] - cap[1])}`);
});

test('occupation layer is present and hidden by default', () => {
  assert.match(svg, /<g id="occupied-2014"[^>]*display="none"/);
  assert.equal([...svg.matchAll(/class="area"/g)].length, 2);
  assert.match(svg, /class="line"/);
});

test('Kyiv Oblast glyph and name keep clear of the Kyiv circle', () => {
  const kyiv = geo.regions['UA-30'];
  const obl = geo.regions['UA-32'];
  const glyph = 58; // default glyph box
  assert.ok(Math.hypot(obl.anchor[0] - kyiv.anchor[0], obl.anchor[1] - kyiv.anchor[1]) > glyph, 'glyphs overlap');
  assert.ok(obl.label[1] - kyiv.anchor[1] > kyiv.r + 30, 'name too close to the circle');
  assert.equal(geo.regions['UA-61'].glyphLabel, 'above');
});

test('current occupation snapshot is dated, sourced and drawable', async () => {
  const occ = JSON.parse(fs.readFileSync(new URL('../src/map/occupation.json', import.meta.url), 'utf8'));
  assert.match(occ.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(occ.labelYear >= +occ.asOf.slice(0, 4), 'toggle year older than the data');
  assert.equal(occ.source.url, 'https://deepstatemap.live');
  const { parsePath } = await import('../tools/lib/svgpath.mjs');
  const area = parsePath(occ.area);
  const line = parsePath(occ.line);
  assert.ok(area.length > 0 && line.length > 0);
  const [, , W, H] = geo.viewBox;
  for (const p of [...area, ...line].flat()) assert.ok(p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H, `point outside the map: ${p}`);
  // Crimea is occupied in full: its anchor lies inside the area
  const inside = ([x, y], poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const hits = (pt) => area.filter((r) => inside(pt, r)).length % 2 === 1; // even-odd
  assert.ok(hits(geo.regions['UA-43'].anchor), 'Crimea not covered');
  assert.ok(!hits(geo.regions['UA-46'].anchor), 'Lviv covered');
});

test('svg path reader: relative commands, implicit repeats, curves', async () => {
  const { parsePath } = await import('../tools/lib/svgpath.mjs');
  const [r] = parsePath('M10 10l5 0 0 5-5 0z');
  assert.deepEqual(r, [[10, 10], [15, 10], [15, 15], [10, 15]]);
  const [c] = parsePath('M0 0c0 10 10 10 10 0z', 4);
  assert.deepEqual(c.at(-1), [10, 0]);
  assert.ok(c[2][1] > 7); // the curve bulges towards +y
});
