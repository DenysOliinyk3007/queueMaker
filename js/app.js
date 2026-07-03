"use strict";

const ROWS = ['A','B','C','D','E','F','G','H'];
const COLS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const NSLOTS = 6;
const SAMPLE_TAG = 'SA';       // fixed identifier for samples & blanks
const QC_TAG = 'ADIAMA';       // fixed identifier for QCs
const $ = id => document.getElementById(id);

/* ---------- state (starts empty) ---------- */
const state = {
  inst: 'Thermo',
  paint: 'sample',                                        // 'sample' | 'blank' | 'qc'
  plates: Array.from({length: NSLOTS}, () => new Map()),  // wellId -> type
  labels: ['plate1','plate2','plate3','plate4','plate5','plate6'],
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

/* ---------- naming ---------- */
function fullExp(c, label) { return label ? `${c.expID}_${label}` : c.expID; }
function prefix(c, label, tag) { return `${c.dateID}_${c.instName}${c.instNo}_Evo${c.evosepNo}_${c.gradientID}_${tag}_${c.personalID}_${fullExp(c, label)}`; }
function sampleName(c, label, well) { return `${prefix(c, label, SAMPLE_TAG)}_${well}`; }
function qcName(c, label, well)     { return `${prefix(c, label, QC_TAG)}_QC_${well}`; }
function blankName(c, label, n)     { return `${prefix(c, label, SAMPLE_TAG)}_blank_${n}`; }

/* reading order: across rows (A1,A2,…,A12,B1,…) */
function orderReading(ids) {
  return ids.slice().sort((a, b) => {
    const ra = ROWS.indexOf(a[0]), rb = ROWS.indexOf(b[0]);
    return ra - rb || parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
  });
}
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* shuffle only 'sample' items among their own positions; blanks/QCs stay fixed */
function shuffleSamplesFixed(seq) {
  const idx = [], samples = [];
  seq.forEach((it, i) => { if (it.type === 'sample') { idx.push(i); samples.push(it); } });
  const shuffled = shuffle(samples);
  const out = seq.slice();
  idx.forEach((position, k) => out[position] = shuffled[k]);
  return out;
}

/* ---------- build queue across all 6 slots ---------- */
function buildQueue(c) {
  const columns = c.inst === 'Thermo'
    ? ['File Name','Path','Instrument Method','Position']
    : ['Sample Name','MS Method','LC Method','Rack Type','Rack Position','Plate Type','Plate Position','Vial Position','Data File'];
  const mkRow = (name, rack, well) => c.inst === 'Thermo'
    ? [name, 'D:\\', c.thermoPath + c.MSmethod, `S${rack}:${well}`]
    : [name, c.MSmethod, c.LCmethod, 'Evosep One tray', `S${rack}`, '96 Evotip box', 'Default', well, name];

  let sampleCount = 0, qcCount = 0, blankCount = 0, platesUsed = 0;
  const slotSeqs = [];   // one reading-order sequence per used slot, in S1..S6 order

  state.plates.forEach((wells, i) => {
    if (wells.size === 0) return;
    platesUsed++;
    const rack = i + 1, label = state.labels[i];
    const seq = orderReading([...wells.keys()]).map(well => {
      const type = wells.get(well);
      if (type === 'sample') sampleCount++; else if (type === 'qc') qcCount++; else blankCount++;
      return { type, rack, well, label };
    });
    slotSeqs.push(seq);
  });

  let sequence;
  if (c.random === 'slot')      sequence = slotSeqs.map(shuffleSamplesFixed).flat();
  else if (c.random === 'full') sequence = shuffleSamplesFixed(slotSeqs.flat());
  else                          sequence = slotSeqs.flat();

  let blankSeq = 0;
  const rows = sequence.map(it => {
    const name = it.type === 'blank' ? blankName(c, it.label, blankSeq++)
              : it.type === 'qc'    ? qcName(c, it.label, it.well)
              :                       sampleName(c, it.label, it.well);
    return { cells: mkRow(name, it.rack, it.well), type: it.type };
  });

  return { columns, rows, sampleCount, qcCount, blankCount, platesUsed };
}

/* ---------- CSV ---------- */
function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(c, q) {
  const lines = [];
  if (c.inst === 'Thermo') lines.push('Bracket Type=4');
  lines.push(q.columns.map(csvCell).join(','));
  for (const r of q.rows) lines.push(r.cells.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

/* ---------- render plates ---------- */
function slotHTML(i) {
  const wells = state.plates[i];
  let ns = 0, nq = 0, nb = 0;
  for (const v of wells.values()) v === 'blank' ? nb++ : v === 'qc' ? nq++ : ns++;
  const active = wells.size > 0;

  let grid = '<table class="mp"><thead><tr><th><div class="corner" data-plate="'+i+'" data-corner="1" title="Fill / clear plate"></div></th>';
  for (const col of COLS) grid += `<th><div class="hcol" data-plate="${i}" data-col="${col}">${col}</div></th>`;
  grid += '</tr></thead><tbody>';
  for (const row of ROWS) {
    grid += `<tr><th><div class="hrow" data-plate="${i}" data-row="${row}">${row}</div></th>`;
    for (const col of COLS) {
      const id = row + col, type = wells.get(id);
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
  if (q.rows.length === 0) html += `<tr><td colspan="${q.columns.length + 1}" style="color:var(--ink-faint);padding:22px 12px;">Empty queue — pick a category above and click wells on a plate to begin.</td></tr>`;
  html += '</tbody>';
  t.innerHTML = html;
}
function renderStats(q) {
  $('stats').innerHTML = `
    <div class="stat"><div class="n">${q.platesUsed}</div><div class="l">Plates</div></div>
    <div class="stat samples"><div class="n">${q.sampleCount}</div><div class="l">Samples</div></div>
    <div class="stat qcs"><div class="n">${q.qcCount}</div><div class="l">QCs</div></div>
    <div class="stat blanks"><div class="n">${q.blankCount}</div><div class="l">Blanks</div></div>
    <div class="stat"><div class="n">${q.rows.length}</div><div class="l">Total runs</div></div>`;
}

let currentCSV = '';
function updatePreviewOnly() {
  const c = cfg();
  const q = buildQueue(c);
  currentCSV = toCSV(c, q);
  renderTable(q); renderStats(q);
  $('namePreview').innerHTML = 'e.g. <b>' + escapeHtml(sampleName(c, state.labels[0], 'A1')) + '</b>';
  $('bracketNote').style.display = c.inst === 'Thermo' ? '' : 'none';
  $('fnamePrev').textContent = c.outputName;
  $('downloadBtn').disabled = q.rows.length === 0;
  $('copyBtn').disabled = q.rows.length === 0;
}
function refresh() { renderPlates(); updatePreviewOnly(); }

/* ---------- interactions ---------- */
$('instSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-inst]'); if (!b) return;
  state.inst = b.dataset.inst;
  document.querySelectorAll('#instSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('thermoMethodField').classList.toggle('collapsed', state.inst !== 'Thermo');
  $('lcMethodField').classList.toggle('collapsed', state.inst !== 'Sciex');
  updatePreviewOnly();
});
$('paintSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-paint]'); if (!b) return;
  state.paint = b.dataset.paint;
  document.querySelectorAll('#paintSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
});

function paintWell(map, id) { map.get(id) === state.paint ? map.delete(id) : map.set(id, state.paint); }
function bulkPaint(map, ids) {
  const allCurrent = ids.every(id => map.get(id) === state.paint);
  if (allCurrent) ids.forEach(id => map.delete(id));
  else ids.forEach(id => map.set(id, state.paint));
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

$('randomRadios').addEventListener('change', () => {
  document.querySelectorAll('#randomRadios .radio-opt').forEach(o => o.dataset.on = o.querySelector('input').checked);
  updatePreviewOnly();
});
$('cfg').addEventListener('input', updatePreviewOnly);

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

refresh();
