// Number formatting via Intl (uk-UA groups thousands with spaces, compact gives "тис." / "млн").
const LOCALE = { uk: 'uk-UA', en: 'en-GB' };
const cache = new Map();

function nf(lang, opts) {
  const key = lang + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(LOCALE[lang] || 'uk-UA', opts));
  return cache.get(key);
}

/** format: 'number' (default) | 'compact' | 'pct' (0..1 → %) | 'decimal' */
export function formatValue(v, format = 'number', lang = 'uk', digits) {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (format) {
    case 'pct':
      return nf(lang, { style: 'percent', maximumFractionDigits: digits ?? (Math.abs(v) < 0.1 && v !== 0 ? 1 : 0) }).format(v);
    case 'compact':
      return Math.abs(v) < 10000
        ? nf(lang, { maximumFractionDigits: 0 }).format(v)
        : nf(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    case 'decimal':
      return nf(lang, { maximumFractionDigits: digits ?? 1 }).format(v);
    default:
      return nf(lang, { maximumFractionDigits: digits ?? (Math.abs(v) < 10 && v % 1 ? 1 : 0) }).format(v);
  }
}

/** Axis/legend tick: compact from 10 000 up, whole percents for shares. */
export function formatTick(v, format, lang) {
  if (format === 'pct') return formatValue(v, 'pct', lang, 0);
  return formatValue(v, Math.abs(v) >= 10000 ? 'compact' : 'number', lang);
}
