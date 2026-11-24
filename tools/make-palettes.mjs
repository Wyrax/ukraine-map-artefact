#!/usr/bin/env node
// Generates src/lib/styles/palettes.json — the colour presets an artefact can use (options.palette) or offer
// to viewers (options.palettePicker). Run: node tools/make-palettes.mjs
//
// Each preset has, for light and dark themes:
//   seq[7]    sequential ramp for choropleths/heatmaps (low → high). Light: light → dark; dark theme: dark → light,
//             so high values always stand out from the surface. Multi-hue ramps reverse their hues in dark mode
//             (e.g. yellow-orange-red → dark red … light yellow), as the dark-surface versions of these maps do.
//   seqOn[7]  text colour on each ramp step
//   cat[8]    categorical series colours: the validated reference palette (dataviz skill), rotated so that the hue
//             matching the preset comes first (single-colour glyphs use slot 1). A rotation keeps every adjacent
//             pair of the validated order except one and adds red↔blue — re-check with the validator after edits.
//   accent, sel  UI accent (≥ 4.5:1 on the surface) and a selection tint
//   occ       optional occupation-hatch colour when the default red would vanish into a warm ramp
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- colour maths (OKLab / OKLCH ↔ sRGB) ----------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
function rgbToOklab([r, g, b]) {
  [r, g, b] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToLinRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** OKLCH → hex, reducing chroma until the colour fits sRGB. */
function oklch(L, C, h) {
  for (let c = C; c >= 0; c -= 0.002) {
    const lin = oklabToLinRgb([L, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(lin.map((v) => toGam(Math.min(1, Math.max(0, v)))));
  }
  return rgbToHex(oklabToLinRgb([L, 0, 0]).map(toGam));
}
const toOklch = (hex) => {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
};
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Samples a list of colour stops (evenly spaced over 0..1) at t, interpolating in OKLab. */
function sample(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = rgbToOklab(hexToRgb(stops[i]));
  const b = rgbToOklab(hexToRgb(stops[i + 1]));
  return rgbToHex(oklabToLinRgb(a.map((v, k) => v + (b[k] - v) * f)).map((v) => toGam(Math.min(1, Math.max(0, v)))));
}

// ---------- surfaces and inks (base.css) ----------
const SURFACE = { light: '#ffffff', dark: '#161b21' };
const INKS = { light: ['#000000', '#ffffff'], dark: ['#000000', '#ffffff'] }; // text on ramp steps: whichever reads better

// ---------- validated categorical palette (dataviz reference instance), fixed order ----------
const CAT = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
};
const SLOT = { blue: 0, orange: 1, aqua: 2, yellow: 3, magenta: 4, green: 5, violet: 6, red: 7 };
const rotate = (arr, k) => [...arr.slice(k), ...arr.slice(0, k)];

// ---------- ramps ----------
const L_LIGHT = [0.93, 0.86, 0.78, 0.69, 0.595, 0.49, 0.38];
const L_DARK = [0.36, 0.44, 0.52, 0.61, 0.7, 0.79, 0.88];
const C_LIGHT = [0.4, 0.63, 0.87, 1, 0.93, 0.77, 0.57];
const C_DARK = [0.47, 0.67, 0.87, 1, 1, 0.83, 0.57];
/** One-hue (or gently drifting) ramp from OKLCH parameters: hue goes hLow → hHigh with the value. */
function hueRamp({ hLow, hHigh, cMax }) {
  const light = L_LIGHT.map((L, i) => oklch(L, cMax * C_LIGHT[i], hLow + ((hHigh - hLow) * i) / 6));
  // dark theme: lightness rises with the value; the hue keeps its light-theme order reversed (see header)
  const dark = L_DARK.map((L, i) => oklch(L, cMax * C_DARK[i], hHigh + ((hLow - hHigh) * i) / 6));
  return { light, dark };
}
/** Ramp from a published colour map given as evenly spaced stops (dark → light), sampled over [t0, t1]. */
function mapRamp(stops, { light: [l0, l1], dark: [d0, d1] }) {
  const at = (a, b) => Array.from({ length: 7 }, (_, i) => a + ((b - a) * i) / 6);
  return { light: at(l1, l0).map((t) => sample(stops, t)), dark: at(d0, d1).map((t) => sample(stops, t)) };
}
const VIRIDIS = ['#440154', '#482475', '#414487', '#355f8d', '#2a788e', '#21918c', '#22a884', '#44bf70', '#7ad151', '#bddf26', '#fde725'];
const MAGMA = ['#000004', '#140e36', '#3b0f70', '#641a80', '#8c2981', '#b73779', '#de4968', '#f7705c', '#fe9f6d', '#fecf92', '#fcfdbf'];

const PRESETS = [
  { id: 'green', name: { uk: 'Зелена', en: 'Green' }, ramp: hueRamp({ hLow: 138, hHigh: 160, cMax: 0.15 }), slot: 'green' },
  {
    id: 'blue',
    name: { uk: 'Синя', en: 'Blue' },
    // the dataviz reference blue ramp, as validated
    ramp: { light: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'], dark: ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6'] },
    slot: 'blue',
  },
  { id: 'teal', name: { uk: 'Бірюзова', en: 'Teal' }, ramp: hueRamp({ hLow: 178, hHigh: 205, cMax: 0.11 }), slot: 'aqua' },
  { id: 'purple', name: { uk: 'Фіолетова', en: 'Purple' }, ramp: hueRamp({ hLow: 305, hHigh: 290, cMax: 0.17 }), slot: 'violet' },
  { id: 'orange', name: { uk: 'Помаранчева', en: 'Orange' }, ramp: hueRamp({ hLow: 75, hHigh: 42, cMax: 0.16 }), slot: 'orange', occ: 'ink' },
  { id: 'ylgnbu', name: { uk: 'Жовто-синя', en: 'Yellow–blue' }, ramp: hueRamp({ hLow: 105, hHigh: 262, cMax: 0.13 }), slot: 'blue' },
  { id: 'ylorrd', name: { uk: 'Жовто-червона', en: 'Yellow–red' }, ramp: hueRamp({ hLow: 95, hHigh: 25, cMax: 0.19 }), slot: 'red', occ: 'ink' },
  { id: 'viridis', name: { uk: 'Viridis', en: 'Viridis' }, ramp: mapRamp(VIRIDIS, { light: [0.04, 1], dark: [0.12, 1] }), slot: 'aqua' },
  { id: 'magma', name: { uk: 'Magma', en: 'Magma' }, ramp: mapRamp(MAGMA, { light: [0.14, 1], dark: [0.28, 1] }), slot: 'magenta', occ: 'ink' },
  { id: 'grey', name: { uk: 'Сіра', en: 'Grey' }, ramp: hueRamp({ hLow: 250, hHigh: 255, cMax: 0.014 }), slot: 'blue' }, // a grey slot 1 would fail the chroma floor
];

// ---------- assemble ----------
function build(p) {
  const out = { id: p.id, name: p.name };
  for (const mode of ['light', 'dark']) {
    const seq = p.ramp[mode];
    const seqOn = seq.map((c) => INKS[mode].map((ink) => [ink, contrast(c, ink)]).sort((a, b) => b[1] - a[1])[0][0]);
    const cat = rotate(CAT[mode], SLOT[p.slot]);
    // accent: the ramp step closest to the surface that still reads as text on it (≥ 4.5:1)
    const usable = seq.filter((c) => contrast(c, SURFACE[mode]) >= 4.5);
    const accent = usable.length ? usable.sort((a, b) => contrast(a, SURFACE[mode]) - contrast(b, SURFACE[mode]))[0] : seq[6];
    const [, aC, aH] = toOklch(accent);
    const sel = mode === 'light' ? oklch(0.955, Math.min(0.035, aC * 0.3), aH) : oklch(0.29, Math.min(0.04, aC * 0.35), aH);
    out[mode] = { seq, seqOn, cat, accent, sel, ...(p.occ === 'ink' ? { occ: mode === 'light' ? '#2a2f36' : '#e6e9ed' } : {}) };
  }
  return out;
}

const presets = PRESETS.map(build);
// sanity: monotone lightness along every ramp
for (const p of presets) {
  for (const mode of ['light', 'dark']) {
    const Ls = p[mode].seq.map((c) => toOklch(c)[0]);
    const ok = Ls.every((L, i) => !i || (mode === 'light' ? L < Ls[i - 1] : L > Ls[i - 1]));
    if (!ok) throw new Error(`${p.id} ${mode}: ramp lightness is not monotone (${Ls.map((v) => v.toFixed(2))})`);
  }
}
const file = path.join(ROOT, 'src/lib/styles/palettes.json');
fs.writeFileSync(file, JSON.stringify({ default: 'green', presets }, null, 1) + '\n');
for (const p of presets) console.log(p.id.padEnd(8), p.light.seq.join(' '), '|', p.dark.seq.join(' '), '| accent', p.light.accent, p.dark.accent);
