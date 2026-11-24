// Share-link codes: view settings ↔ "#ub-<base62>" (only letters, digits and hyphens pass through the Artifact host).
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSnapshot, decodeSnapshot, isSnapshotCode, textDiff, textApply, pack, unpack } from '../src/lib/core/snapshot.js';

const settings = { m: 'progress', p: '2025-11', s: ['UA-30', 'UA-46'], c: 'viridis', v: { 'progress/0/values': true, 'progress/*/glyphScale': 1.25 }, k: ['timeline-chart-1'], t: true, q: { 'timeline-chart-1': { view: 'all' } }, n: 'auto', l: 'uk' };

test('settings survive the round trip through a link-safe code', async () => {
  const code = await encodeSnapshot(settings);
  assert.match(code, /^ub-[0-9A-Za-z]+$/);
  assert.ok(isSnapshotCode('#' + code));
  assert.deepEqual(await decodeSnapshot(code), settings);
  assert.deepEqual(await decodeSnapshot('#' + code), settings);
});

test('texts with Cyrillic, apostrophes and other scripts round-trip; Ukrainian letters take one byte', async () => {
  const s = { x: { t: { uk: 'Розписки з заставою — Київська обл. «тест» м’ята', en: 'Pledged notes – Kyiv' }, r: { uk: 'Реєстр ★ 日本' } } };
  assert.deepEqual(await decodeSnapshot(await encodeSnapshot(s)), s);
  const word = 'Їжакові ґудзик';
  assert.equal(pack(word).length, word.length);
  assert.equal(unpack(pack(word)), word);
});

test('the new code is shorter than the first version for the same settings', async () => {
  const v1 = 'ua-' + (() => {
    let n = 1n;
    for (const b of new TextEncoder().encode(JSON.stringify(settings))) n = (n << 8n) | BigInt(b);
    let s = '';
    while (n > 0n) {
      s = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Number(n % 62n)] + s;
      n /= 62n;
    }
    return s;
  })();
  assert.deepEqual(await decodeSnapshot(v1), settings, 'old ua- links still open');
  assert.ok((await encodeSnapshot(settings)).length < v1.length);
});

test('text diffs: small edits travel as the changed part only, and only against the same original', () => {
  const base = 'Вигадані користувачі чотирьох середовищ за регіонами, щомісяця з січня 2025.';
  const edited = 'Вигадані користувачі трьох середовищ за регіонами, щомісяця з січня 2025.';
  const d = textDiff(base, edited);
  assert.ok(Array.isArray(d) && JSON.stringify(d).length < edited.length);
  assert.equal(textApply(base, d), edited);
  assert.equal(textApply(base + ' Ще.', d), null, 'the original changed: the diff no longer applies');
  assert.equal(textDiff('Мапа', 'Зовсім інша назва'), 'Зовсім інша назва');
  assert.equal(textApply('Мапа', 'Зовсім інша назва'), 'Зовсім інша назва');
});

test('anything else decodes to null', async () => {
  for (const bad of ['', '#', '#settings', 'ua-', 'ub-', 'ua-***', '#ua-0', 'ua-zzzz', 'ub-zzzz', null, undefined]) assert.equal(await decodeSnapshot(bad), null, String(bad));
});
