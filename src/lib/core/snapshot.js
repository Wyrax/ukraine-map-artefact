// View settings ↔ a link-safe code. The Artifact host only passes a "plain #name" (ASCII letters, digits, hyphens)
// from the artifact's link into the page, so the settings travel as `#ua-<base62>`: compact JSON → UTF-8 → base62.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PREFIX = 'ua-';

/** Settings object → `ua-…` code (no leading #). */
export function encodeSnapshot(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let n = 1n; // leading 1 keeps leading zero bytes
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) {
    s = ALPHABET[Number(n % 62n)] + s;
    n /= 62n;
  }
  return PREFIX + s;
}

/** `ua-…` code (with or without #) → settings object, or null when it is not one of ours or is damaged. */
export function decodeSnapshot(code) {
  const m = /^#?ua-([0-9A-Za-z]+)$/.exec(String(code || '').trim());
  if (!m) return null;
  try {
    let n = 0n;
    for (const ch of m[1]) {
      const d = ALPHABET.indexOf(ch);
      if (d < 0) return null;
      n = n * 62n + BigInt(d);
    }
    const bytes = [];
    while (n > 1n) {
      bytes.unshift(Number(n & 255n));
      n >>= 8n;
    }
    if (n !== 1n) return null;
    const obj = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}
