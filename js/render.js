'use strict';
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
      const named = cell && cell.name ? ' named' : '';
      const ttl = cell && cell.name ? escapeAttr(id + ' · ' + cell.name) : id;
      grid += `<td><div class="well${type ? ' ' + type : ''}${named}" data-plate="${i}" data-well="${id}" title="${ttl}"></div></td>`;
    }
    grid += '</tr>';
  }
  grid += '</tbody></table>';

  const parts = [];
  if (ns) parts.push(`<b class="s">${ns}</b> sample${ns > 1 ? 's' : ''}`);
  if (nq) parts.push(`<b class="q">${nq}</b> QC`);
  if (nb) parts.push(`<b class="b">${nb}</b> blank${nb > 1 ? 's' : ''}`);
  const foot = parts.length ? parts.join(' · ') : 'empty';

  const rackId = racks()[i];
  const col = TRAY_COLOR[rackId];
  const badgeStyle = col ? ` style="background:${col}22;color:${col}"` : '';
  const badgeTitle = TRAY_NAME[rackId] ? ` title="${TRAY_NAME[rackId]} tray"` : '';

  return `<div class="slot${active ? ' active' : ''}">
    <div class="slot-hd">
      <span class="slot-rack"${badgeStyle}${badgeTitle}>${rackId}</span>
    </div>
    <div class="miniplate">${grid}</div>
    <div class="slot-foot">${foot}</div>
  </div>`;
}
function renderPlates() {
  const n = racks().length;
  $('rackGrid').style.gridTemplateRows = `repeat(${Math.ceil(n / 2)}, auto)`;
  $('rackGrid').innerHTML = state.plates.map((_, i) => slotHTML(i)).join('');
}
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

let currentExport = { text: '', ext: 'csv' };   // Bruker → XML, others → CSV
let lastImportSlot = null;   // rack index of the most recent not-yet-added import (for relocation)
function exportName() {
  const base = ((cfg().outputName || 'queue').replace(/\.(csv|xml|xls|txt)$/i, '')) || 'queue';
  return base + '.' + currentExport.ext;
}
function updatePreviewOnly() {
  const c = cfg();
  const q = buildQueue();
  currentExport = c.inst === 'Bruker' ? { text: toXML(q), ext: 'xml' } : { text: toCSV(q), ext: 'csv' };
  renderTable(q); renderStats(q);
  $('bracketNote').style.display = c.inst === 'Thermo' ? '' : 'none';
  $('blankEveryField').classList.toggle('collapsed', $('blankInterval').value !== 'every');
  $('blankCountField').classList.toggle('collapsed', $('blankInterval').value === 'none');
  $('downloadBtn').textContent = '⤓ Download ' + currentExport.ext.toUpperCase();
  $('fnamePrev').textContent = exportName();

  // staged (painted-but-not-yet-added) summary + which method the next Add will use
  const s = stagedCounts();
  const parts = [];
  if (s.ns) parts.push(`${s.ns} sample${s.ns > 1 ? 's' : ''}`);
  if (s.nq) parts.push(`${s.nq} QC`);
  if (s.nb) parts.push(`${s.nb} blank${s.nb > 1 ? 's' : ''}`);
  $('stagedInfo').innerHTML = s.total
    ? `<b>${s.total}</b> painted (${parts.join(' · ')}) → will use method <b>${escapeHtml(c.MSmethod)}</b>`
    : 'Nothing painted yet — paint wells, then click Add.';

  // required text fields — empty ones would otherwise emit placeholder text into the queue
  const req = (id, warnId) => { const miss = !$(id).value.trim(); $(id).classList.toggle('invalid', miss); $(warnId).hidden = !miss; return miss; };
  const noExp  = req('expID', 'expIDwarn');
  const noPers = req('personalID', 'personalIDwarn');
  const noMeth = req('MSmethod', 'msMethodWarn');
  const blocked = noExp || noPers || noMeth;

  const addDisabled = !s.total || blocked;
  $('addBtn').disabled = addDisabled;
  $('addBtnWrap').title = addDisabled ? 'Paint at least one well and fill all required (*) fields' : '';
  const empty = q.rows.length === 0;
  $('downloadBtn').disabled = empty || blocked;
  $('copyBtn').disabled = empty || blocked;
  $('clearQueueBtn').disabled = empty;
  $('removeLastBtn').disabled = state.batches.length === 0;
  $('moveHereBtn').disabled = lastImportSlot === null;
}
function refresh() { renderPlates(); updatePreviewOnly(); }
