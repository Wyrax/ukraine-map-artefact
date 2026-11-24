// Tiny DOM helpers: h() builds HTML elements, s() builds SVG elements.
export const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, attrs, isSvg) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class' && !isSvg) el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const h = (tag, attrs, ...children) => append(apply(document.createElement(tag), attrs, false), children);
export const s = (tag, attrs, ...children) => append(apply(document.createElementNS(SVGNS, tag), attrs, true), children);

/** Sets attributes; numbers are rounded to 2 decimals, null removes the attribute. */
export function attrs(el, a) {
  for (const [k, v] of Object.entries(a)) {
    if (v == null) el.removeAttribute(k);
    else el.setAttribute(k, typeof v === 'number' ? Math.round(v * 100) / 100 : v);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
