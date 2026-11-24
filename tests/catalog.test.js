import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, REGION_IDS, matchRegion } from '../src/map/catalog.js';

test('catalog has the 27 first-level regions with unique ids, codes and hex cells', () => {
  assert.equal(REGIONS.length, 27);
  assert.equal(new Set(REGION_IDS).size, 27);
  assert.equal(new Set(REGIONS.map((r) => r.code)).size, 27);
  assert.equal(new Set(REGIONS.map((r) => r.hex.join(','))).size, 27);
  for (const r of REGIONS) {
    assert.match(r.id, /^UA-\d{2}$/);
    assert.ok(r.short.uk && r.short.en && r.full.uk && r.full.en && r.abbr.uk && r.abbr.en, r.id);
  }
});

test('every official and short name resolves to its own region', () => {
  for (const r of REGIONS) {
    assert.equal(matchRegion(r.id), r.id);
    assert.equal(matchRegion(r.full.uk), r.id, r.full.uk);
    assert.equal(matchRegion(r.full.en), r.id, r.full.en);
    for (const a of r.alt) assert.equal(matchRegion(a), r.id, a);
  }
});

test('common spellings from real exports', () => {
  const cases = {
    'Вінницька обл.': 'UA-05',
    'вінницька': 'UA-05',
    'Vinnytska oblast': 'UA-05',
    'Київська область': 'UA-32',
    'Київська обл': 'UA-32',
    'Kyiv Oblast': 'UA-32',
    'Kyiv region': 'UA-32',
    'м. Київ': 'UA-30',
    'Київ': 'UA-30',
    'Kyiv': 'UA-30',
    'Kiev': 'UA-30',
    'АР Крим': 'UA-43',
    'Автономна Республіка Крим': 'UA-43',
    'м.Севастополь': 'UA-40',
    'Івано-Франківська область': 'UA-26',
    'Ivano-Frankivsk Oblast': 'UA-26',
    'Запорізька': 'UA-23',
    "Кропивницька": 'UA-35',
    'Odessa': 'UA-51',
    'UA05': 'UA-05',
    ' Харківська область ': 'UA-63',
  };
  for (const [input, id] of Object.entries(cases)) assert.equal(matchRegion(input), id, input);
});

test('KOATUU / KATOTTG codes use the administrative prefix, not the ISO number', () => {
  assert.equal(matchRegion('UA80000000000093317'), 'UA-30'); // Kyiv city: KATOTTG 80, ISO 30
  assert.equal(matchRegion('UA01000000000013043'), 'UA-43'); // Crimea: 01 vs ISO 43
  assert.equal(matchRegion('4400000000'), 'UA-09'); // Luhansk KOATUU 44, ISO 09
  assert.equal(matchRegion('73'), 'UA-77'); // Chernivtsi
});

test('unknown names return null', () => {
  assert.equal(matchRegion('Мінська область'), null);
  assert.equal(matchRegion(''), null);
  assert.equal(matchRegion(null), null);
});
