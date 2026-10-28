# Machining Database Explorer

Browse the [Digital Machining Database](https://www.kaggle.com/datasets/tonylschmitz/digital-machining-database) (155 simulated milling datasets, CC BY-ND 4.0) in the browser. The site ships a small prebuilt index; signals are fetched one file at a time from the [Hugging Face mirror](https://huggingface.co/datasets/gomezmfg/digital-machining-database) and parsed client-side.

## Develop

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (relative paths, works on GitHub Pages)
npm run deploy     # build and force-push dist/ to the gh-pages branch
```

The live site is https://gomezm03.github.io/machining-database-explorer/, served from the `gh-pages` branch.

## Rebuild the index

Needs the full local copy of the data in `../data` and Anaconda's Python (scipy, numpy, pandas):

```
C:\Users\gomez\anaconda3\python.exe scripts\build_index.py
```

It writes `public/data/index.json` (datasets, facets, card lobes) and `public/data/ds/N.json` (grid of cuts and boundary per dataset). Use `--only 1 126` to test on a few datasets.

## Layout

- `src/main.jsx`: hash router and header
- `src/Explorer.jsx`: search, Classify by, facet filters, dataset cards
- `src/DatasetView.jsx`: grid of cuts over the stability boundary
- `src/FileView.jsx`: X/Y and Custom signal panels, spectra, sound, CSV/PNG export
- `src/mat5.js`: MAT v5 reader; `src/dsp.js`: FFT and peak labelling
- `src/icons.jsx`: legacy Tap Test icons plus the new ones from the design
