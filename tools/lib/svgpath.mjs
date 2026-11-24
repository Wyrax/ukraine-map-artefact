// Minimal SVG path reader for the generated map (M/L/C/H/V/Z, absolute and relative).
// Returns rings of points with cubic curves flattened.

export function parsePath(d, curveSteps = 8) {
  const toks = d.match(/[MmLlCcHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const rings = [];
  let ring = null;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;
  const num = () => +toks[i++];
  const isNum = () => i < toks.length && !/^[A-Za-z]$/.test(toks[i]);
  const start = () => {
    if (ring?.length) rings.push(ring);
    ring = [[x, y]];
  };
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
        x = (rel ? x : 0) + num();
        y = (rel ? y : 0) + num();
        sx = x;
        sy = y;
        start();
        cmd = rel ? 'l' : 'L'; // further pairs are implicit line-tos
        break;
      case 'L':
        x = (rel ? x : 0) + num();
        y = (rel ? y : 0) + num();
        ring.push([x, y]);
        break;
      case 'H':
        x = (rel ? x : 0) + num();
        ring.push([x, y]);
        break;
      case 'V':
        y = (rel ? y : 0) + num();
        ring.push([x, y]);
        break;
      case 'C': {
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        const p1 = [ox + num(), oy + num()];
        const p2 = [ox + num(), oy + num()];
        const p3 = [ox + num(), oy + num()];
        const p0 = [x, y];
        for (let k = 1; k <= curveSteps; k++) {
          const t = k / curveSteps;
          const u = 1 - t;
          ring.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
          ]);
        }
        [x, y] = p3;
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        if (ring?.length) rings.push(ring);
        ring = null;
        while (isNum()) i++; // numbers after Z are malformed: skip them
        break;
      default:
        throw new Error(`parsePath: unsupported command "${cmd}"`);
    }
  }
  if (ring?.length) rings.push(ring);
  return rings;
}

/** Region shapes from the generated ukraine.svg: { id: rings } (circles become 48-gons). */
export function readRegionShapes(svg) {
  const out = {};
  for (const m of svg.matchAll(/<path id="(UA-\d+)"[^>]*\sd="([^"]+)"/g)) out[m[1]] = parsePath(m[2]);
  for (const m of svg.matchAll(/<circle id="(UA-\d+)"[^>]*cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
    const [cx, cy, r] = [+m[2], +m[3], +m[4]];
    out[m[1]] = [Array.from({ length: 48 }, (_, k) => [cx + r * Math.cos((k / 48) * 2 * Math.PI), cy + r * Math.sin((k / 48) * 2 * Math.PI)])];
  }
  return out;
}
