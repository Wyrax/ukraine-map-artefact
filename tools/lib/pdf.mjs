// Minimal PDF reader for PDF-compatible Adobe Illustrator files.
// Enough to walk one page's content stream: objects, streams, optional-content layers,
// vector paths (with the current transformation matrix) and simple text.
import zlib from 'node:zlib';

// ---------- object syntax ----------

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)));

export class Lexer {
  constructor(buf, pos = 0) {
    this.buf = buf;
    this.pos = pos;
  }

  skipWs() {
    const b = this.buf;
    for (;;) {
      while (this.pos < b.length && WS.has(b[this.pos])) this.pos++;
      if (b[this.pos] === 0x25 /* % */) {
        while (this.pos < b.length && b[this.pos] !== 0x0a && b[this.pos] !== 0x0d) this.pos++;
      } else return;
    }
  }

  // Returns the next token: {t:'num'|'name'|'str'|'op'|'['|']'|'<<'|'>>'|'eof', v}
  next() {
    this.skipWs();
    const b = this.buf;
    if (this.pos >= b.length) return { t: 'eof' };
    const c = b[this.pos];
    if (c === 0x2f /* / */) {
      let s = this.pos + 1;
      let e = s;
      while (e < b.length && !WS.has(b[e]) && !DELIM.has(b[e])) e++;
      this.pos = e;
      return { t: 'name', v: decodeName(b.latin1Slice(s, e)) };
    }
    if (c === 0x28 /* ( */) return { t: 'str', v: this.readLiteral() };
    if (c === 0x3c /* < */) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return { t: '<<' };
      }
      return { t: 'str', v: this.readHex() };
    }
    if (c === 0x3e /* > */ && b[this.pos + 1] === 0x3e) {
      this.pos += 2;
      return { t: '>>' };
    }
    if (c === 0x5b) {
      this.pos++;
      return { t: '[' };
    }
    if (c === 0x5d) {
      this.pos++;
      return { t: ']' };
    }
    if (c === 0x7b || c === 0x7d) {
      this.pos++;
      return { t: 'op', v: String.fromCharCode(c) };
    }
    let s = this.pos;
    let e = s;
    while (e < b.length && !WS.has(b[e]) && !DELIM.has(b[e])) e++;
    if (e === s) e++; // stray delimiter
    this.pos = e;
    const word = b.latin1Slice(s, e);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: 'num', v: parseFloat(word) };
    return { t: 'op', v: word };
  }

  readLiteral() {
    const b = this.buf;
    this.pos++; // (
    let depth = 1;
    const out = [];
    while (this.pos < b.length) {
      let c = b[this.pos++];
      if (c === 0x5c /* \ */) {
        c = b[this.pos++];
        const map = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c };
        if (map[c] !== undefined) out.push(map[c]);
        else if (c >= 0x30 && c <= 0x37) {
          let v = c - 0x30;
          for (let i = 0; i < 2 && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; i++) {
            v = v * 8 + (b[this.pos++] - 0x30);
          }
          out.push(v & 0xff);
        } else if (c === 0x0d) {
          if (b[this.pos] === 0x0a) this.pos++;
        } else if (c === 0x0a) {
          /* line continuation */
        } else out.push(c);
        continue;
      }
      if (c === 0x28) depth++;
      if (c === 0x29 && --depth === 0) break;
      out.push(c);
    }
    return Buffer.from(out);
  }

  readHex() {
    const b = this.buf;
    this.pos++;
    let hex = '';
    while (this.pos < b.length && b[this.pos] !== 0x3e) {
      const ch = String.fromCharCode(b[this.pos++]);
      if (/[0-9a-fA-F]/.test(ch)) hex += ch;
    }
    this.pos++;
    if (hex.length % 2) hex += '0';
    return Buffer.from(hex, 'hex');
  }

  // Parses a full object (dict/array/primitive). Indirect refs become {ref:n}.
  parseValue(tok = this.next()) {
    if (tok.t === '<<') {
      const d = {};
      for (;;) {
        const k = this.next();
        if (k.t === '>>' || k.t === 'eof') return d;
        d[k.v] = this.parseValue();
      }
    }
    if (tok.t === '[') {
      const a = [];
      for (;;) {
        const t = this.next();
        if (t.t === ']' || t.t === 'eof') return a;
        a.push(this.parseValue(t));
        // collapse "n g R" into a reference
        if (a.length >= 3 && a[a.length - 1] === 'R' && typeof a[a.length - 3] === 'number') {
          const n = a[a.length - 3];
          a.splice(a.length - 3, 3, { ref: n });
        }
      }
    }
    if (tok.t === 'num') {
      // lookahead for "n g R"
      const save = this.pos;
      const t2 = this.next();
      if (t2.t === 'num') {
        const t3 = this.next();
        if (t3.t === 'op' && t3.v === 'R') return { ref: tok.v };
      }
      this.pos = save;
      return tok.v;
    }
    if (tok.t === 'op') return tok.v; // true/false/null/R
    return tok.v;
  }
}

