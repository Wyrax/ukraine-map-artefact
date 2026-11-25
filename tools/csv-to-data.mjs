#!/usr/bin/env node
// CSV → canonical data.json.
//
// Long format (one value per row):   region, series, period, value     (series/period optional)
// Wide format (one row per region):  region, [period], <series 1>, <series 2>, ...
// Column names are detected in Ukrainian or English (регіон/область/region, період/дата/period,
// серія/показник/series, значення/кількість/value) or set with --region/--period/--series/--value.
//
//   node tools/csv-to-data.mjs input.csv --out artefacts/<slug>/data.json [--unit "шт."] [--title "…"]
//        [--source "…"] [--updated 2026-11-24] [--delimiter ";"] [--allow-unmatched]
//
// Region names may be in any common spelling ("Вінницька обл.", "м. Київ", "Kyiv Oblast") or KOATUU / KATOTTG
// codes at any level (0510100000, UA05020110010028819, 05020110010028819 — see codePrefix in catalog.js); the
// region column is found by name (регіон, область, koatuu, коатуу, katottg, катоттг, код…) or set with --region.
// Unmatched names are listed and fail the run unless --allow-unmatched is given.
import fs from 'node:fs';
import path from 'node:path';
import { matchRegion } from '../src/map/catalog.js';
import { prettyJSON } from './lib/pretty-json.mjs';

const args = process.argv.slice(2);
const opt = (name, d = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--allow-unmatched'].includes(args[i - 1])));
if (!input) {
  console.error('Usage: node tools/csv-to-data.mjs input.csv --out artefacts/<slug>/data.json [--unit …] [--title …]');
  process.exit(1);
}

let text = fs.readFileSync(input, 'utf8').replace(/^﻿/, '');
const delim = opt('--delimiter') ?? [';', '\t', ','].map((d) => [d, (text.split('\n')[0].match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];

export function parseCSV(src, d) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const num = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[\s  ]/g, '').replace(',', '.').replace(/%$/, '');
  if (t === '' || t === '-' || t === '—') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '' };
const slug = (s) =>
  String(s)
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'value';

const rows = parseCSV(text, delim);
const header = rows.shift().map((h) => h.trim());
const find = (flag, re) => {
  const forced = opt(flag);
  if (forced) {
    const i = header.indexOf(forced);
    if (i < 0) throw new Error(`Column "${forced}" not found. Columns: ${header.join(', ')}`);
    return i;
  }
  return header.findIndex((h) => re.test(h.toLowerCase()));
};
// the region column: a name or a KOATUU / KATOTTG code; a bare "код" / "code" column only when there is no better one
const REGION_COLS = /^(регіон|область|region|oblast|адмінодиниця|назва регіону|region_name|region_id|region_code|код регіону|koatuu|коатуу|код коатуу|katottg|катоттг|катотг|код катоттг)$/;
const iRegion = ((i) => (i >= 0 ? i : find('--region', /^(код|code)$/)))(find('--region', REGION_COLS));
const iPeriod = find('--period', /^(період|дата|місяць|рік|квартал|period|date|month|year|quarter)$/);
const iSeries = find('--series', /^(серія|показник|середовище|категорія|series|metric|environment|env|category)$/);
const iValue = find('--value', /^(значення|кількість|к-сть|сума|value|count|total|amount)$/);
if (iRegion < 0) throw new Error(`No region column found. Columns: ${header.join(', ')} (use --region "<name>")`);

const values = [];
const series = new Map();
const periods = [];
const unmatched = new Map();
const addPeriod = (p) => {
  if (p != null && p !== '' && !periods.includes(p)) periods.push(p);
};
const isLong = iValue >= 0;

for (const r of rows) {
  const name = r[iRegion]?.trim();
  if (!name) continue;
  const id = matchRegion(name);
  if (!id) {
    if (/^(україна|ukraine|усього|разом|всього|total)$/i.test(name)) continue; // national total rows
    unmatched.set(name, (unmatched.get(name) || 0) + 1);
    continue;
  }
  const period = iPeriod >= 0 ? r[iPeriod]?.trim() || null : null;
  addPeriod(period);
  if (isLong) {
    const label = iSeries >= 0 ? r[iSeries]?.trim() || 'value' : header[iValue];
    const sid = slug(label);
    if (!series.has(sid)) series.set(sid, label);
    const v = num(r[iValue]);
    if (v != null) values.push([id, sid, period, v]);
  } else {
    header.forEach((h, i) => {
      if (i === iRegion || i === iPeriod || i === iSeries) return;
      const v = num(r[i]);
      if (v == null) return;
      const sid = slug(h);
      if (!series.has(sid)) series.set(sid, h);
      values.push([id, sid, period, v]);
    });
  }
}

if (periods.length && periods.every((p) => /^\d{4}([-./]\d{1,2}([-./]\d{1,2})?|-?Q[1-4])?$/i.test(p))) periods.sort();
const out = opt('--out', path.join(path.dirname(input), 'data.json'));
const lang2 = (s) => (s ? { uk: s, en: s } : undefined);
const data = {
  meta: {
    title: lang2(opt('--title')),
    unit: lang2(opt('--unit')),
    source: lang2(opt('--source', path.basename(input))),
    updated: opt('--updated', new Date().toISOString().slice(0, 10)),
  },
  series: [...series.entries()].map(([id, label]) => ({ id, label: { uk: label, en: label } })),
  ...(periods.length ? { periods } : {}),
  values: { columns: ['region', 'series', 'period', 'value'], rows: values.map((v) => (periods.length ? v : [v[0], v[1], null, v[3]])) },
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, prettyJSON(data)); // readable; the build minifies it

const regions = new Set(values.map((v) => v[0]));
console.log(`✓ ${out}: ${values.length} values · ${regions.size} regions · series: ${[...series.keys()].join(', ')} · periods: ${periods.length || '—'} · ${isLong ? 'long' : 'wide'} format, delimiter "${delim === '\t' ? '\\t' : delim}"`);
if (unmatched.size) {
  console.warn(`! unmatched region names (${unmatched.size}):`);
  for (const [n, c] of unmatched) console.warn(`  "${n}" ×${c}`);
  console.warn('  Add spellings to `alt` in src/map/catalog.js if they are real regions.');
  if (!args.includes('--allow-unmatched')) process.exit(2);
}
