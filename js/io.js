'use strict';
/* ---------- import a plate-layout CSV (well grid → names) ---------- */
function splitCSVLine(line, delim) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
// pick the separator Excel used: comma, semicolon (German locale), or tab
function detectDelimiter(line) {
  const c = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of line) if (ch in c) c[ch]++;
  if (c[';'] > c[','] && c[';'] >= c['\t']) return ';';
  if (c['\t'] > c[','] && c['\t'] >= c[';']) return '\t';
  return ',';
}
function normCol(s) { const t = s.trim(); return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t; }   // "01" -> "1"
function classifyName(name) {
  if (/blank/i.test(name)) return 'blank';
  if (/(?:^|[_\s-])qc(?:[_\s-]|$)/i.test(name)) return 'qc';
  return 'sample';
}
function importLayout(text, slotIndex) {
  text = text.replace(/^﻿/, '').replace(/\r/g, '');   // strip BOM + CRs
  const lines = text.split('\n').filter(l => l.trim().length);
  if (lines.length < 2) return { error: 'Need a header row (columns) plus at least one well row (A–H).' };
  const delim = detectDelimiter(lines[0]);
  const header = splitCSVLine(lines[0], delim).slice(1).map(normCol);
  // parse into a temp list first, so a bad file never wipes the target rack
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCSVLine(lines[i], delim);
    const row = (f[0] || '').trim().toUpperCase();            // accept 'a'..'h'
    if (!ROWS.includes(row)) continue;
    for (let c = 0; c < header.length; c++) {
      if (!COLS.includes(header[c])) continue;
      const raw = (f[c + 1] || '').trim();
      if (raw) entries.push({ id: row + header[c], type: classifyName(raw), name: raw });
    }
  }
  if (!entries.length) return { error: 'No named wells found — expected a plate grid (rows A–H down, columns 1–12 across).' };
  // disambiguate repeated names with _01, _02, … in reading order (so every File Name is unique)
  const counts = {};
  entries.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; });
  const numbered = Object.keys(counts).filter(k => counts[k] > 1).length;
  const running = {};
  entries.forEach(e => {
    e.cond = e.name;   // condition = the raw imported name (whole name), before numbering
    if (counts[e.name] > 1) {
      running[e.name] = (running[e.name] || 0) + 1;
      e.name = `${e.name}_${String(running[e.name]).padStart(2, '0')}`;
    }
  });
  const map = state.plates[slotIndex];
  map.clear();
  let ns = 0, nq = 0, nb = 0;
  for (const e of entries) {
    map.set(e.id, { type: e.type, seq: ++state.seq, name: e.name, cond: e.cond });
    if (e.type === 'blank') nb++; else if (e.type === 'qc') nq++; else ns++;
  }
  return { n: entries.length, ns, nq, nb, delim, numbered };
}
function populateImportRack() {
  const sel = $('importRack');
  const keep = sel.value;
  sel.innerHTML = racks().map((r, i) => `<option value="${i}">${r}</option>`).join('');
  if (keep && +keep < racks().length) sel.value = keep;
}
function populateBlankRack() {
  const sel = $('blankRack');
  const keep = sel.value;
  sel.innerHTML = racks().map(r => `<option value="${r}">${r}</option>`).join('');
  if (racks().includes(keep)) sel.value = keep; else sel.value = racks()[racks().length - 1];   // default: last rack
}
$('importFile').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const slotIndex = +$('importRack').value;
  const reader = new FileReader();
  reader.onload = () => {
    const res = importLayout(String(reader.result), slotIndex);
    if (res.error) {
      $('importInfo').innerHTML = `<span style="color:var(--danger)">${escapeHtml(res.error)}</span>`;
    } else {
      const bits = [`${res.ns} samples`, res.nq && `${res.nq} QC`, res.nb && `${res.nb} blanks`].filter(Boolean).join(', ');
      const sep = res.delim === ';' ? ' · semicolon-separated' : res.delim === '\t' ? ' · tab-separated' : '';
      const numbered = res.numbered ? ` <b>${res.numbered}</b> repeated name${res.numbered > 1 ? 's' : ''} auto-numbered (_01, _02, …).` : '';
      $('importInfo').innerHTML = `Imported <b>${res.n}</b> wells into <b>${racks()[slotIndex]}</b> (${bits})${sep}.${numbered} Wrong rack? Pick another and click “Move here”. Review, then Add to queue.`;
      lastImportSlot = slotIndex;
      refresh();
    }
    e.target.value = '';   // let the same file be re-imported
  };
  reader.readAsText(file);
});
// "Move here" relocates the most recent (not-yet-added) import to the selected rack
$('moveHereBtn').addEventListener('click', () => {
  if (lastImportSlot === null) return;
  const to = +$('importRack').value;
  if (to === lastImportSlot) { flash(`Layout already in ${racks()[to]}`); return; }
  const from = state.plates[lastImportSlot];
  if (!from.size) { lastImportSlot = null; refresh(); return; }
  const fromLabel = racks()[lastImportSlot], toLabel = racks()[to];
  state.plates[to] = from;                 // move the imported wells to the selected rack
  state.plates[lastImportSlot] = new Map();
  lastImportSlot = to;
  refresh();
  $('importInfo').innerHTML = `Moved imported layout from <b>${fromLabel}</b> to <b>${toLabel}</b>. Review, then Add to queue.`;
});