function decodeName(s) {
  return s.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Decodes a PDF text string (UTF-16BE with BOM or PDFDocEncoding≈latin1). */
export function pdfText(buf) {
  if (!Buffer.isBuffer(buf)) return String(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const sw = Buffer.from(buf.subarray(2));
    sw.swap16();
    return sw.toString('utf16le');
  }
  return buf.toString('latin1');
}

// ---------- document ----------

export class PdfDoc {
  constructor(buf) {
    this.buf = buf;
    this.offsets = new Map();
    const re = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g;
    const text = buf.latin1Slice(0, buf.length);
    let m;
    while ((m = re.exec(text))) {
      // last definition wins (incremental updates)
      this.offsets.set(+m[1], m.index + m[0].length);
    }
    this.cache = new Map();
  }

  get(n) {
    if (n && typeof n === 'object' && 'ref' in n) n = n.ref;
    if (typeof n !== 'number') return n;
    if (this.cache.has(n)) return this.cache.get(n);
    const off = this.offsets.get(n);
    if (off === undefined) return null;
    const lx = new Lexer(this.buf, off);
    const val = lx.parseValue();
    let result = val;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      lx.skipWs();
      if (this.buf.latin1Slice(lx.pos, lx.pos + 6) === 'stream') {
        let p = lx.pos + 6;
        if (this.buf[p] === 0x0d) p++;
        if (this.buf[p] === 0x0a) p++;
        let len = this.get(val.Length);
        let end = p + (typeof len === 'number' ? len : 0);
        if (typeof len !== 'number' || this.buf.latin1Slice(end, end + 20).indexOf('endstream') < 0) {
          end = this.buf.indexOf('endstream', p, 'latin1');
        }
        Object.defineProperty(val, '__raw', { value: this.buf.subarray(p, end), enumerable: false });
      }
    }
    this.cache.set(n, result);
    return result;
  }

  // Resolves refs one level.
  r(v) {
    return v && typeof v === 'object' && 'ref' in v ? this.get(v) : v;
  }

  streamData(obj) {
    obj = this.r(obj);
    let data = obj.__raw;
    let filters = this.r(obj.Filter);
    if (!filters) return data;
    if (!Array.isArray(filters)) filters = [filters];
    for (const f of filters) {
      if (f === 'FlateDecode') data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      else if (f === 'ASCII85Decode') data = ascii85(data);
      else throw new Error('Unsupported filter ' + f);
    }
    return data;
  }

  pages() {
    const out = [];
    for (const n of this.offsets.keys()) {
      const o = this.get(n);
      if (o && typeof o === 'object' && o.Type === 'Page') out.push(o);
    }
    return out;
  }
}

