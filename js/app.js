"use strict";

const ROWS = ['A','B','C','D','E','F','G','H'];
const COLS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const NSLOTS = 6;
const SAMPLE_TAG = 'SA';       // fixed identifier for samples & blanks
const QC_TAG = 'ADIAMA';       // fixed identifier for QCs
const $ = id => document.getElementById(id);

// which text fields are remembered between visits (date is intentionally excluded — it resets to today)
const STORE_KEY = 'queueMaker.settings.v1';
const PERSIST_FIELDS = ['instName','instNo','evosepNo','gradientID','personalID','expID','MSmethod','ThermoMethodPath','LCmethod','output_name'];

/* ---------- state (starts empty) ---------- */
const state = {
  inst: 'Thermo',
  paint: 'sample',                                        // 'sample' | 'blank' | 'qc'
  plates: Array.from({length: NSLOTS}, () => new Map()),  // wellId -> { type, seq }
  labels: ['plate1','plate2','plate3','plate4','plate5','plate6'],
  seq: 0,                                                 // monotonic click counter (acquisition order)
  batches: [],                                            // committed queue: [{ cfg, items:[{type,rack,well,label}] }]
};

/* ---------- date default ---------- */
function todayStamp() { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`; }
$('dateID').value = todayStamp();

/* value, falling back to the field's placeholder example when left empty */
function val(id) { const el = $(id); return (el.value.trim() || el.placeholder || '').trim(); }

function cfg() {
  return {
    inst: state.inst,
    instName: val('instName'), instNo: val('instNo'), evosepNo: val('evosepNo'),
    gradientID: val('gradientID'), personalID: val('personalID'), dateID: val('dateID'),
    expID: val('expID'),
    MSmethod: val('MSmethod'), LCmethod: val('LCmethod'), thermoPath: val('ThermoMethodPath'),
    random: document.querySelector('input[name="rnd"]:checked').value,   // 'off' | 'slot' | 'full'
    outputName: ($('output_name').value.trim() || 'queue.csv'),
  };
}

/* ---------- persistence (localStorage) ---------- */
function saveSettings() {
  try {
    const data = { inst: state.inst, random: document.querySelector('input[name="rnd"]:checked').value, fields: {} };
    PERSIST_FIELDS.forEach(id => { data.fields[id] = $(id).value; });
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable (private mode / file://) — silently skip */ }
}
function loadSettings() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return; }
  if (!data) return;
  if (data.fields) PERSIST_FIELDS.forEach(id => { if (data.fields[id] != null) $(id).value = data.fields[id]; });
  setInstrument(data.inst === 'Sciex' ? 'Sciex' : 'Thermo');
  if (data.random) {
    const r = document.querySelector(`input[name="rnd"][value="${data.random}"]`);
    if (r) r.checked = true;
  }
  syncRandomUI();
}

/* ---------- naming ---------- */
function fullExp(c, label) { return label ? `${c.expID}_${label}` : c.expID; }
// Thermo instrument method = method folder + method name, joined with exactly one backslash
function instMethod(c) {
  const folder = (c.thermoPath || '').replace(/[\\/]+$/, '');   // drop any trailing slash(es)
  return folder ? `${folder}\\${c.MSmethod}` : c.MSmethod;
}
function prefix(c, label, tag) { return `${c.dateID}_${c.instName}${c.instNo}_Evo${c.evosepNo}_${c.gradientID}_${tag}_${c.personalID}_${fullExp(c, label)}`; }
function sampleName(c, label, well) { return `${prefix(c, label, SAMPLE_TAG)}_${well}`; }
function qcName(c, label, well)     { return `${prefix(c, label, QC_TAG)}_QC_${well}`; }
function blankName(c, label, n)     { return `${prefix(c, label, SAMPLE_TAG)}_blank_${n}`; }

function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* shuffle only 'sample' items among their own positions; blanks/QCs stay put.
   perSlot=true shuffles each plate's samples within that plate's own sample positions. */
function shuffleSamplesFixed(seq, perSlot) {
  const out = seq.slice();
  const shuffleGroup = indices => {
    const picked = shuffle(indices.map(i => seq[i]));
    indices.forEach((pos, k) => out[pos] = picked[k]);
  };
  if (perSlot) {
    const groups = {};
    seq.forEach((it, i) => { if (it.type === 'sample') (groups[it.rack] = groups[it.rack] || []).push(i); });
    Object.values(groups).forEach(shuffleGroup);
  } else {
    const idx = [];
    seq.forEach((it, i) => { if (it.type === 'sample') idx.push(i); });
    shuffleGroup(idx);
  }
  return out;
}

// one CSV row for the active instrument, using the batch's own captured config
function mkRow(cfg, inst, name, rack, well) {
  return inst === 'Thermo'
    ? [name, 'D:\\', instMethod(cfg), `S${rack}:${well}`]
    : [name, cfg.MSmethod, cfg.LCmethod, 'Evosep One tray', `S${rack}`, '96 Evotip box', 'Default', well, name];
}

/* ---------- build queue from the committed batches ---------- */
function buildQueue() {
  const inst = state.inst;
  const columns = inst === 'Thermo'
    ? ['File Name','Path','Instrument Method','Position']
    : ['Sample Name','MS Method','LC Method','Rack Type','Rack Position','Plate Type','Plate Position','Vial Position','Data File'];

  let sampleCount = 0, qcCount = 0, blankCount = 0;
  const racks = new Set();
  const items = [];   // flatten batches in add order; each item carries its batch's cfg
  state.batches.forEach(b => b.items.forEach(it => {
    if (it.type === 'sample') sampleCount++; else if (it.type === 'qc') qcCount++; else blankCount++;
    racks.add(it.rack);
    items.push({ ...it, cfg: b.cfg });
  }));

  const rnd = document.querySelector('input[name="rnd"]:checked').value;
  const sequence = rnd === 'slot' ? shuffleSamplesFixed(items, true)
                : rnd === 'full' ? shuffleSamplesFixed(items, false)
                :                  items;

  let blankSeq = 0;
  const rows = sequence.map(it => {
    const name = it.type === 'blank' ? blankName(it.cfg, it.label, blankSeq++)
              : it.type === 'qc'    ? qcName(it.cfg, it.label, it.well)
              :                       sampleName(it.cfg, it.label, it.well);
    return { cells: mkRow(it.cfg, inst, name, it.rack, it.well), type: it.type };
  });

  return { columns, rows, sampleCount, qcCount, blankCount, platesUsed: racks.size, batchCount: state.batches.length };
}

/* ---------- CSV ---------- */
function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(q) {
  const lines = [];
  if (state.inst === 'Thermo') lines.push('Bracket Type=4,');   // Xcalibur requires the trailing comma
  lines.push(q.columns.map(csvCell).join(','));
  for (const r of q.rows) lines.push(r.cells.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

/* ---------- render plates ---------- */
function slotHTML(i) {
  const wells = state.plates[i];
  let ns = 0, nq = 0, nb = 0;
  for (const v of wells.values()) v.type === 'blank' ? nb++ : v.type === 'qc' ? nq++ : ns++;
  const active = wells.size > 0;

  let grid = '<table class="mp"><thead><tr><th><div class="corner" data-plate="'+i+'" data-corner="1" title="Fill / clear plate"></div></th>';
  for (const col of COLS) grid += `<th><div class="hcol" data-plate="${i}" data-col="${col}">${col}</div></th>`;
  grid += '</tr></thead><tbody>';
  for (const row of ROWS) {
    grid += `<tr><th><div class="hrow" data-plate="${i}" data-row="${row}">${row}</div></th>`;
    for (const col of COLS) {
      const id = row + col, cell = wells.get(id), type = cell && cell.type;
      grid += `<td><div class="well${type ? ' ' + type : ''}" data-plate="${i}" data-well="${id}" title="${id}"></div></td>`;
    }
    grid += '</tr>';
  }
  grid += '</tbody></table>';

  const parts = [];
  if (ns) parts.push(`<b class="s">${ns}</b> sample${ns > 1 ? 's' : ''}`);
  if (nq) parts.push(`<b class="q">${nq}</b> QC`);
  if (nb) parts.push(`<b class="b">${nb}</b> blank${nb > 1 ? 's' : ''}`);
  const foot = parts.length ? parts.join(' · ') : 'empty';

  return `<div class="slot${active ? ' active' : ''}">
    <div class="slot-hd">
      <span class="slot-rack">S${i+1}</span>
      <input class="slot-label" type="text" data-label="${i}" value="${escapeAttr(state.labels[i])}" placeholder="label" aria-label="Plate ${i+1} label">
    </div>
    <div class="miniplate">${grid}</div>
    <div class="slot-foot">${foot}</div>
  </div>`;
}
function renderPlates() { $('rackGrid').innerHTML = state.plates.map((_, i) => slotHTML(i)).join(''); }
function escapeAttr(s){ return String(s).replace(/[&"<>]/g, ch => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[ch])); }
function escapeHtml(s){ return String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

/* ---------- render preview ---------- */
function renderTable(q) {
  const t = $('qtable');
  let html = '<thead><tr><th class="idx">#</th>';
  for (const col of q.columns) html += `<th>${col}</th>`;
  html += '</tr></thead><tbody>';
  q.rows.forEach((r, i) => {
    const cls = r.type === 'blank' ? 'is-blank' : r.type === 'qc' ? 'is-qc' : '';
    html += `<tr class="${cls}"><td class="idx">${i + 1}</td>`;
    for (const cell of r.cells) html += `<td>${escapeHtml(cell)}</td>`;
    html += '</tr>';
  });
  if (q.rows.length === 0) html += `<tr><td colspan="${q.columns.length + 1}" style="color:var(--ink-faint);padding:22px 12px;">Queue is empty — paint wells on the plates, then click <b>Add to queue</b>.</td></tr>`;
  html += '</tbody>';
  t.innerHTML = html;
}
function renderStats(q) {
  $('stats').innerHTML = `
    <div class="stat"><div class="n">${q.batchCount}</div><div class="l">Batches</div></div>
    <div class="stat"><div class="n">${q.platesUsed}</div><div class="l">Plates</div></div>
    <div class="stat samples"><div class="n">${q.sampleCount}</div><div class="l">Samples</div></div>
    <div class="stat qcs"><div class="n">${q.qcCount}</div><div class="l">QCs</div></div>
    <div class="stat blanks"><div class="n">${q.blankCount}</div><div class="l">Blanks</div></div>
    <div class="stat"><div class="n">${q.rows.length}</div><div class="l">Total runs</div></div>`;
}

// counts of wells painted but not yet added to the queue
function stagedCounts() {
  let ns = 0, nq = 0, nb = 0;
  state.plates.forEach(w => w.forEach(v => v.type === 'blank' ? nb++ : v.type === 'qc' ? nq++ : ns++));
  return { ns, nq, nb, total: ns + nq + nb };
}

let currentCSV = '';
function updatePreviewOnly() {
  const c = cfg();
  const q = buildQueue();
  currentCSV = toCSV(q);
  renderTable(q); renderStats(q);
  $('namePreview').innerHTML = 'e.g. <b>' + escapeHtml(sampleName(c, state.labels[0], 'A1')) + '</b>';
  $('methodPreview').innerHTML = c.inst === 'Thermo'
    ? 'Instrument Method → <b>' + escapeHtml(instMethod(c)) + '</b><br>must be an existing .meth on the acquisition PC, or Xcalibur leaves the column blank.'
    : 'MS Method → <b>' + escapeHtml(c.MSmethod) + '</b> · LC Method → <b>' + escapeHtml(c.LCmethod) + '</b>';
  $('bracketNote').style.display = c.inst === 'Thermo' ? '' : 'none';
  $('fnamePrev').textContent = c.outputName;

  // staged (painted-but-not-yet-added) summary + which method the next Add will use
  const s = stagedCounts();
  const parts = [];
  if (s.ns) parts.push(`${s.ns} sample${s.ns > 1 ? 's' : ''}`);
  if (s.nq) parts.push(`${s.nq} QC`);
  if (s.nb) parts.push(`${s.nb} blank${s.nb > 1 ? 's' : ''}`);
  $('stagedInfo').innerHTML = s.total
    ? `<b>${s.total}</b> painted (${parts.join(' · ')}) → will use method <b>${escapeHtml(c.MSmethod)}</b>`
    : 'Nothing painted yet — paint wells, then click Add.';
  $('addBtn').disabled = !s.total;

  const empty = q.rows.length === 0;
  $('downloadBtn').disabled = empty;
  $('copyBtn').disabled = empty;
  $('clearQueueBtn').disabled = empty;
  $('removeLastBtn').disabled = state.batches.length === 0;
}
function refresh() { renderPlates(); updatePreviewOnly(); }

/* ---------- committed queue actions ---------- */
function addToQueue() {
  const items = [];
  state.plates.forEach((wells, i) => {
    const rack = i + 1, label = state.labels[i];
    for (const [well, cell] of wells) items.push({ type: cell.type, seq: cell.seq, rack, well, label });
  });
  if (!items.length) { flash('Paint some wells first'); return; }
  items.sort((a, b) => a.seq - b.seq);   // click order within this batch
  const batch = { cfg: cfg(), items: items.map(({ type, rack, well, label }) => ({ type, rack, well, label })) };
  state.batches.push(batch);
  state.plates.forEach(m => m.clear());   // clear staging for the next set
  refresh();
  flash(`Added ${batch.items.length} run${batch.items.length > 1 ? 's' : ''} to queue`);
}
function removeLastBatch() { if (state.batches.length) { state.batches.pop(); refresh(); } }
function clearQueue() { if (state.batches.length) { state.batches = []; refresh(); } }

/* ---------- interactions ---------- */
function setInstrument(inst) {
  state.inst = inst;
  document.querySelectorAll('#instSeg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.inst === inst));
  $('thermoMethodField').classList.toggle('collapsed', inst !== 'Thermo');
  $('lcMethodField').classList.toggle('collapsed', inst !== 'Sciex');
}
$('instSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-inst]'); if (!b) return;
  setInstrument(b.dataset.inst);
  updatePreviewOnly(); saveSettings();
});
$('paintSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-paint]'); if (!b) return;
  state.paint = b.dataset.paint;
  document.querySelectorAll('#paintSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
});

// set a well's type; new wells get the next click number, re-painted wells keep their place
function setWell(map, id, type) { const cur = map.get(id); map.set(id, { type, seq: cur ? cur.seq : ++state.seq }); }
function paintWell(map, id) { const cur = map.get(id); if (cur && cur.type === state.paint) map.delete(id); else setWell(map, id, state.paint); }
function bulkPaint(map, ids) {
  const allCurrent = ids.every(id => { const c = map.get(id); return c && c.type === state.paint; });
  if (allCurrent) ids.forEach(id => map.delete(id));
  else ids.forEach(id => setWell(map, id, state.paint));
}
$('rackGrid').addEventListener('click', e => {
  const el = e.target.closest('[data-plate]'); if (!el) return;
  const map = state.plates[+el.dataset.plate];
  if (el.dataset.well) paintWell(map, el.dataset.well);
  else if (el.dataset.row) bulkPaint(map, COLS.map(c => el.dataset.row + c));
  else if (el.dataset.col) bulkPaint(map, ROWS.map(r => r + el.dataset.col));
  else if (el.dataset.corner) bulkPaint(map, ROWS.flatMap(r => COLS.map(c => r + c)));
  else return;
  refresh();
});
$('rackGrid').addEventListener('input', e => {
  const el = e.target.closest('input[data-label]'); if (!el) return;
  state.labels[+el.dataset.label] = el.value.trim();   // keep focus: don't re-render plates
  updatePreviewOnly();
});

$('clearAll').addEventListener('click', () => { state.plates.forEach(m => m.clear()); refresh(); });
$('addBtn').addEventListener('click', addToQueue);
$('removeLastBtn').addEventListener('click', removeLastBatch);
$('clearQueueBtn').addEventListener('click', clearQueue);

function syncRandomUI() {
  document.querySelectorAll('#randomRadios .radio-opt').forEach(o => o.dataset.on = o.querySelector('input').checked);
}
$('randomRadios').addEventListener('change', () => { syncRandomUI(); updatePreviewOnly(); saveSettings(); });
$('cfg').addEventListener('input', () => { updatePreviewOnly(); saveSettings(); });

async function saveCSV() {
  const name = cfg().outputName.endsWith('.csv') ? cfg().outputName : cfg().outputName + '.csv';
  const data = currentCSV;
  // Preferred: native "Save As" dialog (Chromium browsers, secure context)
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      flash('Saved ✓');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // user cancelled the dialog
      // any other error (e.g. unsupported / blocked) → fall back below
    }
  }
  const blob = new Blob([data], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  flash(`↓ "${name}" → your Downloads folder`);
}
$('downloadBtn').addEventListener('click', saveCSV);
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentCSV); flash('Copied ✓'); } catch { flash('Copy failed'); }
});
function flash(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1400); }

$('themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
});

loadSettings();   // restore the user's previous inputs (if any) before first render
refresh();
