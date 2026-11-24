# Ukraine map artefacts

Base for interactive infographics on a map of Ukraine's 27 regions, published as **Claude Artifacts**
(one self-contained HTML page each). Vanilla JS + SVG, no runtime dependencies; esbuild is the only dev dependency.

## Commands

```
npm run build -- <slug>        # artefacts/<slug> → dist/<slug>.html (validates config ↔ data first)
npm run build -- --all         # every artefact except _template
npm run dev -- <slug> --serve  # rebuild on change + http://localhost:5173 with live reload
npm test                       # node --test (catalog, data, scales, map integrity)
npm run extract-map            # regenerate src/map/* from maps/_UKRAINE_2020.ai (git-ignored source)
npm run csv -- file.csv --out artefacts/<slug>/data.json --unit "шт."   # CSV → data.json
npm run occupation             # latest DeepStateMap snapshot → src/map/occupation.json (then rebuild + republish)
                               # add `-- --label-year 2028` to change the year on the toggle
npm run palettes               # regenerate src/lib/styles/palettes.json from tools/make-palettes.mjs
```
For the preview pane add a config to `.claude/launch.json` (copy the `showcase` one) and start it by name.

## Layout

- `src/map/catalog.js` — the 27 regions: ISO 3166-2:UA id (used everywhere), KOATUU/KATOTTG prefix, uk/en names,
  hex-map cell, aliases for matching. `matchRegion()` resolves names in any common spelling and codes.
- `src/map/ukraine.svg`, `src/map/regions.json` — **generated** by `tools/extract-map.mjs`; never edit by hand.
  regions.json: per region `anchor` (pole of inaccessibility, where glyphs go), `r` (inscribed radius), `label`
  (label point without a glyph), `glyphLabel` (`above` = name above the glyph), `capital`, `bbox`; plus `georef`
  (lat/lon → SVG, 2nd-order fit, ~3 km error). Label/glyph fixes live in `PLACEMENT` in extract-map.
- `src/map/occupation.json` — **generated** by `tools/occupation.mjs` from a DeepStateMap snapshot: `asOf`, `area`
  (hatch, even-odd) and `line` (front line only). Fitted to our outline by ICP; ≈1 unit median error on the border.
- `src/lib/app.js` — boot, state (period, mode, lang, hover, selected, labels, occupation, palette), tooltip, data table, wiring.
- `src/lib/core/` — data/measures, scales, format (Intl uk-UA/en-GB), map (geo + hex layouts), legend, timeline, shapes.
- `src/lib/layers/` — map layers; `src/lib/panels/` — side panels. Each exports `{ mount(ctx, cfg) → { update(changed), destroy?, resize?, measures, glyph? } }`.
- `src/lib/styles/base.css` — neutral tokens (light + dark), layout, components. `src/template/index.html` — page shell.
- `src/lib/styles/palettes.json` — **generated** by `tools/make-palettes.mjs`: 10 colour presets (ramp `--seq-*`, text on
  ramp `--seq-on-*`, series `--c1..8`, `--accent`, `--sel`, light + dark). build.mjs turns the chosen one into CSS.
- `tools/` — extract-map, build, csv-to-data, occupation, make-palettes; `tools/lib/pdf.mjs` is a minimal PDF/AI reader,
  `tools/lib/svgpath.mjs` reads the generated SVG paths back.
- `artefacts/<slug>/` — `artefact.json` (what to show), `data.json` (numbers), `SOURCE.md` (where the numbers came from).
  `artefacts/showcase` demos every view on synthetic data (`make-data.mjs`); `artefacts/_template` is the starting point.

## New artefact workflow

1. Get the data. CSV/Excel from the user → `npm run csv` (Excel: convert to CSV first). Liquio data → pull it with the
   Liquio connector tools and write `data.json` in the format below. Fill `SOURCE.md` (query, environment, date).
