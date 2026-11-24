// One floating tooltip per app, positioned next to the pointer (or a focused element) and kept inside the root.
import { h } from './dom.js';

export function createTooltip(root) {
  const el = h('div', { class: 'ua-tip', role: 'status', 'aria-live': 'polite', hidden: true });
  root.appendChild(el);
  let last = [0, 0];

  function place(x, y) {
    last = [x, y];
    const rr = root.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let left = x - rr.left + 14;
    let top = y - rr.top + 14;
    if (left + tw > rr.width - 8) left = x - rr.left - tw - 14;
    if (left < 8) left = 8;
    if (top + th > rr.height - 8) top = y - rr.top - th - 14;
    if (top < 8) top = 8;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  return {
    el,
    show(html, x, y) {
      el.innerHTML = html;
      el.hidden = false;
      place(x ?? last[0], y ?? last[1]);
    },
    move(x, y) {
      if (!el.hidden) place(x, y);
    },
    showAt(html, target) {
      const b = target.getBoundingClientRect();
      this.show(html, b.left + b.width / 2, b.top + b.height / 2);
    },
    hide() {
      el.hidden = true;
    },
  };
}
