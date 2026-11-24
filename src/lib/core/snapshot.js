// View settings ↔ a link-safe code. The Artifact host only passes a "plain #name" (ASCII letters, digits, hyphens)
// from the artifact's link into the page, so the settings travel as `#ub-<base62>`:
//   compact JSON → bytes (ASCII as is, Ukrainian letters and common punctuation 1 byte each, anything else escaped)
//   → deflate-raw when that is shorter (first byte says which) → base62.
// `#ua-<base62>` (plain UTF-8 JSON, the first version) still decodes.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// one byte each (128 + index); 255 = escape, followed by the character's UTF-8 bytes
const ONE_BYTE = 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя’«»—–…№·ʼ';
const RAW = 0;
const DEFLATED = 1;

function toBase62(bytes) {
  let n = 1n; // leading 1 keeps leading zero bytes
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) {
    s = ALPHABET[Number(n % 62n)] + s;
    n /= 62n;
  }
  return s;
}
function fromBase62(s) {
  let n = 0n;
  for (const ch of s) {
    const d = ALPHABET.indexOf(ch);
    if (d < 0) return null;
    n = n * 62n + BigInt(d);
  }
  const bytes = [];
  while (n > 1n) {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  }
  return n === 1n ? Uint8Array.from(bytes) : null;
}

/** String → bytes: ASCII as is, ONE_BYTE characters as 128+index, the rest as 255 + UTF-8. */
export function pack(str) {
  const out = [];
  const utf8 = new TextEncoder();
  for (const ch of str) {
    const c = ch.codePointAt(0);
    const i = c < 128 ? -1 : ONE_BYTE.indexOf(ch);
    if (c < 128) out.push(c);
    else if (i >= 0) out.push(128 + i);
    else out.push(255, ...utf8.encode(ch));
  }
  return Uint8Array.from(out);
}
export function unpack(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 128) s += String.fromCharCode(b);
    else if (b < 255) s += ONE_BYTE[b - 128] ?? '';
    else {
      const lead = bytes[i + 1];
      const len = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
      s += new TextDecoder().decode(bytes.subarray(i + 1, i + 1 + len));
      i += len;
    }
  }
  return s;
}

async function viaStream(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Settings object → `ub-…` code (no leading #). */
export async function encodeSnapshot(obj) {
  const raw = pack(JSON.stringify(obj));
  let body = Uint8Array.from([RAW, ...raw]);
  if (typeof CompressionStream === 'function') {
    try {
      const z = await viaStream(raw, new CompressionStream('deflate-raw'));
      if (z.length < raw.length) body = Uint8Array.from([DEFLATED, ...z]);
    } catch {
      /* keep the raw form */
    }
  }
  return 'ub-' + toBase62(body);
}

/** `ub-…` or `ua-…` code (with or without #) → settings object, or null when it is not one of ours or is damaged. */
export async function decodeSnapshot(code) {
  const m = /^#?(ua|ub)-([0-9A-Za-z]+)$/.exec(String(code || '').trim());
  if (!m) return null;
  try {
    const bytes = fromBase62(m[2]);
    if (!bytes) return null;
    let text;
    if (m[1] === 'ua') text = new TextDecoder().decode(bytes);
    else if (bytes[0] === RAW) text = unpack(bytes.subarray(1));
    else if (bytes[0] === DEFLATED && typeof DecompressionStream === 'function') text = unpack(await viaStream(bytes.subarray(1), new DecompressionStream('deflate-raw')));
    else return null;
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** True when the URL hash looks like one of our codes (worth waiting for before the first render). */
export const isSnapshotCode = (code) => /^#?(ua|ub)-[0-9A-Za-z]+$/.test(String(code || '').trim());

/**
 * Text edits travel as changes against the page's own text: [kept prefix, kept suffix, new middle, length of the
 * original] when that is shorter than the whole new text, else the text itself.
 */
export function textDiff(base, text) {
  base = String(base ?? '');
  text = String(text ?? '');
  let p = 0;
  while (p < base.length && p < text.length && base[p] === text[p]) p++;
  let q = 0;
  while (q < base.length - p && q < text.length - p && base[base.length - 1 - q] === text[text.length - 1 - q]) q++;
  const mid = text.slice(p, text.length - q);
  return mid.length + 10 < text.length ? [p, q, mid, base.length] : text;
}
/** Inverse of textDiff; null when the original text has changed since (the diff no longer applies). */
export function textApply(base, d) {
  base = String(base ?? '');
  if (typeof d === 'string') return d;
  if (!Array.isArray(d) || d.length !== 4) return null;
  const [p, q, mid, len] = d;
  if (len !== base.length || p + q > len) return null;
  return base.slice(0, p) + String(mid) + base.slice(len - q);
}