2. `cp -r artefacts/_template artefacts/<slug>`, edit `artefact.json`, replace `data.json`.
3. `npm run build -- <slug>`; fix every `!` warning (unmatched region names usually need an `alt` spelling in the catalog).
4. Look at it (preview pane or `dist/<slug>.html`): both themes, phone width, play the timeline, hover/click.
5. Publish with the Artifact tool: `file_path: dist/<slug>.html`, `icon: "map"`, one-sentence `description`.
   Store the returned URL in `artefact.json` → `publishedUrl`. Later updates: rebuild, then publish with `url` set to
   `publishedUrl` (read the artifact first if it was published in another session) so the link stays the same.

## data.json

```json
{
  "meta": { "title": {"uk": "", "en": ""}, "unit": {"uk": "шт.", "en": "pcs"}, "source": {"uk": "", "en": ""}, "updated": "2026-11-24" },
  "series": [{ "id": "pledged", "label": {"uk": "З заставою", "en": "With pledge"} }],
  "periods": ["2025-Q1", "2025-Q2"],
  "periodLabels": { "2025-Q1": {"uk": "І кв. 2025", "en": "Q1 2025"} },
  "values": { "columns": ["region", "series", "period", "value"], "rows": [["UA-05", "pledged", "2025-Q1", 123]] },
  "flows":  { "columns": ["from", "to", "period", "value"], "rows": [["UA-46", "UA-30", "2025-Q1", 9]] },
  "categories": [{ "id": "prod", "label": {"uk": "", "en": ""} }]
}
```
- `values`/`flows` may also be arrays of objects. `region` accepts ISO ids, names or codes. Duplicate rows are summed.
- `periods` optional: any ordered labels (days, months, quarters, years). One period → the timeline hides itself.
- A region with no rows for a period is "no data" (hatched), not zero. Send explicit zeros when zero is real.
- `flows.to` is a region (flow map, `sankey` with `flows: "region"`) or a `categories` id (`sankey` default).
- Keep data.json under ~100 KB (use the columnar form); larger data should be aggregated first.

## artefact.json

```json
{
  "title": {"uk": "", "en": ""}, "description": {"uk": "", "en": ""}, "eyebrow": {}, "subtitle": {},
  "measures": [{ "id": "share", "label": {}, "expr": "pledged / total", "format": "pct" }],
  "modes":  [{ "id": "map", "label": {}, "layout": "geo|hex", "layers": [ ... ] }],
  "panels": [ ... ],
  "notes":  [{"uk": "", "en": ""}],
  "options": { "lang": "uk", "domain": "global|per-period", "palette": "green", "palettePicker": false, "occupation": [],
               "interval": 1300, "labels": "auto", "glyphSize": 58 },
  "publishedUrl": null
}
```
- **Measures**: every series id, `total` (sum of all series) and derived `measures` (`+ - * / ( )`, ids or `[id-with-dashes]`).
  Derived measures are recomputed from national sums for the "Україна" line, so ratios stay correct.
  `format`: `number` | `compact` | `pct` (0..1) | `decimal`.
- **Layers** (in `modes[].layers`; several can stack, e.g. choropleth + one glyph type):
  `choropleth {value, classes=5, breaks: quantile|equal|[..]}` · `bubbles {value, slot, maxRadius}` ·
  `bars {series[]}` · `stacked {series[], mode: abs|pct}` · `pies {series[], donut, size: fixed|value}` ·
  `radial {value, max: 1|number|measureId|"domain"}` (progress ring) or `radial {series[]}` (radial bars) ·
  `radar {series[], normalize: max|share}` · `flows {series?, slot, maxWidth, curve}` (region → region arrows).
- **Panels**: `ranking {value | series[] (stacked), limit}` · `timeline-chart {value | series[], compare: selected|all}` ·
  `heatmap {value, by: period|series, series[], sort: name|value}` · `sankey {flows: series|category|region, series, limit}` ·
  `radar {series[], normalize}`. Each panel takes an optional `title`. timeline-chart has a "Вибрані / Усі регіони"
  switch: all regions as muted lines, hover names a line and highlights the region everywhere, click selects it.
