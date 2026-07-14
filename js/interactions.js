'use strict';

/* ---------- committed queue actions ---------- */
function addToQueue() {
  if (!$('expID').value.trim()) { flash('Enter an Experiment ID first'); return; }
  const items = [];
  const rackLabels = racks();
  state.plates.forEach((wells, i) => {
    const rack = rackLabels[i], label = '';
    for (const [well, cell] of wells) items.push({ type: cell.type, seq: cell.seq, rack, well, label, name: cell.name, cond: cell.cond, nameWell: cell.nameWell });
  });
  if (!items.length) { flash('Paint some wells first'); return; }
  items.sort((a, b) => a.seq - b.seq);   // click order within this batch
  const batch = { cfg: cfg(), items: items.map(({ type, rack, well, label, name, cond, nameWell }) => ({ type, rack, well, label, name, cond, nameWell })) };
  state.batches.push(batch);
  state.plates.forEach(m => m.clear());   // clear staging for the next set
  lastImportSlot = null;
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
  $('brukerSepField').classList.toggle('collapsed', inst !== 'Bruker');
}
$('instSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-inst]'); if (!b) return;
  setInstrument(b.dataset.inst);
  updatePreviewOnly(); saveSettings();
});
function rebuildPlates() { state.plates = Array.from({ length: racks().length }, () => new Map()); }
function setLC(lc) {
  state.lc = LC_CONFIG[lc] ? lc : 'Evosep';
  document.querySelectorAll('#lcSeg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.lc === state.lc));
  if (state.plates.length !== racks().length) rebuildPlates();   // resize staging to the LC's rack count
  populateImportRack();
  populateBlankRack();
  populateQuadrantMap();
}
$('lcSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-lc]'); if (!b) return;
  if (b.dataset.lc === state.lc) return;
  // the autosampler applies to the whole queue — positions differ, so switching resets it
  if (state.batches.length && !window.confirm('Switching the autosampler clears the current queue and painted wells (rack positions differ). Continue?')) return;
  state.batches = [];
  setLC(b.dataset.lc);
  rebuildPlates();   // clears staged wells (rack counts differ)
  refresh(); saveSettings();
});
function setPaint(mode) {
  state.paint = mode;
  document.querySelectorAll('#paintSeg button, #paintSeg384 button').forEach(x => x.setAttribute('aria-pressed', x.dataset.paint === mode));
}
$('paintSeg').addEventListener('click', e => { const b = e.target.closest('button[data-paint]'); if (b) setPaint(b.dataset.paint); });
$('paintSeg384').addEventListener('click', e => { const b = e.target.closest('button[data-paint]'); if (b) setPaint(b.dataset.paint); });

// set a well's type; new wells get the next click number, re-painted wells keep their place
function setWell(map, id, type) { const cur = map.get(id); map.set(id, { type, seq: cur ? cur.seq : ++state.seq, name: cur ? cur.name : undefined, cond: cur ? cur.cond : undefined, nameWell: cur ? cur.nameWell : undefined }); }
// used by the 384 translation: like setWell but stamps a naming suffix (e.g. "Q1_A1")
function setNamedWell(map, id, type, nameWell) { const cur = map.get(id); map.set(id, { type, seq: cur ? cur.seq : ++state.seq, name: undefined, cond: undefined, nameWell }); }
function paintWell(map, id) { const cur = map.get(id); if (cur && cur.type === state.paint) map.delete(id); else setWell(map, id, state.paint); }
function bulkPaint(map, ids) {
  const allCurrent = ids.every(id => { const c = map.get(id); return c && c.type === state.paint; });
  if (allCurrent) ids.forEach(id => map.delete(id));
  else ids.forEach(id => setWell(map, id, state.paint));
}
// row / column / corner header fills (wells themselves are handled by pointer drag below)
$('rackGrid').addEventListener('click', e => {
  const el = e.target.closest('[data-plate]'); if (!el) return;
  const map = state.plates[+el.dataset.plate];
  if (el.dataset.row) bulkPaint(map, COLS.map(c => el.dataset.row + c));
  else if (el.dataset.col) bulkPaint(map, ROWS.map(r => r + el.dataset.col));
  else if (el.dataset.corner) bulkPaint(map, ROWS.flatMap(r => COLS.map(c => r + c)));
  else return;
  refresh();
});

/* ---------- drag-to-paint a rectangular block of wells (works on the racks and the 384 modal) ---------- */
let drag = null;

