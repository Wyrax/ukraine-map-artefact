// Canonical data → fast lookups and measures.
//
// data.json:
// { meta, series:[{id,label,format?,unit?}], periods?:[...], periodLabels?:{period:{uk,en}},
//   values:[{region,series,period,value}]  or  {columns:["region","series","period","value"], rows:[[...]]},
//   flows?:[{from,to,series?,period?,value}] (same two forms), categories?:[{id,label}] }
//
// Measures = every series + "total" + derived measures from artefact.json `measures`
//   [{ id, label, expr: "pledged / (pledged + no_pledge)", format: "pct", unit }]
import { matchRegion, REGIONS, BY_ID } from '../../map/catalog.js';
import { parseExpr, evalExpr } from './expr.js';

const uniq = (arr) => [...new Set(arr)];
/** How an unmatched region value is reported: address objects by their name, not as "[object Object]". */
function shown(v) {
  if (!v || typeof v !== 'object') return String(v);
  const part = v.region && typeof v.region === 'object' ? v.region : v;
  return String(part.name ?? part.KATOTTGCode ?? part.code ?? JSON.stringify(v).slice(0, 80));
}

/** Accepts records as an array of objects or the compact form {columns:[...], rows:[[...], ...]}. */
export function records(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Array.isArray(v.columns) && Array.isArray(v.rows)) return v.rows.map((row) => Object.fromEntries(v.columns.map((c, i) => [c, row[i]])));
  return [];
}

export function prepareData(raw, config = {}) {
  const values = records(raw.values);
  const periods = (raw.periods?.length ? raw.periods : uniq(values.map((v) => v.period).filter((p) => p != null))).map(String);
  if (!periods.length) periods.push('');
  const pIndex = new Map(periods.map((p, i) => [p, i]));

  const series = (raw.series?.length ? raw.series : uniq(values.map((v) => v.series ?? 'value')).map((id) => ({ id, label: id }))).map(
    (s, i) => ({ ...s, slot: s.slot ?? i + 1 }),
  );
  const categories = (raw.categories || []).map((c, i) => ({ ...c, slot: c.slot ?? i + 1 }));
  const catIds = new Set(categories.map((c) => c.id));

  const store = new Map(); // region|series|p → value
  const present = new Set(); // region|p
  const unmatched = new Set();
  const periodsOf = (p) => (p == null ? periods.map((_, i) => i) : pIndex.has(String(p)) ? [pIndex.get(String(p))] : []);

  for (const v of values) {
    const id = matchRegion(v.region);
    if (!id) {
      unmatched.add(shown(v.region));
      continue;
    }
    const sid = v.series ?? series[0].id;
    const val = Number(v.value);
    if (!Number.isFinite(val)) continue;
    for (const p of periodsOf(v.period)) {
      const k = `${id}|${sid}|${p}`;
      store.set(k, (store.get(k) || 0) + val);
      present.add(`${id}|${p}`);
    }
  }

  const flows = [];
  for (const f of records(raw.flows)) {
    const from = matchRegion(f.from);
    if (!from) {
      unmatched.add(shown(f.from));
      continue;
    }
    const toRegion = catIds.has(f.to) ? null : matchRegion(f.to);
    const to = toRegion || (catIds.has(f.to) ? f.to : null);
    if (!to) {
      unmatched.add(shown(f.to));
      continue;
    }
    for (const p of periodsOf(f.period)) flows.push({ from, to, toRegion: !!toRegion, series: f.series ?? null, p, value: Number(f.value) || 0 });
  }

  const nat = new Map();
  for (const [k, v] of store) {
    const [, sid, p] = k.split('|');
    nat.set(`${sid}|${p}`, (nat.get(`${sid}|${p}`) || 0) + v);
  }

  return {
    meta: raw.meta || {},
    periods,
    hasTime: periods.length > 1,
    series,
    categories,
    regionIds: REGIONS.map((r) => r.id),
    unmatched: [...unmatched],
    has: (region, p) => present.has(`${region}|${p}`),
    get: (region, sid, p) => store.get(`${region}|${sid}|${p}`) ?? null,
    national: (sid, p) => nat.get(`${sid}|${p}`) ?? 0,
    flowsAt: (p) => flows.filter((f) => f.p === p),
    flows,
  };
}