- Region names (`options.labels`): "auto" (default) shows them unless the map is under 400 px wide, re-checked on
  resize; `true`/`false` force them. Name collisions are fixed in `PLACEMENT` (extract-map), checked at 420–1100 px.
- Selection (click regions, or "Вибрати всі") has no limit unless `options.maxSelected` is set. Up to 8 selected
  regions get series colours in Dynamics and the radar; with more, they become thin ink lines/outlines named on hover.
- Every layer and panel follows the timeline; domains are global across periods unless `options.domain = "per-period"`.
- A data table (sortable, current period) is always added under the map, and above it a collapsible
  "Налаштування панелей" block with a toggle per side panel (viewer's choice kept in localStorage; hiding all panels
  gives the map the full width). Every side panel is a `<details>`: its title collapses it like the table (collapsed
  panels remembered in localStorage; charts redraw at full width when reopened). `panels[].hidden: true` starts a panel hidden, `panels[].id` keeps the choice stable
  when panels are reordered, `options.panelSettings: false` removes the block.

## Map conventions

- 27 regions = 24 oblasts + AR Crimea + Kyiv + Sevastopol. The source AI has no polygons for the two cities, so they
  are **circles** of true area inside their oblasts. Crimea is always drawn as part of Ukraine.
- Islands/spits are merged into the right oblast by coordinates (`KNOWN_ISLANDS` in extract-map: Kinburn → Mykolaiv,
  Arabat north → Kherson, Biriuchyi → Zaporizhzhia, …).
- Two occupation overlays, both off by default (`options.occupation: ["2014", "now"]` turns them on at start):
  "Окупація (2014)" — all of Crimea and Sevastopol plus the ORDLO areas, occupied since 2014, hatched and outlined with a
  dashed line (the contact line as it stood until 2022, from the 2020 source map); "Окупація (<year>)" — the latest DeepStateMap snapshot (deepstatemap.live, Ukrainian
  OSINT), occupied + ORDLO + Crimea, grey zone excluded. The toggle shows `labelYear` (the user chose **2027**; set with
  `--label-year`, kept on refresh until the snapshot is newer); the footnote always gives the real snapshot date.
  Refresh it with `npm run occupation` before republishing.
- Kyiv Oblast's glyph keeps clear of the Kyiv circle and its name sits far south. On every map Ternopil's name sits above
  its glyph spot and Khmelnytskyi's below it (`labelAtGlyph` in extract-map), so the two never touch.
- Crimea and Sevastopol must never look apart from other regions (no special colour); in demo data Sevastopol
  shares Crimea's monthly totals so the circle never stands out from the peninsula.
- Hex layout positions live in `catalog.js` (`hex: [col, row]`, odd rows shifted right).

## Design conventions

- Colours only through tokens (`--c1..--c8` categorical in fixed order, `--seq-1..7` sequential, dark mode re-stepped,
  not inverted). Never colour text with a series colour; swatches carry identity.
- Colour presets (`options.palette`, default `green`): green, blue, teal, purple, orange, ylgnbu, ylorrd, viridis, magma,
  grey. Each pairs a ramp with the validated series palette rotated so its matching hue is slot 1 (single-colour glyphs).
  `options.palettePicker: true` adds a picker to the page (viewer's choice kept in localStorage); off for real artefacts
  unless asked. Edit presets only in `tools/make-palettes.mjs`, then run the dataviz validator on the series colours.
- Bubble/choropleth-like all-pairs forms: at most 3 categorical colours. Bars/stacks/pies (adjacent) up to 8.
- Fonts: Onest (headings) + Inter (UI/data) from Google Fonts — both have Cyrillic.
- Artifact contract (already handled by the template): no doctype/html/head/body tags, `<title>` first, tokens with
  both dark selectors, side gutter `max(16px, env(safe-area-inset-*))`, no horizontal page scroll, no external scripts.
