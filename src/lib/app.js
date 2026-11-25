// Boots an artefact page: reads the inlined JSON (config, data, regions), mounts the map,
// the active mode's layers, the side panels, the timeline, tooltip and data table,
// and keeps everything in sync through one small state store.
import { h, s, clear, esc } from './core/dom.js';
import { createState } from './core/state.js';
import { STRINGS, pick } from './core/i18n.js';
import { formatValue } from './core/format.js';
import { prepareData, buildMeasures, domainOf, valuesOf, flowTable } from './core/data.js';
import { createMap } from './core/map.js';
import { createTooltip } from './core/tooltip.js';
import { createTimeline } from './core/timeline.js';
import { encodeSnapshot, decodeSnapshot, isSnapshotCode, textDiff, textApply } from './core/snapshot.js';
import { mountTextEditor, TEXT_FIELDS } from './core/editor.js';
import { BY_ID, REGIONS } from '../map/catalog.js';

const readJSON = (id) => JSON.parse(document.getElementById(id).textContent);
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};
/** Stable key of a side panel: its config id, else type + position. */
const panelKey = (pc, i) => pc.id || `${pc.type}-${i}`;
function storedHiddenPanels() {
  try {
    const v = JSON.parse(store.get('ua-panels') || 'null');
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
}
/** A list of strings kept in localStorage (empty when missing or unreadable). */
function storedList(k) {
  try {
    const v = JSON.parse(store.get(k) || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function boot(types = {}) {
  // a share link carries the settings in the hash: decode it (compressed, so asynchronously) before the first render
  if (isSnapshotCode(location.hash)) decodeSnapshot(location.hash).then((snap) => start(types, snap), () => start(types, null));
  else start(types, null);
}

function start({ layers: layerTypes = {}, panels: panelTypes = {} } = {}, linkSnap) {
  const root = document.getElementById('ua-app');
  const config = readJSON('ua-config');
  const raw = readJSON('ua-data');
  const regions = readJSON('ua-regions');
  const data = prepareData(raw, config);
  if (data.unmatched.length) console.warn('[ua-map] Region names not matched:', data.unmatched);
  const measures = buildMeasures(data, config);
  const opts = config.options || {};
  const modes = config.modes?.length ? config.modes : [{ id: 'default', layers: [{ type: 'choropleth', value: data.series[0].id }] }];

  // ---------- settings: defaults ← saved in this browser ← the share link (#ub-…) ----------
  const defaults = {
    period: opts.startPeriod === 'first' ? 0 : data.periods.length - 1,
    mode: modes[0].id,
    lang: opts.lang || 'uk',
    selected: [],
    // region names: "auto" = shown unless the map is phone-narrow (re-checked on resize); true / false once toggled
    labels: opts.labels ?? 'auto',
    // occupation overlays shown at start: "2014" and/or "now" (older names: options.ordlo2020, "2015")
    occupation: [].concat(opts.occupation ?? (opts.ordlo2020 ? ['2014'] : [])).map((x) => (String(x) === '2015' ? '2014' : String(x))),
    // colour preset (the picker, when on, lets the viewer change it)
    palette: opts.palette || 'green',
    // view options chosen in the block under the view tabs: { "<mode>/<layer index>/<key>": value }
    viewOpts: {},
    // side panels switched off in "Налаштування панелей" (else panels[].hidden in the config) and collapsed ones
    hiddenPanels: (config.panels || []).flatMap((pc, i) => (pc.hidden ? [panelKey(pc, i)] : [])),
    collapsedPanels: [],
    // bottom blocks ("Налаштування панелей", "Таблиця даних") open or closed, and per-panel choices
    panelCfgOpen: false,
    tableOpen: false,
    // the data table's tab: "regions" (one row per region) or "flows" (one row per pair, when the data has flows)
    tableView: 'regions',
    panelOpts: {},
    // the viewer's own versions of the page texts ("✎ Редагувати тексти"): { title: {uk?, en?}, …, updated }
    texts: {},
  };
  // the page's own texts, which the viewer's edits replace (and which link diffs are taken against)
  const baseText = (key) => (key === 'source' || key === 'updated' ? raw.meta?.[key] : config[key]);
  const TEXT_KEYS = { eyebrow: 'e', title: 't', subtitle: 's', source: 'r' };
  // short keys keep the link short; the period travels as its id so it survives months being added later
  const SNAP = { m: 'mode', p: 'period', l: 'lang', s: 'selected', n: 'labels', o: 'occupation', c: 'palette', v: 'viewOpts', h: 'hiddenPanels', k: 'collapsedPanels', g: 'panelCfgOpen', t: 'tableOpen', f: 'tableView', q: 'panelOpts' };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isFlat = (o) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.values(o).every((v) => ['string', 'number', 'boolean'].includes(typeof v));
  const strList = (v) => (Array.isArray(v) ? v.map(String) : null);
  /** Compact snapshot of the settings: only what differs from the defaults. */
  function toSnap(st) {
    const out = {};
    for (const [k, key] of Object.entries(SNAP)) {
      const v = key === 'period' ? data.periods[st.period] : st[key];
      const d = key === 'period' ? data.periods[defaults.period] : defaults[key];
      if (!same(v, d)) out[k] = v;
    }
    // edited texts: only the changed part of each, against the page's own text
    const x = {};
    for (const [key, k] of Object.entries(TEXT_KEYS)) {
      const t = st.texts?.[key];
      if (!t) continue;
      const own = baseText(key);
      const pickOwn = (l) => (own && typeof own === 'object' ? own[l] ?? '' : own ?? '');
      const per = {};
      for (const l of ['uk', 'en']) if (t[l] != null) per[l] = textDiff(pickOwn(l), t[l]);
      if (Object.keys(per).length) x[k] = per;
    }
    if (st.texts?.updated) x.u = st.texts.updated;
    if (Object.keys(x).length) out.x = x;
    return out;
  }
  /** Snapshot → state fields, dropping anything this page does not have (unknown views, months, regions…). */
  function fromSnap(o) {
    const st = {};
    if (!o || typeof o !== 'object') return st;
    if (modes.some((m) => m.id === o.m)) st.mode = o.m;
    if (o.p != null && data.periods.includes(String(o.p))) st.period = data.periods.indexOf(String(o.p));
    if (o.l === 'uk' || o.l === 'en') st.lang = o.l;
    if (strList(o.s)) st.selected = strList(o.s).filter((id) => data.regionIds.includes(id)).slice(0, opts.maxSelected ?? Infinity);
    if (o.n === 'auto' || o.n === true || o.n === false) st.labels = o.n;
    if (strList(o.o)) st.occupation = strList(o.o).filter((x) => x === '2014' || x === 'now');
    if ((config.palettes || []).some((p) => p.id === o.c)) st.palette = o.c;
    if (isFlat(o.v)) st.viewOpts = o.v;
    if (strList(o.h)) st.hiddenPanels = strList(o.h);
    if (strList(o.k)) st.collapsedPanels = strList(o.k);
    if (typeof o.g === 'boolean') st.panelCfgOpen = o.g;
    if (typeof o.t === 'boolean') st.tableOpen = o.t;
    if (o.f === 'flows' && data.flows.length) st.tableView = 'flows';
    if (o.q && typeof o.q === 'object' && !Array.isArray(o.q) && Object.values(o.q).every(isFlat)) st.panelOpts = o.q;
    if (o.x && typeof o.x === 'object') {
      const texts = {};
      for (const [key, k] of Object.entries(TEXT_KEYS)) {
        const per = o.x[k];
        if (!per || typeof per !== 'object') continue;
        const own = baseText(key);
        const pickOwn = (l) => (own && typeof own === 'object' ? own[l] ?? '' : own ?? '');
        const t = {};
        for (const l of ['uk', 'en']) {
          const v = per[l] == null ? null : textApply(pickOwn(l), per[l]); // null: the page's text changed since
          if (v != null) t[l] = String(v).slice(0, 600);
        }
        if (Object.keys(t).length) texts[key] = t;
      }
      if (typeof o.x.u === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.x.u)) texts.updated = o.x.u;
      st.texts = texts;
    }
    return st;
  }
  function storedSettings() {
    try {
      const saved = JSON.parse(store.get('ua-state') || 'null');
      if (saved) return fromSnap(saved);
    } catch {
      /* unreadable: ignore */
    }
    // what earlier versions of the page kept
    const st = {};
    if (store.get('ua-lang') === 'uk' || store.get('ua-lang') === 'en') st.lang = store.get('ua-lang');
    if ((config.palettes || []).some((p) => p.id === store.get('ua-palette'))) st.palette = store.get('ua-palette');
    if (storedHiddenPanels()) st.hiddenPanels = storedHiddenPanels();
    if (storedList('ua-panels-collapsed').length) st.collapsedPanels = storedList('ua-panels-collapsed');
    return st;
  }

  const state = createState({
    ...defaults,
    ...storedSettings(),
    ...fromSnap(linkSnap),
    hover: null,
    // a row of the flows table under the pointer: { key, from, to, toRegion } (both regions light up on the map)
    hoverFlow: null,
    playing: false,
  });

  const slot = (name) => root.querySelector(`[data-slot="${name}"]`);
  const domainCache = new Map();

  // ---------- shared context handed to every layer and panel ----------
  const ctx = {
    root,
    config,
    data,
    measures,
    regions,
    state,
    lang: () => state.get().lang,
    t: (k) => STRINGS[state.get().lang]?.[k] ?? STRINGS.uk[k] ?? k,
    pick: (v) => pick(v, state.get().lang),
    period: () => state.get().period,
    periodLabel(i) {
      const p = data.periods[i];
      const l = raw.periodLabels?.[p] ?? config.periodLabels?.[p];
      return l ? pick(l, state.get().lang) : p;
    },
    measure(id) {
      const m = measures.get(id);
      if (!m) throw new Error(`[ua-map] Unknown series or measure "${id}"`);
      return m;
    },
    label: (id) => pick(ctx.measure(id).label, state.get().lang),
    fmt: (v, id, digits) => formatValue(v, measures.get(id)?.format, state.get().lang, digits),
    fmtUnit(v, id) {
      const m = measures.get(id);
      const u = pick(m?.unit, state.get().lang);
      const txt = formatValue(v, m?.format, state.get().lang);
      return v == null || !u ? txt : `${txt} ${u}`;
    },
    regionName: (id, full = false) => pick(full ? BY_ID[id].full : BY_ID[id].short, state.get().lang),
    /** Global (all periods) domain unless options.domain = "per-period". */
    domain(ids, perPeriod = opts.domain === 'per-period') {
      const key = ids.join(',') + (perPeriod ? '@' + state.get().period : '');
      if (!domainCache.has(key)) domainCache.set(key, domainOf(measures, ids, data, perPeriod ? state.get().period : null));
      return domainCache.get(key);
    },
    values(id, perPeriod = opts.domain === 'per-period') {
      return valuesOf(ctx.measure(id), data, perPeriod ? state.get().period : null);
    },
    color: (n) => `var(--c${((Math.max(1, n) - 1) % 8) + 1})`,
    seriesColor(id) {
      const sr = data.series.find((x) => x.id === id) || data.categories.find((x) => x.id === id);
      return ctx.color(sr?.slot ?? 1);
    },
    seq: (i) => `var(--seq-${i})`,
    toggleSelect(id) {
      const sel = state.get().selected;
      const max = opts.maxSelected ?? Infinity; // any number by default; charts switch styles past 8
      const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-max);
      state.set({ selected: next });
    },
  };

  // ---------- static chrome ----------
  const tooltip = createTooltip(root);
  ctx.tooltip = tooltip;
  const map = createMap(slot('map'), ctx);
  ctx.map = map;
  const legendEl = slot('legend');
  ctx.legend = {
    nodes: [],
    add(node) {
      this.nodes.push(node);
      legendEl.appendChild(node);
    },
    clear() {
      this.nodes = [];
      clear(legendEl);
    },
  };

  function renderChrome() {
    const st = state.get();
    root.setAttribute('lang', st.lang);
    document.documentElement.setAttribute('lang', st.lang);
    const set = (name, v) => {
      const el = slot(name);
      if (!el) return;
      el.textContent = v || '';
      el.hidden = !v;
    };
    // the viewer's edited texts ("✎ Редагувати тексти") over the page's own
    const text = (key) => {
      const own = baseText(key);
      const t = st.texts?.[key];
      return t ? ctx.pick({ ...(own && typeof own === 'object' ? own : { uk: own ?? '', en: own ?? '' }), ...t }) : ctx.pick(own);
    };
    set('eyebrow', text('eyebrow'));
    set('title', text('title') || ctx.pick(data.meta.title));
    set('subtitle', text('subtitle') || ctx.pick(data.meta.subtitle));
    document.title = text('title') || document.title;

    const meta = slot('meta');
    clear(meta);
    const src = text('source');
    if (src) meta.appendChild(h('span', {}, h('span', { class: 'ua-meta__k' }, ctx.t('source') + ': '), src));
    const updated = st.texts?.updated || data.meta.updated;
    if (updated) meta.appendChild(h('span', {}, h('span', { class: 'ua-meta__k' }, ctx.t('updated') + ' '), formatDate(updated, st.lang)));

    const langEl = slot('lang');
    clear(langEl);
    langEl.setAttribute('aria-label', ctx.t('language'));
    for (const [code, txt] of [['uk', 'УКР'], ['en', 'ENG']]) {
      langEl.appendChild(h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(st.lang === code), lang: code, onclick: () => state.set({ lang: code }) }, txt));
    }

    renderPalette();
    renderPanelCfg();

    const modesEl = slot('modes');
    clear(modesEl);
    modesEl.hidden = modes.length < 2;
    modesEl.setAttribute('aria-label', ctx.t('views'));
    for (const m of modes) {
      modesEl.appendChild(
        h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(st.mode === m.id), onclick: () => state.set({ mode: m.id }) }, ctx.pick(m.label) || m.id),
      );
    }

    const tools = slot('maptools');
    clear(tools);
    tools.setAttribute('aria-label', ctx.t('mapTools'));
    tools.appendChild(chip(ctx.t('labels'), labelsOn(), () => state.set({ labels: !labelsOn() })));
    if (opts.showOccupationToggle !== false) {
      for (const o of map.occupation) {
        const on = st.occupation.includes(o.id);
        const c = chip(occLabel(o), on, () => {
          const cur = state.get().occupation;
          state.set({ occupation: cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id] });
        });
        c.title = occNote(o);
        c.disabled = map.layout === 'hex';
        tools.appendChild(c);
      }
    }
    const selectable = data.regionIds.filter((id) => data.periods.some((_, p) => data.has(id, p)));
    const max = opts.maxSelected ?? Infinity;
    if (max >= selectable.length && st.selected.length < selectable.length) tools.appendChild(h('button', { type: 'button', class: 'chip chip--ghost', onclick: () => state.set({ selected: selectable }) }, ctx.t('selectAll')));
    if (st.selected.length) tools.appendChild(h('button', { type: 'button', class: 'chip chip--ghost', onclick: () => state.set({ selected: [] }) }, `${ctx.t('clear')} (${st.selected.length})`));

    const foot = slot('footer');
    clear(foot);
    for (const n of [config.notes, data.meta.notes].flat().filter(Boolean)) foot.appendChild(h('p', {}, ctx.pick(n)));
    if (map.layout === 'geo') for (const o of map.occupation) if (st.occupation.includes(o.id)) foot.appendChild(h('p', {}, occNote(o) + '.'));
  }

  // ---------- colour preset picker (options.palettePicker) ----------
  const palettes = config.palettes || [];
  const applyPalette = (id) => {
    if (palettes.length) document.documentElement.setAttribute('data-palette', id);
  };
  /** Swatch cells carrying both theme colours; CSS shows the one for the current theme. */
  const swatches = (cls, light, dark) => h('span', { class: cls, 'aria-hidden': 'true' }, light.map((c, i) => h('i', { style: `--l:${c};--d:${dark[i]}` })));
  function renderPalette() {
    const el = slot('palette');
    if (!el) return;
    el.hidden = !palettes.length;
    if (!palettes.length) return;
    const st = state.get();
    const wasOpen = el.open;
    clear(el);
    const cur = palettes.find((p) => p.id === st.palette) || palettes[0];
    const five = (a) => [0, 2, 3, 4, 6].map((i) => a[i]);
    el.appendChild(h('summary', { class: 'pal__btn' }, swatches('pal__sw', five(cur.light.seq), five(cur.dark.seq)), h('span', {}, `${ctx.t('palette')}: `), h('b', {}, ctx.pick(cur.name))));
    const menu = h('div', { class: 'pal__menu', role: 'group', 'aria-label': ctx.t('palette') });
    for (const p of palettes) {
      const pick = () => {
        el.open = false;
        state.set({ palette: p.id });
      };
      menu.appendChild(
        h(
          'button',
          { type: 'button', class: 'pal__opt', 'aria-pressed': String(p.id === cur.id), onclick: pick },
          swatches('pal__sw pal__sw--ramp', p.light.seq, p.dark.seq),
          swatches('pal__dots', p.light.cat, p.dark.cat),
          h('span', { class: 'pal__name' }, ctx.pick(p.name)),
        ),
      );
    }
    el.appendChild(menu);
    el.open = wasOpen;
  }
  document.addEventListener('click', (e) => {
    const el = slot('palette');
    if (el?.open && !el.contains(e.target)) el.open = false;
  });
  document.addEventListener('keydown', (e) => {
    const el = slot('palette');
    if (e.key === 'Escape' && el?.open) {
      el.open = false;
      el.querySelector('summary')?.focus();
    }
  });

  const occLabel = (o) => (o.id === '2014' ? ctx.t('occ2014') : `${ctx.t('occNow')} (${o.labelYear || (o.asOf || '').slice(0, 4)})`);
  const occNote = (o) => (o.id === '2014' ? ctx.t('occ2014Note') : ctx.t('occNowNote').replace('{date}', o.asOf ? formatDate(o.asOf, state.get().lang) : '—'));
  const showOccupation = (ids) => {
    for (const o of map.occupation) root.classList.toggle(`show-occ-${o.id}`, ids.includes(o.id));
  };
  const chip = (label, on, onclick) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!on), onclick }, h('span', { class: 'chip__dot', 'aria-hidden': 'true' }), label);

  // ---------- mode (map layers) ----------
  let active = [];
  let activeMode = null;
  function mountMode() {
    for (const l of active) l.destroy?.();
    active = [];
    for (const g of Object.values(map.layers)) clear(g);
    ctx.legend.clear();
    activeMode = modes.find((m) => m.id === state.get().mode) || modes[0];
    map.setLayout(activeMode.layout || 'geo');
    root.classList.toggle('is-hex', map.layout === 'hex');
    map.glyphScale = optValue('*', 'glyphScale', 1);
    // one "values" switch per view (the first layer that offers it); every layer that can show numbers follows it,
    // so e.g. the progress rings put the numbers inside themselves
    let modeValues;
    for (const [li, lc] of (activeMode.layers || []).entries()) {
      const o = layerOptions(lc).find((x) => x.key === 'values');
      if (o) {
        modeValues = optValue(li, 'values', o.default);
        break;
      }
    }
    for (const [li, lc] of (activeMode.layers || []).entries()) {
      const type = layerTypes[lc.type];
      if (!type) {
        console.warn(`[ua-map] Layer type "${lc.type}" is not bundled`);
        continue;
      }
      // the layer's config with the viewer's view options applied on top
      const cfg = { ...lc };
      for (const o of layerOptions(lc)) cfg[o.key] = o.key === 'values' && modeValues !== undefined ? modeValues : optValue(li, o.key, o.default);
      active.push({ ...type.mount(ctx, cfg), config: lc });
    }
    renderLabels();
    renderViewOpts();
  }

  // ---------- view options: per-view settings under the view tabs ----------
  const optKey = (li, key) => `${activeMode.id}/${li}/${key}`;
  function optValue(li, key, dflt) {
    const v = state.get().viewOpts[optKey(li, key)];
    return v === undefined ? dflt : v;
  }
  const layerOptions = (lc) => layerTypes[lc.type]?.options?.(lc, { layout: map.layout, measure: ctx.measure }) || [];
  const GLYPH_SIZES = [0.8, 1, 1.25];
  function renderViewOpts() {
    const el = slot('viewopts');
    if (!el) return;
    clear(el);
    const groups = [];
    const setOpt = (li, key, v) => state.set({ viewOpts: { ...state.get().viewOpts, [optKey(li, key)]: v } });
    const group = (label, control) => h('div', { class: 'vo' }, h('span', { class: 'vo__k' }, label), control);
    let valuesShown = false; // only one layer can put numbers on the regions: offer one "values" switch per view
    (activeMode.layers || []).forEach((lc, li) => {
      for (const o of layerOptions(lc)) {
        if (o.key === 'values') {
          if (valuesShown) continue;
          valuesShown = true;
        }
        const cur = optValue(li, o.key, o.default);
        if (o.type === 'toggle') {
          groups.push(chip(ctx.pick(o.label), !!cur, () => setOpt(li, o.key, !cur)));
        } else {
          const seg = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': ctx.pick(o.label) });
          for (const c of o.choices) {
            seg.appendChild(h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(c.value === cur), onclick: () => setOpt(li, o.key, c.value) }, ctx.pick(c.label)));
          }
          groups.push(group(ctx.pick(o.label), seg));
        }
      }
    });
    // every view with glyphs on the regions can make them smaller or larger
    if (active.some((l) => l.glyph)) {
      const cur = optValue('*', 'glyphScale', 1);
      const seg = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': ctx.t('glyphSize') });
      ['S', 'M', 'L'].forEach((txt, i) => {
        seg.appendChild(h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(GLYPH_SIZES[i] === cur), onclick: () => setOpt('*', 'glyphScale', GLYPH_SIZES[i]) }, txt));
      });
      groups.push(group(ctx.t('glyphSize'), seg));
    }
    el.hidden = !groups.length;
    el.setAttribute('aria-label', ctx.t('viewOptions'));
    for (const g of groups) el.appendChild(g);
  }
  const activeMeasureIds = () => [...new Set(active.flatMap((l) => l.measures || []))];
  const primaryMeasure = () => activeMeasureIds()[0] || data.series[0].id;

  const LABELS_MIN_WIDTH = 400; // px of map width below which "auto" hides the names
  const mapWidth = () => slot('map').getBoundingClientRect().width || 800;
  const labelsOn = () => {
    const v = state.get().labels;
    return v === 'auto' ? mapWidth() >= LABELS_MIN_WIDTH : !!v;
  };
  function renderLabels() {
    const st = state.get();
    const hasGlyph = active.some((l) => l.glyph);
    // numbers on the regions come from the layer that asks for them ("Цифри на областях", "Цифри")
    // …unless a glyph layer draws them itself (progress rings: inside the ring)
    const vid = active.some((l) => l.valuesInside) ? null : active.find((l) => l.labelValue)?.labelValue;
    const withOffset = active.find((l) => l.labelOffset);
    map.renderLabels({
      show: labelsOn(),
      lang: st.lang,
      offset: hasGlyph ? map.glyphSize() / 2 : 0,
      offsetFor: withOffset ? (id) => withOffset.labelOffset(id) : null,
      value: vid ? (id) => (ctx.measure(vid).get(id, st.period) == null ? '' : ctx.fmt(ctx.measure(vid).get(id, st.period), vid)) : null,
    });
  }

  function updateAria() {
    const st = state.get();
    const pm = primaryMeasure();
    for (const el of map.svg.querySelectorAll('.region[data-region]')) {
      const id = el.getAttribute('data-region');
      const v = ctx.measure(pm).get(id, st.period);
      el.setAttribute('aria-label', `${ctx.regionName(id, true)}: ${v == null ? ctx.t('noData') : ctx.fmtUnit(v, pm)}`);
      el.setAttribute('aria-pressed', String(st.selected.includes(id)));
    }
    map.svg.setAttribute('aria-label', `${ctx.pick(config.title)} — ${ctx.periodLabel(st.period)}`);
  }

  // ---------- panels ----------
  let panels = [];
  const panelTitle = (pc) => ctx.pick(pc.title) || panelTypes[pc.type]?.title?.(ctx, pc) || '';
  function mountPanels() {
    for (const p of panels) p.destroy?.();
    panels = [];
    const host = slot('panels');
    clear(host);
    const hidden = state.get().hiddenPanels;
    for (const [i, pc] of (config.panels || []).entries()) {
      const type = panelTypes[pc.type];
      if (!type) {
        console.warn(`[ua-map] Panel type "${pc.type}" is not bundled`);
        continue;
      }
      const key = panelKey(pc, i);
      if (hidden.includes(key)) continue;
      const body = h('div', { class: 'panel__body' });
      const title = panelTitle(pc) || pc.type;
      // collapsible like the data table: the title is the toggle; collapsed panels are part of the saved settings
      const sec = h(
        'details',
        { class: `ua-card panel panel--${pc.type}`, open: !state.get().collapsedPanels.includes(key) },
        h('summary', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, title)),
        body,
      );
      host.appendChild(sec);
      const entry = { ...type.mount(body, ctx, { ...pc, _key: key }), sec, key };
      sec.addEventListener('toggle', () => {
        const list = state.get().collapsedPanels.filter((k) => k !== key);
        state.set({ collapsedPanels: sec.open ? list : [...list, key] });
        if (sec.open) entry.resize?.(); // drawn while closed at a guessed width
      });
      panels.push(entry);
    }
    host.hidden = !panels.length;
    root.classList.toggle('no-panels', !panels.length);
  }

  // ---------- panel settings: show / hide each side panel ----------
  function renderPanelCfg() {
    const el = slot('panelcfg');
    if (!el) return;
    const list = (config.panels || []).map((pc, i) => ({ pc, key: panelKey(pc, i) })).filter(({ pc }) => panelTypes[pc.type]);
    el.hidden = opts.panelSettings === false || !list.length;
    if (el.hidden) return;
    const { hiddenPanels } = state.get();
    const shown = list.filter(({ key }) => !hiddenPanels.includes(key)).length;
    clear(el);
    el.appendChild(h('summary', {}, `${ctx.t('panelSettings')} · ${shown}/${list.length}`));
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': ctx.t('panelSettings') });
    for (const { pc, key } of list) {
      chips.appendChild(
        chip(panelTitle(pc) || pc.type, !hiddenPanels.includes(key), () => {
          const cur = state.get().hiddenPanels;
          state.set({ hiddenPanels: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] });
        }),
      );
    }
    if (shown < list.length) chips.appendChild(h('button', { type: 'button', class: 'chip chip--ghost', onclick: () => state.set({ hiddenPanels: [] }) }, ctx.t('showAllPanels')));
    el.appendChild(h('div', { class: 'ua-panelcfg__body' }, h('p', { class: 'ua-panelcfg__hint' }, ctx.t('panelSettingsHint')), chips));
    el.open = state.get().panelCfgOpen;
  }

  // ---------- data table ----------
  // Two tabs when the data has flows: "Області" (one row per region; with flows also outflow, inflow and net) and
  // "Потоки" (one row per pair). Both follow the timeline and sort by any column.
  const tableEl = slot('table');
  const hasFlows = data.flows.length > 0;
  let sortKey = null; // regions tab: -1 = name, else a column index
  let sortDir = -1;
  let flowSort = { key: 'value', dir: -1 }; // flows tab
  const num = (v) => formatValue(v, 'number', state.get().lang);
  const signed = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + num(v));
  const sortTh = (label, active, dir, isNum, onSort) =>
    h('th', { scope: 'col', class: isNum ? 'num' : '', 'aria-sort': active ? (dir > 0 ? 'ascending' : 'descending') : null },
      h('button', { type: 'button', class: 'th-sort', onclick: () => { onSort(); renderTable(); tableEl.open = true; } }, label));

  function renderTable() {
    const st = state.get();
    clear(tableEl);
    tableEl.appendChild(h('summary', {}, ctx.t('table') + ' · ' + ctx.periodLabel(st.period)));
    const ft = hasFlows ? flowTable(data, st.period) : null;
    const view = hasFlows && st.tableView === 'flows' ? 'flows' : 'regions';
    if (hasFlows) {
      const tabs = [['regions', ctx.t('tableRegions')], ['flows', `${ctx.t('tableFlows')} · ${ft.pairs.length}`]];
      tableEl.appendChild(h('div', { class: 'ua-table__bar' },
        h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': ctx.t('table') },
          tabs.map(([v, txt]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(view === v), onclick: () => state.set({ tableView: v, hoverFlow: null }) }, txt)))));
    }
    const table = view === 'flows' ? flowsTable(st, ft) : regionsTable(st, ft);
    tableEl.appendChild(h('div', { class: 'ua-table__scroll' }, table));
  }

  function regionsTable(st, ft) {
    const ids = [...new Set([...activeMeasureIds(), ...data.series.map((x) => x.id), ...(config.measures || []).map((x) => x.id)])];
    const cols = ids.map((m) => ({ label: ctx.label(m), get: (id) => ctx.measure(m).get(id, st.period), fmt: (v) => ctx.fmt(v, m), nat: ctx.measure(m).nat(st.period) }));
    if (ft) {
      // a region with no flows in this period gets dashes, not zeros
      const fl = (id) => ft.byRegion.get(id);
      const sum = (k) => [...ft.byRegion.values()].reduce((a, x) => a + x[k], 0);
      cols.push({ label: ctx.t('flowOut'), get: (id) => fl(id)?.out ?? null, fmt: num, nat: sum('out') });
      if (ft.toRegions) {
        cols.push({ label: ctx.t('flowIn'), get: (id) => fl(id)?.in ?? null, fmt: num, nat: sum('in') });
        cols.push({ label: ctx.t('flowNet'), get: (id) => (fl(id) ? fl(id).in - fl(id).out : null), fmt: signed, nat: sum('in') - sum('out') });
      }
    }
    const rows = REGIONS.map((r) => ({ id: r.id, name: ctx.regionName(r.id, true), vals: cols.map((c) => c.get(r.id)) }));
    if (sortKey != null && sortKey < cols.length) {
      rows.sort((a, b) => (sortKey === -1 ? a.name.localeCompare(b.name, st.lang) * -sortDir : ((a.vals[sortKey] ?? -Infinity) - (b.vals[sortKey] ?? -Infinity)) * sortDir));
    } else rows.sort((a, b) => a.name.localeCompare(b.name, st.lang));
    const th = (label, key, isNum) => sortTh(label, sortKey === key, sortDir, isNum, () => { sortDir = sortKey === key ? -sortDir : -1; sortKey = key; });
    return h('table', { class: 'ua-table' },
      h('thead', {}, h('tr', {}, th(ctx.t('region'), -1, false), cols.map((c, i) => th(c.label, i, true)))),
      h('tbody', {}, rows.map((r) => h('tr', { 'data-region': r.id }, h('th', { scope: 'row' }, r.name), r.vals.map((v, i) => h('td', { class: 'num' }, cols[i].fmt(v)))))),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, ctx.t('ukraine')), cols.map((c) => h('td', { class: 'num' }, c.fmt(c.nat))))),
    );
  }

  function flowsTable(st, ft) {
    // shares always with one decimal ("6,0 %" under "7,7 %"), so the column lines up
    const pctFmt = new Intl.NumberFormat(st.lang === 'en' ? 'en-GB' : 'uk-UA', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const pct1 = (v) => (v == null ? '—' : pctFmt.format(v));
    const target = (f) => (f.toRegion ? ctx.regionName(f.to) : ctx.pick(data.categories.find((c) => c.id === f.to)?.label) || f.to);
    const seriesName = (sid) => (sid == null ? '—' : ctx.pick(data.series.find((x) => x.id === sid)?.label) || sid);
    const cols = [
      { key: 'from', label: ctx.t('from'), text: (f) => ctx.regionName(f.from) },
      { key: 'to', label: ctx.t('to'), text: target },
      ...(ft.hasSeries ? [{ key: 'series', label: ctx.t('flowSeries'), text: (f) => seriesName(f.series) }] : []),
      { key: 'value', label: ctx.t('flowValue'), num: (f) => f.value, fmt: num },
      { key: 'share', label: ctx.t('flowShare'), num: (f) => (ft.total ? f.value / ft.total : null), fmt: pct1 },
    ];
    const col = cols.find((c) => c.key === flowSort.key) || cols.find((c) => c.key === 'value');
    const cmp = (a, b) => (col.text ? col.text(a).localeCompare(col.text(b), st.lang) : (col.num(a) ?? -Infinity) - (col.num(b) ?? -Infinity));
    // ties (same number, same source) keep a stable order: by source, then by target
    const tie = (a, b) => ctx.regionName(a.from).localeCompare(ctx.regionName(b.from), st.lang) || target(a).localeCompare(target(b), st.lang);
    const rows = [...ft.pairs].sort((a, b) => cmp(a, b) * flowSort.dir || tie(a, b));
    const th = (c) => sortTh(c.label, col === c, flowSort.dir, !!c.num, () => { flowSort = { key: c.key, dir: flowSort.key === c.key ? -flowSort.dir : c.num ? -1 : 1 }; });
    const body = rows.length
      ? rows.map((f) => h('tr', { 'data-flow': f.key }, cols.map((c, i) => (c.num ? h('td', { class: 'num' }, c.fmt(c.num(f))) : i === 0 ? h('th', { scope: 'row' }, c.text(f)) : h('td', {}, c.text(f))))))
      : [h('tr', {}, h('td', { colspan: String(cols.length), class: 'ua-table__empty' }, ctx.t('noData')))];
    const tbody = h('tbody', {}, body);
    // pointing at a row lights up both regions (and that arrow on the flow map)
    const rowOf = (el) => el?.closest?.('tr[data-flow]');
    tbody.addEventListener('pointerover', (e) => {
      const tr = rowOf(e.target);
      const f = tr && ft.pairs.find((x) => x.key === tr.getAttribute('data-flow'));
      if (f && state.get().hoverFlow?.key !== f.key) state.set({ hoverFlow: { key: f.key, from: f.from, to: f.to, toRegion: f.toRegion } });
    });
    tbody.addEventListener('pointerout', (e) => {
      const tr = rowOf(e.target);
      if (tr && tr !== rowOf(e.relatedTarget)) state.set({ hoverFlow: null });
    });
    const foot = cols.map((c, i) => {
      if (i === 0) return h('th', { scope: 'row' }, ctx.t('flowTotal'));
      if (c.key === 'value') return h('td', { class: 'num' }, num(ft.total));
      if (c.key === 'share') return h('td', { class: 'num' }, ft.total ? formatValue(1, 'pct', st.lang) : '—');
      return h('td', {});
    });
    return h('table', { class: 'ua-table ua-table--flows' }, h('thead', {}, h('tr', {}, cols.map(th))), tbody, h('tfoot', {}, h('tr', {}, foot)));
  }

  // ---------- highlight & tooltip ----------
  let lastHover = null;
  function applyHighlight() {
    const { hover, hoverFlow, selected } = state.get();
    // a region under the pointer, or both ends of a row in the flows table
    const hot = hover ? [hover] : hoverFlow ? [hoverFlow.from, ...(hoverFlow.toRegion ? [hoverFlow.to] : [])] : [];
    root.classList.toggle('has-hover', hot.length > 0);
    root.classList.toggle('has-selection', selected.length > 0);
    for (const el of root.querySelectorAll('.is-hover')) el.classList.remove('is-hover');
    for (const el of root.querySelectorAll('.is-selected')) el.classList.remove('is-selected');
    for (const id of hot) {
      for (const el of root.querySelectorAll(`[data-region="${id}"]`)) el.classList.add('is-hover');
      // raise hovered geo shape so its outline is not covered by neighbours; keep city circles on top
      if (map.layout === 'geo') {
        for (const el of map.regionEls(id)) if (!el.classList.contains('region--city')) el.parentNode.appendChild(el);
        for (const el of map.svg.querySelectorAll('.geo .region--city')) el.parentNode.appendChild(el);
      }
    }
    if (hoverFlow) for (const el of root.querySelectorAll(`tr[data-flow="${CSS.escape(hoverFlow.key)}"]`)) el.classList.add('is-hover');
    for (const id of selected) for (const el of root.querySelectorAll(`[data-region="${id}"]`)) el.classList.add('is-selected');
  }

  function regionTip(id) {
    const st = state.get();
    const ids = activeMeasureIds();
    const has = data.has(id, st.period);
    let html = `<div class="tip__h"><b>${esc(ctx.regionName(id, true))}</b><span>${esc(ctx.periodLabel(st.period))}</span></div>`;
    if (!has) return html + `<div class="tip__muted">${esc(ctx.t('noData'))}</div>`;
    html += '<table class="tip__rows">';
    for (const m of ids) {
      const ms = ctx.measure(m);
      const v = ms.get(id, st.period);
      const sw = ms.slot ? `<i class="tip__sw" style="--sw:${ctx.color(ms.slot)}"></i>` : '';
      const share = ms.additive && ids.length === 1 ? ms.nat(st.period) : 0;
      html += `<tr><th>${sw}${esc(ctx.label(m))}</th><td>${esc(ctx.fmtUnit(v, m))}${share && v != null ? `<small>${esc(formatValue(v / share, 'pct', st.lang, 1))}</small>` : ''}</td></tr>`;
    }
    html += '</table>';
    if (data.hasTime && ids[0]) html += sparkline(ids[0], id);
    return html;
  }

  function sparkline(mid, id) {
    const ms = ctx.measure(mid);
    const vals = data.periods.map((_, p) => ms.get(id, p));
    const ok = vals.filter((v) => v != null);
    if (ok.length < 2) return '';
    const [lo, hi] = [Math.min(0, ...ok), Math.max(...ok)];
    const W = 168;
    const H = 34;
    const x = (i) => 3 + (i / (vals.length - 1)) * (W - 6);
    const y = (v) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
    let d = '';
    vals.forEach((v, i) => {
      if (v == null) return;
      d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    });
    const p = state.get().period;
    const cur = vals[p];
    return `<svg class="tip__spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" class="spark-line"/>${cur != null ? `<circle cx="${x(p).toFixed(1)}" cy="${y(cur).toFixed(1)}" r="3" class="spark-dot"/>` : ''}</svg>`;
  }

  let regionTipShown = false;
  function setHover(id, el, evt) {
    state.set({ hover: id });
    lastHover = id;
    if (el?.hasAttribute('data-owntip')) {
      regionTipShown = false;
      return; // the panel draws its own tooltip for this mark
    }
    regionTipShown = false;
    if (!id) return tooltip.hide();
    const inMap = el && el.closest('.ua-mapframe');
    if (!inMap && !el?.hasAttribute('data-tip')) return tooltip.hide();
    regionTipShown = true;
    if (evt && evt.clientX != null && evt.pointerType !== undefined) tooltip.show(regionTip(id), evt.clientX, evt.clientY);
    else if (el) tooltip.showAt(regionTip(id), el);
  }

  const regionOf = (t) => t?.closest?.('[data-region]');
  root.addEventListener('pointerover', (e) => {
    const el = regionOf(e.target);
    if (el && root.contains(el)) setHover(el.getAttribute('data-region'), el, e);
  });
  root.addEventListener('pointerout', (e) => {
    const el = regionOf(e.target);
    const to = regionOf(e.relatedTarget);
    if (el && (!to || to.getAttribute('data-region') !== el.getAttribute('data-region'))) setHover(null);
  });
  root.addEventListener('pointermove', (e) => {
    if (regionTipShown && !tooltip.el.hidden) tooltip.move(e.clientX, e.clientY);
  });
  root.addEventListener('click', (e) => {
    const pe = e.target.closest?.('[data-period]');
    if (pe && root.contains(pe)) state.set({ period: +pe.getAttribute('data-period') });
    const el = regionOf(e.target);
    if (el && root.contains(el) && !el.closest('[data-noselect]')) ctx.toggleSelect(el.getAttribute('data-region'));
  });
  root.addEventListener('focusin', (e) => {
    const el = regionOf(e.target);
    if (el && el.hasAttribute('tabindex')) setHover(el.getAttribute('data-region'), el);
  });
  root.addEventListener('focusout', (e) => {
    if (regionOf(e.target)) setHover(null);
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el.matches?.('[data-region][tabindex]')) {
      e.preventDefault();
      ctx.toggleSelect(el.getAttribute('data-region'));
    }
    if (e.key === 'Escape') {
      tooltip.hide();
      if (state.get().selected.length) state.set({ selected: [] });
    }
  });

  // ---------- wiring ----------
  const timeline = createTimeline(slot('timeline'), ctx);
  mountMode();
  renderChrome();
  mountPanels();
  renderTable();
  updateAria();
  applyHighlight();
  showOccupation(state.get().occupation);
  applyPalette(state.get().palette);
  slot('panelcfg').open = state.get().panelCfgOpen;
  tableEl.open = state.get().tableOpen;

  state.on((st, ch) => {
    // a language change redraws everything; the branches below then only add what it does not cover
    const relang = ch.has('lang');
    if (relang) {
      renderChrome();
      renderShare();
      mountMode();
      mountPanels();
      renderTable();
      timeline.update();
      updateAria();
      applyHighlight();
    }
    if (ch.has('mode') && !relang) {
      mountMode();
      renderChrome();
      for (const p of panels) p.update?.(ch);
      renderTable();
      updateAria();
      applyHighlight();
    }
    if (ch.has('viewOpts') && !ch.has('mode') && !relang) {
      mountMode(); // redraws the current view with the chosen options (and the options block itself)
      updateAria();
      applyHighlight();
    }
    if (ch.has('period') && !relang) {
      if (opts.domain === 'per-period') domainCache.clear();
      for (const l of active) l.update?.(ch);
      for (const p of panels) p.update?.(ch);
      renderLabels();
      renderTable();
      updateAria();
      applyHighlight();
      if (lastHover && regionTipShown && !tooltip.el.hidden) tooltip.show(regionTip(lastHover));
    }
    if (ch.has('period') || ch.has('playing')) timeline.update();
    if (ch.has('hover') || ch.has('hoverFlow') || ch.has('selected')) applyHighlight();
    if (ch.has('tableView') && !relang) renderTable();
    if (ch.has('selected') && !relang) {
      for (const l of active) l.update?.(ch);
      for (const p of panels) p.update?.(ch);
      renderChrome();
      updateAria();
    }
    if (ch.has('labels') && !relang) {
      renderLabels();
      renderChrome();
    }
    if (ch.has('occupation')) {
      showOccupation(st.occupation);
      renderChrome();
    }
    if (ch.has('palette')) {
      applyPalette(st.palette);
      renderPalette();
    }
    if ((ch.has('hiddenPanels') || ch.has('panelOpts')) && !relang) {
      mountPanels();
      renderPanelCfg();
      applyHighlight();
    }
    // collapsed panels and the bottom blocks follow the settings (a link opened in this tab, "reset")
    if (ch.has('collapsedPanels')) for (const p of panels) if (p.sec.open === st.collapsedPanels.includes(p.key)) p.sec.open = !p.sec.open;
    if (ch.has('panelCfgOpen') && slot('panelcfg').open !== st.panelCfgOpen) slot('panelcfg').open = st.panelCfgOpen;
    if (ch.has('tableOpen') && tableEl.open !== st.tableOpen) tableEl.open = st.tableOpen;
    if (ch.has('texts') || Object.values(SNAP).some((k) => ch.has(k))) saveSoon();
  });

  // ---------- saving the settings and the share link ----------
  slot('panelcfg').addEventListener('toggle', () => state.set({ panelCfgOpen: slot('panelcfg').open }));
  tableEl.addEventListener('toggle', () => state.set({ tableOpen: tableEl.open }));
  // the link is encoded (and compressed) asynchronously; the field and the copy button use the latest one
  const linkBase = String(config.publishedUrl || location.href).split('#')[0];
  let latestLink = linkBase;
  let linkJob = 0;
  async function refreshLink() {
    const job = ++linkJob;
    const snap = toSnap(state.get());
    const url = Object.keys(snap).length ? `${linkBase}#${await encodeSnapshot(snap)}` : linkBase;
    if (job !== linkJob) return; // a newer change is being encoded
    latestLink = url;
    const input = slot('share')?.querySelector('input');
    if (input) input.value = url;
  }
  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store.set('ua-state', JSON.stringify(toSnap(state.get())));
      refreshLink();
    }, 300);
  }
  function resetSettings() {
    for (const k of ['ua-state', 'ua-lang', 'ua-palette', 'ua-panels', 'ua-panels-collapsed']) store.set(k, '');
    if (isSnapshotCode(location.hash)) location.hash = '';
    timeline.stop();
    state.set({ ...defaults, hover: null, hoverFlow: null });
  }
  function renderShare() {
    const el = slot('share');
    if (!el) return;
    clear(el);
    const input = h('input', { type: 'text', class: 'ua-share__url', readonly: true, value: latestLink, 'aria-label': ctx.t('shareTitle'), onfocus: (e) => e.target.select() });
    const copyBtn = h('button', { type: 'button', class: 'ua-btn' }, ctx.t('copyLink'));
    const status = h('span', { class: 'ua-share__status', role: 'status' });
    const say = (text, ok) => {
      copyBtn.textContent = ok ? text : ctx.t('copyLink');
      status.textContent = ok ? '' : text;
      clearTimeout(copyBtn._t);
      copyBtn._t = setTimeout(() => {
        copyBtn.textContent = ctx.t('copyLink');
        status.textContent = '';
      }, 4000);
    };
    copyBtn.addEventListener('click', () => {
      input.value = latestLink;
      const fallback = () => {
        input.focus();
        input.select();
        say(ctx.t('copySelect'));
      };
      try {
        navigator.clipboard.writeText(input.value).then(() => say(ctx.t('copied') + ' ✓', true), fallback);
      } catch {
        fallback();
      }
    });
    el.append(
      h('div', { class: 'ua-share__head' }, h('span', { class: 'ua-share__title' }, ctx.t('shareTitle')), h('button', { type: 'button', class: 'link-btn', onclick: resetSettings }, ctx.t('resetSettings'))),
      h('div', { class: 'ua-share__row' }, input, copyBtn),
      status,
      h('p', { class: 'ua-share__hint' }, ctx.t('shareHint')),
    );
  }
  renderShare();
  refreshLink();
  // a share link opened in a tab that already shows the page
  window.addEventListener('hashchange', async () => {
    if (!isSnapshotCode(location.hash)) return;
    const st = fromSnap(await decodeSnapshot(location.hash));
    if (Object.keys(st).length) state.set(st);
  });

  // glyph sizes and legends depend on rendered size
  let rw = 0;
  let autoLabels = labelsOn();
  new ResizeObserver(() => {
    const w = map.svg.getBoundingClientRect().width;
    if (Math.abs(w - rw) < 2) return;
    rw = w;
    for (const l of active) l.resize?.();
    for (const p of panels) p.resize?.();
    renderLabels();
    // in "auto" mode the names follow the width: keep the "Назви" chip in step
    if (labelsOn() !== autoLabels) {
      autoLabels = labelsOn();
      renderChrome();
    }
  }).observe(slot('map'));

  // ---------- the viewer's own page texts (part of the settings and the link; the artifact never changes) ----------
  const textEditor = mountTextEditor(ctx, slot('edittexts'), slot('editor'), baseText);
  state.on((st, ch) => {
    if (ch.has('texts') && !ch.has('lang')) renderChrome();
    if (ch.has('lang')) textEditor.relabel();
  });

  window.uaMap = ctx; // handy for debugging in the console
  return ctx;
}

function formatDate(iso, lang) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export { h, s };