// grid context for a well element: which container, coordinate lists, and target Map
function gridCtx(el) {
  if (el.closest('#rackGrid')) return { gridEl: $('rackGrid'), rows: ROWS, cols: COLS, is384: false };
  if (el.closest('#plate384grid')) return { gridEl: $('plate384grid'), rows: ROWS384, cols: COLS384, is384: true };
  return null;
}
const cellRC = (id, rows, cols) => [rows.indexOf(id[0]), cols.indexOf(id.slice(1))];
function wellUnder(e) {
  let el = (document.elementFromPoint && document.elementFromPoint(e.clientX, e.clientY)) || null;
  el = el && el.closest ? el.closest('[data-well]') : null;
  if (!el && e.target && e.target.closest) el = e.target.closest('[data-well]'); // fallback (fast moves / headless)
  return el;
}
function rectBounds(d) { return [Math.min(d.r0, d.r1), Math.max(d.r0, d.r1), Math.min(d.c0, d.c1), Math.max(d.c0, d.c1)]; }
function paintPreview() {
  clearPreview();
  if (!drag) return;
  const [rA, rB, cA, cB] = rectBounds(drag);
  const cls = drag.erasing ? 'drag-erase' : 'drag-paint';
  for (let r = rA; r <= rB; r++) for (let c = cA; c <= cB; c++) {
    const id = drag.rows[r] + drag.cols[c];
    const sel = drag.is384 ? `[data-well="${id}"]` : `[data-plate="${drag.plate}"][data-well="${id}"]`;
    const el = drag.gridEl.querySelector(sel);
    if (el) el.classList.add(cls);
  }
}
function clearPreview() { document.querySelectorAll('.drag-paint, .drag-erase').forEach(el => el.classList.remove('drag-paint', 'drag-erase')); }
function dragMap(d) { return d.is384 ? state.plate384 : state.plates[+d.plate]; }
function dragRerender(d) { if (d.is384) render384(); else refresh(); }

let lastTap = { t: 0, key: '' };  // detect a double-click on a well (survives re-render)
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-well]'); if (!el) return;
  const ctx = gridCtx(el); if (!ctx) return;
  e.preventDefault();
  const plate = el.dataset.plate;
  const key = plate + ':' + el.dataset.well;
  const now = Date.now();
  if (now - lastTap.t < 350 && lastTap.key === key) {  // double-click a well → clear that plate's painted wells
    lastTap = { t: 0, key: '' };
    drag = null; clearPreview();
    if (ctx.is384) clear384(); else clearPainted();
    return;
  }
  lastTap = { t: now, key };
  const [r, c] = cellRC(el.dataset.well, ctx.rows, ctx.cols);
  const cur = (ctx.is384 ? state.plate384 : state.plates[+plate]).get(el.dataset.well);
  drag = { plate, r0: r, c0: c, r1: r, c1: c, erasing: !!(cur && cur.type === state.paint), moved: false, rows: ctx.rows, cols: ctx.cols, gridEl: ctx.gridEl, is384: ctx.is384 };
  paintPreview();
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const el = wellUnder(e); if (!el) return;
  const ctx = gridCtx(el); if (!ctx || ctx.is384 !== drag.is384) return; // stay within the anchor grid
  if (!drag.is384 && el.dataset.plate !== drag.plate) return;  // and within the anchor rack
  const [r, c] = cellRC(el.dataset.well, drag.rows, drag.cols);
  if (r !== drag.r1 || c !== drag.c1) { drag.r1 = r; drag.c1 = c; drag.moved = true; paintPreview(); }
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  clearPreview();
  const map = dragMap(d);
  if (!d.moved) {
    paintWell(map, d.rows[d.r0] + d.cols[d.c0]);   
  } else {
    const [rA, rB, cA, cB] = rectBounds(d);
    for (let r = rA; r <= rB; r++) for (let c = cA; c <= cB; c++) {
      const id = d.rows[r] + d.cols[c];
      if (d.erasing) map.delete(id); else setWell(map, id, state.paint);
    }
  }
  dragRerender(d);
});
document.addEventListener('pointercancel', () => { drag = null; clearPreview(); });

function clearPainted() { state.plates.forEach(m => m.clear()); lastImportSlot = null; refresh(); }
$('clearAll').addEventListener('click', clearPainted);
$('rackGrid').addEventListener('dblclick', clearPainted); // double-click gaps/headers also clears
$('addBtn').addEventListener('click', addToQueue);
$('removeLastBtn').addEventListener('click', removeLastBatch);
$('clearQueueBtn').addEventListener('click', clearQueue);
