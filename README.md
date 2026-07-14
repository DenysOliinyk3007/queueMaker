# Queue Maker

Interactive builder for mass-spectrometry acquisition queues, for **Thermo**, **Sciex** and **Bruker** instruments, paired to **Evosep** or **Vanquish Neo** LC systems. 

## Features

- Two LC systems: **Evosep** (6 racks, `S1–S6`, positions like `S3:A1`) and
  **Vanquish Neo** (4 colored trays `R/G/B/Y`, positions like `G:A1`). The queue combines
  all racks of the selected autosampler.
- Per-well selection with 3 possible sample types (sample / blank / QC): click a well, **drag to paint a rectangular
  block**, or fill a row / column / whole plate.
- **Batch workflow:** paint a set of wells, pick its method, click **Add to queue**;
  repeat with a different method. One queue can mix multiple MS methods — each run
  carries the method of the batch it was added in. Remove the last batch or clear the
  whole queue at any time.
- **Import a plate-layout CSV** (well grid of names, rows A–H × columns 1–12) into any
  rack: named wells are painted automatically, each name gets your standard prefix, and
  blank/QC wells are detected by keyword.
- Queue follows the **order you click wells** (across all racks and all types).
- Supported sample randomization options: **off** (keep click order), **within each slot**, **across all slots** or **within condition**
- Live CSV preview and export.
- **384-well plate translation window.**

## Project structure

```
queueMaker/
├── index.html                 # markup
├── css/                       # styling, loaded in order (cascade preserved)
│   ├── theme.css              #   design tokens + light/dark themes
│   ├── base.css               #   reset, header, layout, form controls, panels
│   ├── plate.css              #   paint/import bars, rack sheet, wells, drag
│   ├── queue.css              #   stats, preview table, export bar, buttons
│   └── modal.css              #   384 modal, quadrant schema, input states
├── js/                        # classic scripts, loaded in dependency order
│   ├── core.js                #   constants, state, cfg, localStorage persistence
│   ├── naming.js              #   sample-name builders
│   ├── queue.js               #   ordering, blanks, row/CSV/XML construction
│   ├── render.js              #   plate + preview rendering, updatePreviewOnly
│   ├── interactions.js        #   queue actions, instrument/LC/paint, drag-to-paint
│   ├── modal384.js            #   384-well → 96 quadrant translation modal
│   ├── io.js                  #   CSV layout import, randomization, file save
│   └── main.js                #   bootstrap (restore settings, first render)
├── .nojekyll                  # serve files as-is on GitHub Pages
├── .gitignore
└── README.md
```