/**
 * The flows of one period for the data table: pairs (duplicate rows summed; a region's flow to itself is left out,
 * as on the map and in the Sankey), each region's outflow and inflow, and the period's total.
 * When the data has any region → region flows, the per-region figures count only those (so outflow, inflow and net
 * describe moves between regions); with category targets only, outflow is everything a region sends.
 * `toRegions` and `hasSeries` look at every period, so the table keeps the same columns while the timeline plays.
 */
export function flowTable(data, p) {
  const toRegions = data.flows.some((f) => f.toRegion);
  const hasSeries = data.flows.some((f) => f.series != null);
  const all = data.flowsAt(p).filter((f) => !(f.toRegion && f.from === f.to));
  const pairs = new Map();
  for (const f of all) {
    const key = `${f.from}>${f.to}>${f.series ?? ''}`;
    const cur = pairs.get(key);
    if (cur) cur.value += f.value;
    else pairs.set(key, { key, from: f.from, to: f.to, toRegion: f.toRegion, series: f.series, value: f.value });
  }
  const byRegion = new Map();
  const at = (id) => byRegion.get(id) || byRegion.set(id, { out: 0, in: 0 }).get(id);
  for (const f of all) {
    if (toRegions && !f.toRegion) continue;
    at(f.from).out += f.value;
    if (f.toRegion) at(f.to).in += f.value;
  }
  const total = all.reduce((a, f) => a + f.value, 0);
  return { pairs: [...pairs.values()], byRegion, total, toRegions, hasSeries };
}

/** Builds the measure registry: series, "total", and derived expression measures. */
export function buildMeasures(data, config = {}) {
  const m = new Map();
  const unit = data.meta.unit;
  const fmt = config.format || data.meta.format || 'number';
  for (const s of data.series) {
    m.set(s.id, {
      id: s.id,
      label: s.label,
      format: s.format || fmt,
      unit: s.unit ?? unit,
      slot: s.slot,
      get: (r, p) => (data.has(r, p) ? data.get(r, s.id, p) ?? 0 : null),
      nat: (p) => data.national(s.id, p),
      additive: true,
    });
  }
  const sum = (r, p) => (data.has(r, p) ? data.series.reduce((a, s) => a + (data.get(r, s.id, p) ?? 0), 0) : null);
  if (!m.has('total')) {
    m.set('total', {
      id: 'total',
      label: { uk: 'Усього', en: 'Total' },
      format: fmt,
      unit,
      get: sum,
      nat: (p) => data.series.reduce((a, s) => a + data.national(s.id, p), 0),
      additive: true,
    });
  }
  for (const cm of config.measures || []) {
    const ast = parseExpr(cm.expr);
    m.set(cm.id, {
      id: cm.id,
      label: cm.label || cm.id,
      format: cm.format || fmt,
      unit: cm.unit ?? (cm.format === 'pct' ? '' : unit),
      get: (r, p) => (data.has(r, p) ? evalExpr(ast, (id) => (id === 'total' ? sum(r, p) : data.get(r, id, p) ?? 0)) : null),
      nat: (p) => evalExpr(ast, (id) => (id === 'total' ? m.get('total').nat(p) : data.national(id, p))),
      additive: false,
    });
  }
  return m;
}

/** [min, max] of measures over all regions; over all periods unless `period` is given. */
export function domainOf(measures, ids, data, period = null) {
  let min = Infinity;
  let max = -Infinity;
  const ps = period == null ? data.periods.map((_, i) => i) : [period];
  for (const id of ids) {
    const ms = measures.get(id);
    if (!ms) continue;
    for (const r of data.regionIds) {
      for (const p of ps) {
        const v = ms.get(r, p);
        if (v == null || !Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  return min === Infinity ? [0, 0] : [min, max];
}

/** All finite values of a measure (all periods unless `period` given) — for class breaks. */
export function valuesOf(measure, data, period = null) {
  const out = [];
  const ps = period == null ? data.periods.map((_, i) => i) : [period];
  for (const r of data.regionIds) for (const p of ps) {
    const v = measure.get(r, p);
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export { BY_ID };