function ascii85(buf) {
  const s = buf.toString('latin1').replace(/\s/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
  const out = [];
  let group = [];
  for (const ch of s) {
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Buffer.from(out);
}

// ---------- fonts (enough to decode label text) ----------

const GLYPH_ASCII = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&',
  quotesingle: "'", quoteright: '’', parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',',
  hyphen: '-', period: '.', slash: '/', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=',
  greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']',
  underscore: '_', quoteleft: '‘', endash: '–', emdash: '—', quotedblleft: '“', quotedblright: '”',
  guillemotleft: '«', guillemotright: '»', nbspace: ' ', uni00A0: ' ',
};

function glyphToChar(name) {
  if (/^uni[0-9A-Fa-f]{4}$/.test(name)) return String.fromCharCode(parseInt(name.slice(3), 16));
  if (/^u[0-9A-Fa-f]{4,6}$/.test(name)) return String.fromCodePoint(parseInt(name.slice(1), 16));
  if (/^[A-Za-z]$/.test(name)) return name;
  if (GLYPH_ASCII[name]) return GLYPH_ASCII[name];
  const base = name.split('.')[0];
  if (base !== name) return glyphToChar(base);
  return '';
}

function parseToUnicode(data) {
  const map = new Map();
  const s = data.toString('latin1');
  const hex = (h) => parseInt(h, 16);
  const u16 = (h) => {
    const b = Buffer.from(h, 'hex');
    const sw = Buffer.from(b);
    if (sw.length % 2 === 0) {
      sw.swap16();
      return sw.toString('utf16le');
    }
    return b.toString('latin1');
  };
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(hex(m[1]), u16(m[2]));
  }
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = hex(m[1]);
      const hi = hex(m[2]);
      if (m[4]) {
        const start = hex(m[4]);
        for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(start + (c - lo)));
      } else {
        const arr = [...m[5].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => u16(x[1]));
        for (let c = lo; c <= hi; c++) map.set(c, arr[c - lo] ?? '');
      }
    }
  }
  return map;
}

export function makeFont(doc, fontObj) {
  const f = doc.r(fontObj) || {};
  const toUni = f.ToUnicode ? parseToUnicode(doc.streamData(f.ToUnicode)) : null;
  const diff = new Map();
  const enc = doc.r(f.Encoding);
  if (enc && typeof enc === 'object' && Array.isArray(enc.Differences)) {
    let code = 0;
    for (const v of enc.Differences) {
      if (typeof v === 'number') code = v;
      else diff.set(code++, glyphToChar(v));
    }
  }
  const widths = Array.isArray(doc.r(f.Widths)) ? doc.r(f.Widths) : null;
  const first = f.FirstChar ?? 0;
  return {
    decode(buf) {
      let s = '';
      for (const c of buf) {
        if (toUni && toUni.has(c)) s += toUni.get(c);
        else if (diff.has(c)) s += diff.get(c);
        else if (c >= 0x20 && c < 0x7f) s += String.fromCharCode(c);
        else s += Buffer.from([c]).toString('latin1');
      }
      return s;
    },
    width(buf) {
      if (!widths) return buf.length * 500;
      let w = 0;
      for (const c of buf) w += widths[c - first] ?? 500;
      return w;
    },
  };
}

// ---------- content stream interpreter ----------

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Walks a page content stream and reports painted paths and text runs, each tagged
 * with the innermost optional-content layer name.
 * Paths: {layer, op, fill, stroke, lineWidth, subpaths:[[{cmd:'M'|'L'|'C', pts:[[x,y],...]}, ...], closed]}
 * Text:  {layer, text, x, y, size}
 */
