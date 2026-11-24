// "✎ Редагувати тексти": anyone viewing can change the page texts (eyebrow, title, subtitle, source, "data as of")
// for their own view. The edits are part of the viewer's settings (state.texts): kept in this browser and carried
// in the share link like the other view settings. The artifact itself never changes.
import { h, clear } from './dom.js';

/** Editable texts: key in state.texts, where the page's own value lives, label string id, input kind. */
export const TEXT_FIELDS = [
  { key: 'eyebrow', label: 'fldEyebrow', tag: 'input' },
  { key: 'title', label: 'fldTitle', tag: 'input' },
  { key: 'subtitle', label: 'fldSubtitle', tag: 'textarea' },
  { key: 'source', label: 'fldSource', tag: 'input', meta: true },
];

/**
 * Mounts the button and the form.
 *   base(key) → the page's own {uk, en} (or date) for a field; ctx.state.texts holds the viewer's overrides.
 */
export function mountTextEditor(ctx, slotBtn, slotForm, base) {
  if (ctx.config.options?.textEditor === false) return { relabel() {} };
  const st = () => ctx.state.get().texts || {};
  const pair = (v) => (v && typeof v === 'object' ? { uk: v.uk ?? '', en: v.en ?? '' } : { uk: v ?? '', en: v ?? '' });
  let before = null;

  /** Sets one text (or the date); values equal to the page's own are dropped so they don't travel in the link. */
  function setText(key, lang, value) {
    const texts = { ...st() };
    if (key === 'updated') {
      if (!value || value === base('updated')) delete texts.updated;
      else texts.updated = value;
    } else {
      const own = pair(base(key));
      const cur = { ...pair(texts[key] ?? own), [lang]: value };
      const diff = Object.fromEntries(['uk', 'en'].filter((l) => cur[l] !== own[l]).map((l) => [l, cur[l]]));
      if (Object.keys(diff).length) texts[key] = diff;
      else delete texts[key];
    }
    ctx.state.set({ texts }); // the header re-renders and the settings (and link) are saved
  }

  function renderButton() {
    clear(slotBtn);
    slotBtn.hidden = false;
    slotBtn.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: open }, '✎ ' + ctx.t('editTexts')));
  }

  function open(keep) {
    if (!keep) before = st(); // "Скасувати" returns to the texts as they were when the form opened
    slotBtn.hidden = true;
    clear(slotForm);
    slotForm.hidden = false;
    const grid = h('div', { class: 'ua-editor__grid' }, h('span'), h('b', {}, 'Українською'), h('b', {}, 'English'));
    for (const f of TEXT_FIELDS) {
      const own = pair(base(f.key));
      const cur = { ...own, ...(st()[f.key] || {}) };
      grid.appendChild(h('label', { class: 'ua-editor__k' }, ctx.t(f.label)));
      for (const l of ['uk', 'en']) {
        const el = h(f.tag, { class: 'ua-editor__in', lang: l, 'aria-label': `${ctx.t(f.label)} (${l.toUpperCase()})`, rows: f.tag === 'textarea' ? 3 : null });
        el.value = cur[l];
        el.addEventListener('input', () => setText(f.key, l, el.value));
        grid.appendChild(el);
      }
    }
    const date = h('input', { type: 'date', class: 'ua-editor__in', 'aria-label': ctx.t('fldUpdated') });
    date.value = String(st().updated || base('updated') || '').slice(0, 10);
    date.addEventListener('input', () => setText('updated', null, date.value));
    grid.append(h('label', { class: 'ua-editor__k' }, ctx.t('fldUpdated')), date);

    const done = h('button', { type: 'button', class: 'ua-btn', onclick: close }, ctx.t('done'));
    const cancel = h('button', { type: 'button', class: 'link-btn' }, ctx.t('cancel'));
    cancel.addEventListener('click', () => {
      ctx.state.set({ texts: before });
      close();
    });
    const original = h('button', { type: 'button', class: 'link-btn' }, ctx.t('textsOriginal'));
    original.addEventListener('click', () => {
      ctx.state.set({ texts: {} });
      open(true); // refill the form with the page's own texts
    });
    slotForm.append(
      h('h2', { class: 'ua-editor__title' }, ctx.t('editTexts')),
      grid,
      h('p', { class: 'ua-editor__hint' }, ctx.t('editHint')),
      h('div', { class: 'ua-editor__actions' }, done, cancel, original),
    );
    slotForm.querySelector('input')?.focus();
  }

  function close() {
    clear(slotForm);
    slotForm.hidden = true;
    renderButton();
  }

  renderButton();
  return { relabel: () => (slotForm.hidden ? renderButton() : open(true)) };
}
