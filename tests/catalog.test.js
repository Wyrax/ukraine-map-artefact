import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, REGION_IDS, BY_ID, matchRegion } from '../src/map/catalog.js';

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

test('each region has its own 10-digit KOATUU and first-level KATOTTG code, both built on its prefix', () => {
  for (const r of REGIONS) {
    assert.equal(r.koatuu, r.code + '00000000', r.id);
    assert.match(r.katottg, new RegExp(`^UA${r.code}0{10}\\d{5}$`), r.id); // first level: zeros, then a 5-digit number
    assert.equal(matchRegion(r.koatuu), r.id);
    assert.equal(matchRegion(r.katottg), r.id);
  }
  assert.equal(new Set(REGIONS.map((r) => r.katottg)).size, 27);
  assert.equal(BY_ID['UA-05'].katottg, 'UA05000000000010236'); // as in Liquio's address register
});

test('codes as they arrive from Liquio and Excel: no "UA", lost zero, separators, category letter, short prefix', () => {
  const cases = {
    '05000000000010236': 'UA-05', // KATOTTG without "UA", as Liquio writes it (region)
    '05020110010028819': 'UA-05', // … and a settlement (м. Липовець)
    '80000000000093317': 'UA-30',
    'UA05020110010028819 М': 'UA-05', // with the category letter
    'UA 05 020 030 010 063857': 'UA-05',
    '510100000': 'UA-05', // KOATUU after Excel dropped the leading zero
    '110100000': 'UA-43',
    '0510100000.0': 'UA-05',
    '05-10-100-000': 'UA-05',
    UA44: 'UA-09', // short KATOTTG prefix …
    UA09: 'UA-09', // … and ISO without the hyphen: they never clash
    UA80: 'UA-30',
    UA30: 'UA-30',
    UA73: 'UA-77',
    UA85: 'UA-40',
  };
  for (const [input, id] of Object.entries(cases)) assert.equal(matchRegion(input), id, input);
  assert.equal(matchRegion(510100000), 'UA-05', 'a number, as JSON or a spreadsheet gives it');
  for (const bad of ['410100000', '4510100000', '12345', '09', 'UA05000000000010236X1']) assert.equal(matchRegion(bad), null, bad);
});

test('Liquio address objects: the whole address or its region part, by KATOTTGCode, KOATUUCode, then name', () => {
  const region = { KATOTTGCode: '05000000000010236', KOATUUCode: '0500000000', name: 'Вінницька обл.' };
  assert.equal(matchRegion(region), 'UA-05');
  assert.equal(matchRegion({ region, city: { KATOTTGCode: '05020110010028819', name: 'Липовець' } }), 'UA-05');
  assert.equal(matchRegion({ KATOTTGCode: 'UA80000000000093317' }), 'UA-30');
  assert.equal(matchRegion({ KATOTTGCode: '', KOATUUCode: '7300000000' }), 'UA-77');
  // fallback: Liquio's own field name, so its address objects work exactly as exported
  assert.equal(matchRegion({ code: '05020110010028819', name: 'Липовець' }), 'UA-05');
  assert.equal(matchRegion({ region: { code: '44000000000018893' } }), 'UA-09');
  assert.equal(matchRegion({ KATOTTGCode: '80000000000093317', code: '05000000000010236' }), 'UA-30', 'KATOTTGCode wins');
  assert.equal(matchRegion({ name: 'м. Київ' }), 'UA-30');
  assert.equal(matchRegion({ foo: 1 }), null);
});

test('unknown names return null', () => {
  assert.equal(matchRegion('Мінська область'), null);
  assert.equal(matchRegion(''), null);
  assert.equal(matchRegion(null), null);
});