function syncRandomUI() {
  document.querySelectorAll('#randomRadios .radio-opt').forEach(o => o.dataset.on = o.querySelector('input').checked);
}
function setRnd(mode, reshuffle) {
  if (reshuffle && mode in state.seeds) state.seeds[mode] = (Math.random() * 0x100000000) >>> 0;   // new order
  state.activeRnd = mode;
  const r = document.querySelector(`input[name="rnd"][value="${mode}"]`);
  if (r && !r.checked) r.checked = true;
  syncRandomUI(); updatePreviewOnly(); saveSettings();
}
// capture the active mode BEFORE the click toggles the radio, so we can tell re-click from switch
let preClickRnd = null;
$('randomRadios').addEventListener('mousedown', () => { const r = document.querySelector('input[name="rnd"]:checked'); preClickRnd = r && r.value; });
$('randomRadios').addEventListener('click', e => {
  const opt = e.target.closest('.radio-opt'); if (!opt) return;
  const inp = opt.querySelector('input[name="rnd"]'); if (!inp) return;
  setRnd(inp.value, inp.value === preClickRnd);   // clicked the already-active mode → reshuffle
});
$('randomRadios').addEventListener('change', e => {   // keyboard arrow-key switches (never reshuffle)
  const inp = e.target.closest('input[name="rnd"]'); if (inp) { state.activeRnd = inp.value; syncRandomUI(); updatePreviewOnly(); }
});
$('cfg').addEventListener('input', () => { updatePreviewOnly(); saveSettings(); });

async function saveText(name, data) {
  const ext = (name.split('.').pop() || 'csv').toLowerCase();
  const mime = { csv: 'text/csv', xml: 'application/xml', txt: 'text/plain' }[ext] || 'text/plain';
  // Preferred: native "Save As" dialog (Chromium browsers, secure context)
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: ext.toUpperCase() + ' file', accept: { [mime]: ['.' + ext] } }],
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
  const blob = new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  flash(`↓ "${name}" → your Downloads folder`);
}
async function saveCSV() { rememberMethods(); await saveText(exportName(), currentExport.text); }
// empty plate-layout scaffold (same grid the importer reads): header row + rows A–H
function layoutTemplate() {
  const lines = [',' + COLS.join(',')];
  for (const r of ROWS) lines.push(r + ','.repeat(COLS.length));
  return lines.join('\r\n') + '\r\n';
}
$('downloadBtn').addEventListener('click', saveCSV);
$('downloadLayoutBtn').addEventListener('click', () => saveText('plate_layout_template.csv', layoutTemplate()));
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentExport.text); flash('Copied ✓'); } catch { flash('Copy failed'); }
});
function flash(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1400); }

$('themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
});
