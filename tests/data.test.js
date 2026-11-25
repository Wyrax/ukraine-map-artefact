import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpr, evalExpr, exprIds } from '../src/lib/core/expr.js';
import { prepareData, buildMeasures, domainOf, records, flowTable } from '../src/lib/core/data.js';

test('expressions: precedence, brackets, ids, division by zero', () => {
  const v = { a: 6, b: 2, 'my-id': 10 };
  const ev = (s) => evalExpr(parseExpr(s), (id) => v[id] ?? null);
  assert.equal(ev('a + b * 2'), 10);
  assert.equal(ev('(a + b) / 2'), 4);
  assert.equal(ev('-a + [my-id]'), 4);
  assert.equal(ev('a / (b - 2)'), null);
  assert.equal(ev('missing + 1'), null);
  assert.deepEqual([...exprIds(parseExpr('pledged / (pledged + no_pledge)'))].sort(), ['no_pledge', 'pledged']);
  assert.throws(() => parseExpr('a +'));
  assert.throws(() => parseExpr('a; alert(1)'));
});

const raw = {
  meta: { unit: 'шт.' },
  series: [{ id: 'pledged', label: 'З заставою' }, { id: 'free', label: 'Без застави' }],
  periods: ['2025', '2026'],
  values: [
    { region: 'Вінницька область', series: 'pledged', period: '2025', value: 30 },
    { region: 'Вінницька область', series: 'free', period: '2025', value: 10 },
    { region: 'UA-05', series: 'pledged', period: '2026', value: 50 },
    { region: 'м. Київ', series: 'pledged', period: '2026', value: 5 },
    { region: 'Kyiv', series: 'pledged', period: '2026', value: 5 }, // same region again → summed
    { region: 'Narnia', series: 'pledged', period: '2026', value: 1 },
  ],
};

test('prepareData matches names, sums duplicates and reports unmatched names', () => {
  const d = prepareData(raw);
  assert.deepEqual(d.periods, ['2025', '2026']);
  assert.equal(d.get('UA-05', 'pledged', 0), 30);
  assert.equal(d.get('UA-30', 'pledged', 1), 10);
  assert.equal(d.has('UA-30', 0), false);
  assert.deepEqual(d.unmatched, ['Narnia']);
  assert.equal(d.national('pledged', 1), 60);
});

test('measures: series, total and derived ratio (national ratio from sums)', () => {
  const d = prepareData(raw);
  const m = buildMeasures(d, { measures: [{ id: 'share', expr: 'pledged / total', format: 'pct' }] });
  assert.equal(m.get('total').get('UA-05', 0), 40);
  assert.equal(m.get('share').get('UA-05', 0), 0.75);
  assert.equal(m.get('share').get('UA-05', 1), 1);
  assert.equal(m.get('share').get('UA-21', 0), null); // no data → null, not 0
  assert.equal(m.get('share').nat(0), 0.75);
  assert.deepEqual(domainOf(m, ['pledged'], d), [5 + 5, 50]);
});

test('compact columnar records expand to objects', () => {
  const rows = records({ columns: ['region', 'series', 'value'], rows: [['UA-05', 'a', 1]] });
  assert.deepEqual(rows, [{ region: 'UA-05', series: 'a', value: 1 }]);
  const d = prepareData({ series: [{ id: 'a' }], values: { columns: ['region', 'series', 'value'], rows: [['UA-05', 'a', 7]] } });
  assert.equal(d.hasTime, false);
  assert.equal(d.get('UA-05', 'a', 0), 7);
});

test('flows: region targets vs category targets', () => {
  const d = prepareData({
    series: [{ id: 'v' }],
    categories: [{ id: 'prod' }],
    values: [],
    flows: [
      { from: 'Львівська', to: 'Київ', value: 3 },
      { from: 'UA-46', to: 'prod', value: 4 },
    ],
  });
  assert.equal(d.flows.length, 2);
  assert.deepEqual(d.flows.map((f) => [f.to, f.toRegion]), [['UA-30', true], ['prod', false]]);
});

test('Liquio address objects and codes work as region values; unmatched ones are reported by name', () => {
  const vin = { KATOTTGCode: '05000000000010236', KOATUUCode: '0500000000', name: 'Вінницька обл.' };
  const d = prepareData({
    series: [{ id: 'v' }],
    values: {
      columns: ['region', 'value'],
      rows: [[vin, 2], [{ region: vin, city: { KATOTTGCode: '05020110010028819' } }, 3], ['510100000', 4], [{ name: 'Атлантида' }, 1]],
    },
    flows: [{ from: { region: { KATOTTGCode: '80000000000093317', name: 'м. Київ' } }, to: '4600000000', value: 5 }],
  });
  assert.equal(d.get('UA-05', 'v', 0), 9);
  assert.deepEqual(d.flows.map((f) => [f.from, f.to]), [['UA-30', 'UA-46']]);
  assert.deepEqual(d.unmatched, ['Атлантида']);
});

test('flow table: pairs summed, self-flows dropped, outflow / inflow / net per region, columns stable over periods', () => {
  const d = prepareData({
    series: [{ id: 'v' }],
    periods: ['2025', '2026'],
    values: [],
    flows: [
      { from: 'UA-14', to: 'UA-12', period: '2025', value: 10 },
      { from: 'UA-14', to: 'UA-12', period: '2025', value: 5 }, // duplicate pair → summed
      { from: 'UA-12', to: 'UA-30', period: '2025', value: 7 },
      { from: 'UA-30', to: 'UA-30', period: '2025', value: 99 }, // to itself → left out
      { from: 'UA-46', to: 'UA-30', period: '2026', value: 2, series: 'v' },
    ],
  });
  const t = flowTable(d, 0);
  assert.deepEqual(t.pairs.map((f) => [f.from, f.to, f.value]), [['UA-14', 'UA-12', 15], ['UA-12', 'UA-30', 7]]);
  assert.equal(t.total, 22);
  assert.deepEqual(t.byRegion.get('UA-14'), { out: 15, in: 0 });
  assert.deepEqual(t.byRegion.get('UA-12'), { out: 7, in: 15 });
  assert.deepEqual(t.byRegion.get('UA-30'), { out: 0, in: 7 });
  assert.equal(t.byRegion.get('UA-46'), undefined, 'no flows in this period → no figures (shown as a dash)');
  assert.ok(t.toRegions && t.hasSeries, 'series seen in 2026 already counts for 2025, so the columns do not jump');
  const sum = (k) => [...t.byRegion.values()].reduce((a, x) => a + x[k], 0);
  assert.equal(sum('out'), sum('in'), 'between regions everything that leaves arrives somewhere');
});

test('flow table: category targets only → outflow is everything a region sends', () => {
  const d = prepareData({
    series: [{ id: 'v' }],
    categories: [{ id: 'prod' }, { id: 'test' }],
    values: [],
    flows: [
      { from: 'UA-46', to: 'prod', value: 4 },
      { from: 'UA-46', to: 'test', value: 1 },
    ],
  });
  const t = flowTable(d, 0);
  assert.equal(t.toRegions, false);
  assert.deepEqual(t.byRegion.get('UA-46'), { out: 5, in: 0 });
  assert.equal(t.pairs.length, 2);
});
