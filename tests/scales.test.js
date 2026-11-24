import test from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, niceMax, classBreaks, classify, rampSteps, sqrtRadius } from '../src/lib/core/scales.js';
import { arcPath, barUp, hexPath } from '../src/lib/core/shapes.js';
import { formatValue } from '../src/lib/core/format.js';

test('nice ticks cover the domain with round steps', () => {
  assert.deepEqual(niceTicks(0, 9604, 4), [0, 2500, 5000, 7500, 10000]);
  assert.deepEqual(niceTicks(0, 1, 4), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(niceMax(87), 100);
});

test('class breaks: quantile and equal, classify into k classes', () => {
  const vals = Array.from({ length: 100 }, (_, i) => i + 1);
  const q = classBreaks(vals, 5, 'quantile');
  assert.equal(q.length, 4);
  assert.ok(q.every((b, i) => i === 0 || b > q[i - 1]));
  const e = classBreaks([0, 0.2, 0.5, 1], 5, 'equal');
  assert.ok(e.length >= 3 && e.length <= 4);
  assert.equal(classify(null, q), -1);
  assert.equal(classify(1, q), 0);
  assert.equal(classify(100, q), q.length);
  assert.deepEqual(classBreaks(vals, 3, [10, 20]), [10, 20]);
});

test('ramp steps spread over the 7-step ramp', () => {
  assert.deepEqual(rampSteps(5), [1, 3, 4, 6, 7]);
  assert.deepEqual(rampSteps(7), [1, 2, 3, 4, 5, 6, 7]);
});

test('area-true radius', () => {
  const r = sqrtRadius(100, 10);
  assert.equal(r(100), 10);
  assert.equal(r(25), 5);
  assert.equal(r(0), 0);
});

test('shape builders return valid path data', () => {
  assert.match(arcPath(0, 0, 0, 10, 0, Math.PI), /^M.*A.*Z$/);
  assert.equal(arcPath(0, 0, 0, 10, 1, 1), '');
  assert.match(arcPath(0, 0, 5, 10, 0, Math.PI * 2), /A.*A/); // full ring = two arcs
  assert.equal(barUp(0, 10, 4, 0), '');
  assert.match(barUp(0, 10, 4, 6), /^M0 10V/);
  assert.equal(hexPath(0, 0, 10).split('L').length, 6);
});

test('Ukrainian number formatting', () => {
  assert.equal(formatValue(1234567, 'number', 'uk').replace(/\s/g, ' '), '1 234 567');
  assert.equal(formatValue(0.756, 'pct', 'en'), '76%');
  assert.equal(formatValue(null), '—');
});
