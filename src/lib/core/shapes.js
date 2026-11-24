// SVG path builders for glyphs.
const f = (v) => Math.round(v * 100) / 100;

/** Point on a circle; angle 0 = 12 o'clock, clockwise. */
export const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

/** Annular sector (pie slice when r0 = 0). Angles in radians, clockwise from 12 o'clock. */
export function arcPath(cx, cy, r0, r1, a0, a1) {
  const span = a1 - a0;
  if (span <= 1e-6 || r1 <= 0) return '';
  if (span >= Math.PI * 2 - 1e-6) {
    // full ring: two halves
    const half = a0 + Math.PI;
    return arcPath(cx, cy, r0, r1, a0, half) + arcPath(cx, cy, r0, r1, half, a0 + Math.PI * 2 - 1e-6);
  }
  const large = span > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  let d = `M${f(x0)} ${f(y0)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
  if (r0 > 0) {
    const [x2, y2] = polar(cx, cy, r0, a1);
    const [x3, y3] = polar(cx, cy, r0, a0);
    d += `L${f(x2)} ${f(y2)}A${f(r0)} ${f(r0)} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
  } else d += `L${f(cx)} ${f(cy)}Z`;
  return d;
}

/** Open arc stroke path (for progress rings / radial bars drawn as strokes). */
export function arcStroke(cx, cy, r, a0, a1) {
  const span = Math.min(a1 - a0, Math.PI * 2 - 1e-4);
  if (span <= 1e-6) return '';
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a0 + span);
  return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${span > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

/** Vertical bar growing up from baseline y0 with rounded top corners (radius rr). */
export function barUp(x, y0, w, hgt, rr = 1.5) {
  if (hgt <= 0.01) return '';
  const r = Math.min(rr, w / 2, hgt);
  const top = y0 - hgt;
  return `M${f(x)} ${f(y0)}V${f(top + r)}Q${f(x)} ${f(top)} ${f(x + r)} ${f(top)}H${f(x + w - r)}Q${f(x + w)} ${f(top)} ${f(x + w)} ${f(top + r)}V${f(y0)}Z`;
}

/** Horizontal bar growing right from x0 with rounded right corners. */
export function barRight(x0, y, len, hgt, rr = 3) {
  if (len <= 0.01) return '';
  const r = Math.min(rr, hgt / 2, len);
  const end = x0 + len;
  return `M${f(x0)} ${f(y)}H${f(end - r)}Q${f(end)} ${f(y)} ${f(end)} ${f(y + r)}V${f(y + hgt - r)}Q${f(end)} ${f(y + hgt)} ${f(end - r)} ${f(y + hgt)}H${f(x0)}Z`;
}

/** Pointy-top hexagon. */
export function hexPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    d += (i ? 'L' : 'M') + f(cx + r * Math.cos(a)) + ' ' + f(cy + r * Math.sin(a));
  }
  return d + 'Z';
}

/** Closed polygon through points. */
export const polyPath = (pts) => (pts.length ? 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z' : '');
