// Readable JSON in the layout Prettier / VS Code give data.json: 2-space indent, and any object or array that fits
// in `width` columns stays on one line ({ "uk": "…", "en": "…" }, ["UA-05", "dev", "2025-01", 123]); the rest breaks
// one entry per line. Used by the tools that write data.json so the file stays diff-friendly.

const inline = (v) => {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') {
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v) ?? 'null';
};

function format(v, indent, prefix, suffix, width) {
  const flat = inline(v);
  const isBox = v && typeof v === 'object';
  if (!isBox || indent.length + prefix.length + flat.length + suffix.length <= width) return indent + prefix + flat + suffix;
  const inner = indent + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return `${indent}${prefix}[]${suffix}`;
    const lines = v.map((x, i) => format(x, inner, '', i < v.length - 1 ? ',' : '', width));
    return `${indent}${prefix}[\n${lines.join('\n')}\n${indent}]${suffix}`;
  }
  const e = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!e.length) return `${indent}${prefix}{}${suffix}`;
  const lines = e.map(([k, x], i) => format(x, inner, `${JSON.stringify(k)}: `, i < e.length - 1 ? ',' : '', width));
  return `${indent}${prefix}{\n${lines.join('\n')}\n${indent}}${suffix}`;
}

/** JSON text with a trailing newline. */
export function prettyJSON(value, width = 80) {
  return format(value, '', '', '', width) + '\n';
}