export function interpretPage(doc, page) {
  const res = doc.r(page.Resources) || {};
  const props = doc.r(res.Properties) || {};
  const fontsDict = doc.r(res.Font) || {};
  const fonts = {};
  for (const [k, v] of Object.entries(fontsDict)) fonts[k] = makeFont(doc, v);
  const layerName = (mc) => {
    const o = doc.r(props[mc]);
    if (!o) return mc;
    if (o.Type === 'OCG') return pdfText(o.Name);
    if (o.OCGs) {
      const ocg = doc.r(Array.isArray(o.OCGs) ? o.OCGs[0] : o.OCGs);
      return ocg ? pdfText(ocg.Name) : mc;
    }
    return o.Name ? pdfText(o.Name) : mc;
  };

  let contents = doc.r(page.Contents);
  const parts = Array.isArray(contents) ? contents.map((c) => doc.streamData(c)) : [doc.streamData(contents)];
  const data = Buffer.concat(parts.flatMap((p) => [p, Buffer.from('\n')]));

  const paths = [];
  const texts = [];
  const lx = new Lexer(data);
  let ops = [];
  let gs = { ctm: [1, 0, 0, 1, 0, 0], fill: null, stroke: null, lw: 1 };
  const gstack = [];
  const layers = [];
  let cur = []; // current path: subpaths
  let sub = null;
  let cp = [0, 0];
  // text state
  let tm = null;
  let tlm = null;
  let font = null;
  let fsize = 1;
  let leading = 0;
  let tc = 0;
  let tw = 0;
  let th = 1;

  const topLayer = () => {
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i]) return layers[i];
    return null;
  };
  const outerLayer = () => layers.find((l) => l) || null;
  const pt = (x, y) => apply(gs.ctm, x, y);
  const startSub = (p) => {
    sub = { segs: [{ cmd: 'M', pts: [p] }], closed: false };
    cur.push(sub);
  };
  const color = (args, space) => {
    if (space === 'g') return [args[0], args[0], args[0]];
    if (space === 'rg') return args.slice(0, 3);
    if (space === 'k') {
      const [c, m, y, k] = args;
      return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
    }
    if (args.length === 4) return color(args, 'k');
    if (args.length === 3) return args.slice(0, 3);
    if (args.length === 1) return [args[0], args[0], args[0]];
    return null;
  };
  const paint = (op) => {
    const doFill = /^(f|F|f\*|B|B\*|b|b\*)$/.test(op);
    const doStroke = /^(S|s|B|B\*|b|b\*)$/.test(op);
    if (/^(s|b|b\*)$/.test(op) && sub) sub.closed = true;
    if (cur.length && (doFill || doStroke)) {
      paths.push({
        layer: topLayer(),
        outer: outerLayer(),
        op,
        fill: doFill ? gs.fill : null,
        stroke: doStroke ? gs.stroke : null,
        lineWidth: gs.lw * Math.hypot(gs.ctm[0], gs.ctm[1]),
        evenOdd: op.endsWith('*'),
        subpaths: cur,
      });
    }
    cur = [];
    sub = null;
  };
  const showText = (buf) => {
    if (!tm || !font) return;
    const trm = mul([fsize * th, 0, 0, fsize, 0, tm[5] === undefined ? 0 : 0], mul(tm, gs.ctm));
    const [x, y] = [trm[4], trm[5]];
    const size = Math.hypot(trm[2], trm[3]);
    const text = font.decode(buf);
    const adv = (font.width(buf) / 1000) * fsize + tc * buf.length + tw * (text.split(' ').length - 1);
    texts.push({ layer: topLayer(), outer: outerLayer(), text, x, y, size, adv: adv * th * Math.hypot(tm[0], tm[1]) * Math.hypot(gs.ctm[0], gs.ctm[1]) });
    tm = mul([1, 0, 0, 1, adv * th, 0], tm);
  };

  for (;;) {
    const tok = lx.next();
    if (tok.t === 'eof') break;
    if (tok.t !== 'op') {
      if (tok.t === '[' || tok.t === '<<') ops.push(lx.parseValue(tok));
      else ops.push(tok.v);
      continue;
    }
    const op = tok.v;
    const a = ops;
    ops = [];
    switch (op) {
      case 'q':
        gstack.push({ ...gs });
        break;
      case 'Q':
        gs = gstack.pop() || gs;
        break;
      case 'cm':
        gs.ctm = mul(a.slice(0, 6), gs.ctm);
        break;
      case 'w':
        gs.lw = a[0];
        break;
      case 'g': case 'rg': case 'k':
        gs.fill = color(a, op);
        break;
      case 'G': case 'RG': case 'K':
        gs.stroke = color(a, op.toLowerCase());
        break;
      case 'sc': case 'scn':
        gs.fill = color(a.filter((x) => typeof x === 'number'));
        break;
      case 'SC': case 'SCN':
        gs.stroke = color(a.filter((x) => typeof x === 'number'));
        break;
      case 'm':
        cp = pt(a[0], a[1]);
        startSub(cp);
        break;
      case 'l':
        if (!sub) startSub(cp);
        cp = pt(a[0], a[1]);
        sub.segs.push({ cmd: 'L', pts: [cp] });
        break;
      case 'c':
        if (!sub) startSub(cp);
        sub.segs.push({ cmd: 'C', pts: [pt(a[0], a[1]), pt(a[2], a[3]), (cp = pt(a[4], a[5]))] });
        break;
      case 'v': {
        if (!sub) startSub(cp);
        const c1 = cp;
        sub.segs.push({ cmd: 'C', pts: [c1, pt(a[0], a[1]), (cp = pt(a[2], a[3]))] });
        break;
      }
      case 'y': {
        if (!sub) startSub(cp);
        const end = pt(a[2], a[3]);
        sub.segs.push({ cmd: 'C', pts: [pt(a[0], a[1]), end, end] });
        cp = end;
        break;
      }
      case 'h':
        if (sub) sub.closed = true;
        break;
      case 're': {
        const [x, y, w, h] = a;
        startSub(pt(x, y));
        sub.segs.push({ cmd: 'L', pts: [pt(x + w, y)] }, { cmd: 'L', pts: [pt(x + w, y + h)] }, { cmd: 'L', pts: [pt(x, y + h)] });
        sub.closed = true;
        cp = pt(x, y);
        break;
      }
      case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*': case 'S': case 's':
        paint(op);
        break;
      case 'n':
        cur = [];
        sub = null;
        break;
      case 'W': case 'W*':
        break; // clipping ignored
      case 'BDC': {
        const [tag, prop] = a;
        layers.push(tag === 'OC' && typeof prop === 'string' ? layerName(prop) : null);
        break;
      }
      case 'BMC':
        layers.push(null);
        break;
      case 'EMC':
        layers.pop();
        break;
      case 'BT':
        tm = [1, 0, 0, 1, 0, 0];
        tlm = tm;
        break;
      case 'ET':
        tm = null;
        break;
      case 'Tf':
        font = fonts[a[0]] || null;
        fsize = a[1];
        break;
      case 'TL':
        leading = a[0];
        break;
      case 'Tc':
        tc = a[0];
        break;
      case 'Tw':
        tw = a[0];
        break;
      case 'Tz':
        th = a[0] / 100;
        break;
      case 'Tm':
        tm = a.slice(0, 6);
        tlm = tm;
        break;
      case 'Td':
        tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm);
        tm = tlm;
        break;
      case 'TD':
        leading = -a[1];
        tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm);
        tm = tlm;
        break;
      case 'T*':
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        break;
      case 'Tj':
        showText(a[0]);
        break;
      case "'":
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        showText(a[0]);
        break;
      case '"':
        tw = a[0];
        tc = a[1];
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        showText(a[2]);
        break;
      case 'TJ': {
        const arr = a[0] || [];
        // merge into one run: decode all strings, start position from first
        if (!tm || !font) break;
        const start = mul([fsize * th, 0, 0, fsize, 0, 0], mul(tm, gs.ctm));
        let text = '';
        let adv = 0;
        for (const el of arr) {
          if (typeof el === 'number') adv -= (el / 1000) * fsize;
          else if (Buffer.isBuffer(el)) {
            text += font.decode(el);
            adv += (font.width(el) / 1000) * fsize + tc * el.length;
          }
        }
        texts.push({
          layer: topLayer(),
          outer: outerLayer(),
          text,
          x: start[4],
          y: start[5],
          size: Math.hypot(start[2], start[3]),
          adv: adv * th * Math.hypot(tm[0], tm[1]) * Math.hypot(gs.ctm[0], gs.ctm[1]),
        });
        tm = mul([1, 0, 0, 1, adv * th, 0], tm);
        break;
      }
      case 'BI': {
        // skip inline image data
        const idx = data.indexOf('EI', lx.pos, 'latin1');
        lx.pos = idx < 0 ? data.length : idx + 2;
        break;
      }
      default:
        break;
    }
  }
  return { paths, texts };
}
