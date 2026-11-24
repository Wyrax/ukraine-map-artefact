// Share-link codes: view settings ↔ "#ua-<base62>" (only letters, digits and hyphens pass through the Artifact host).
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSnapshot, decodeSnapshot } from '../src/lib/core/snapshot.js';

test('settings survive the round trip through a link-safe code', () => {
  const s = { m: 'progress', p: '2025-11', s: ['UA-30', 'UA-46'], c: 'viridis', v: { 'progress/0/values': true, 'progress/*/glyphScale': 1.25 }, k: ['timeline-chart-1'], t: true, q: { 'timeline-chart-1': { view: 'all' } }, n: 'auto', l: 'uk' };
  const code = encodeSnapshot(s);
  assert.match(code, /^ua-[0-9A-Za-z]+$/);
  assert.deepEqual(decodeSnapshot(code), s);
  assert.deepEqual(decodeSnapshot('#' + code), s);
});

test('Cyrillic text and empty objects round-trip too', () => {
  for (const s of [{}, { x: 'Київська область' }, { a: [] }]) assert.deepEqual(decodeSnapshot(encodeSnapshot(s)), s);
});

test('anything else decodes to null', () => {
  for (const bad of ['', '#', '#settings', 'ua-', 'ua-***', '#ua-0', 'ua-zzzz', null, undefined]) assert.equal(decodeSnapshot(bad), null, String(bad));
});
