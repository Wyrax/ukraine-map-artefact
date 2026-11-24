# ukraine-map-artefact

The base for HTML infographics with Ukraine's SVG map.

Each infographic is a folder in `artefacts/` with an `artefact.json` (which views to show) and a `data.json`
(numbers by region and period). `npm run build -- <slug>` turns it into one self-contained HTML page in `dist/`,
ready to publish as a Claude Artifact.

What the map can show, all driven by a timeline (play/pause, slider) and a Ukrainian/English switch:

- choropleth, proportional bubbles, grouped bars, stacked columns, pies/donuts, progress rings, radial bars,
  radar glyphs and region-to-region flow arrows on the map;
- a hex tile map where every region has the same size;
- side panels: ranking (single or stacked), line chart over time, region × period heatmap, Sankey, radar comparison;
- a sortable data table, tooltips with sparklines, occupation overlays (since 2014 and the latest DeepStateMap
  snapshot) and 10 colour presets with an optional picker.

```
npm install
npm test
npm run build -- showcase
npm run dev -- showcase --serve   # http://localhost:5173
```

See [CLAUDE.md](CLAUDE.md) for the data format, configuration reference and the publishing workflow.
The source Illustrator map (`maps/`) is not committed; `npm run extract-map` regenerates `src/map/` from it.
