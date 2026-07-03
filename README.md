# Queue Maker

Interactive builder for **Evosep** mass-spectrometry acquisition queues, for **Thermo**
(Xcalibur) and **Sciex** instruments. Lay out up to six 96-well plates on a virtual
Evosep rack (S1–S6), paint each well as **sample**, **blank**, or **QC**, preview the
generated queue, and export a ready-to-import CSV.

## Features

- Six plate slots = Evosep racks **S1–S6**; queue combines all of them.
- Per-well painting (sample / blank / QC) plus row, column, and whole-plate fill.
- Fixed sample-name identifiers: **`SA`** for samples & blanks, **`ADIAMA`** for QCs.
- Randomization: **off**, **within each slot**, or **across all slots** — samples only;
  blanks and QCs keep the order you paint them.
- Live CSV preview and export. In Chrome/Edge the **Download** button opens a native
  "Save As" dialog; other browsers save to the Downloads folder.
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
