# Queue Maker

Interactive builder for mass-spectrometry acquisition queues, for **Thermo** (Xcalibur)
and **Sciex** instruments, with **Evosep** or **Vanquish Neo** autosamplers. Lay out
96-well plates on the virtual rack, paint each well as **sample**, **blank**, or **QC**,
preview the generated queue, and export a ready-to-import CSV.

## Features

- Two autosamplers: **Evosep** (6 racks, `S1–S6`, positions like `S3:A1`) and
  **Vanquish Neo** (4 colored trays `R/G/B/Y`, positions like `G:A1`). The queue combines
  all racks of the selected autosampler.
- Per-well painting (sample / blank / QC): click a well, **drag to paint a rectangular
  block** (drag from a same-type well to erase), or fill a row / column / whole plate.
- **Batch workflow:** paint a set of wells, pick its method, click **Add to queue**;
  repeat with a different method. One queue can mix multiple MS methods — each run
  carries the method of the batch it was added in. Remove the last batch or clear the
  whole queue at any time.
- Fixed sample-name identifiers: **`SA`** for samples & blanks, **`ADIAMA`** for QCs.
- Queue follows the **order you click wells** (across all racks and all types).
- Randomization: **off** (keep click order), **within each slot**, or **across all slots**
  — samples only; blanks and QCs always stay where you placed them.
- Live CSV preview and export. In Chrome/Edge the **Download** button opens a native
  "Save As" dialog; other browsers save to the Downloads folder.
- Remembers your instrument/naming/method settings between visits (localStorage);
  the date always resets to today.
- Light/dark theme.

## Project structure

```
queueMaker/
├── index.html          # markup
├── css/
│   └── styles.css      # all styling (Evosep pale-orange theme, light + dark)
├── js/
│   └── app.js          # queue logic, plate painting, CSV export
├── .nojekyll           # serve files as-is on GitHub Pages
├── .gitignore
└── README.md
```

> A `python/` folder holds the original pandas implementation
> (`queueMaker.py`, `notebook.ipynb`). It is **git-ignored** — the web app is
> self-contained and does not use it — so it stays local and is not deployed.



## Python tool (`python/`, local only)

`queueMaker.py` is the original pandas implementation the web app is based on. The web
app reproduces its logic; the Python version remains for scripted/batch use but is
git-ignored and kept locally. From inside `python/`:

```python
from queueMaker import generateMSQueue, writeThermoQueue
```
