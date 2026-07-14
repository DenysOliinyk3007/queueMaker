'use strict';
/* ---------- 384-well plate modal + quadrant translation ---------- */
function render384() {
  const wells = state.plate384;
  let grid = '<table class="mp mp384"><thead><tr><th><div class="corner" data-plate="384" data-corner="1" title="Fill / clear plate"></div></th>';
  for (const col of COLS384) grid += `<th><div class="hcol" data-plate="384" data-col="${col}">${col}</div></th>`;
  grid += '</tr></thead><tbody>';
  for (const row of ROWS384) {
    grid += `<tr><th><div class="hrow" data-plate="384" data-row="${row}">${row}</div></th>`;
    for (const col of COLS384) {
      const id = row + col, cell = wells.get(id), type = cell && cell.type;
      grid += `<td><div class="well${type ? ' ' + type : ''}" data-plate="384" data-well="${id}" title="${id}"></div></td>`;
    }
    grid += '</tr>';
  }
  grid += '</tbody></table>';
  $('plate384grid').innerHTML = grid;
  let ns = 0, nq = 0, nb = 0; for (const v of wells.values()) v.type === 'blank' ? nb++ : v.type === 'qc' ? nq++ : ns++;
  const parts = [ns && `<b>${ns}</b> samples`, nq && `<b>${nq}</b> QC`, nb && `<b>${nb}</b> blanks`].filter(Boolean).join(' · ');
  $('plate384info').innerHTML = wells.size ? `${parts} selected` : 'Paint wells (click / drag / row-column headers), then Translate.';
}
function clear384() { state.plate384.clear(); render384(); }
$('plate384grid').addEventListener('click', e => {
  const el = e.target.closest('[data-plate="384"]'); if (!el) return;
  const map = state.plate384;
  if (el.dataset.row) bulkPaint(map, COLS384.map(c => el.dataset.row + c));
  else if (el.dataset.col) bulkPaint(map, ROWS384.map(r => r + el.dataset.col));
  else if (el.dataset.corner) bulkPaint(map, ROWS384.flatMap(r => COLS384.map(c => r + c)));
  else return;
  render384();
});
// Q1→rack0, Q2→rack1, … by default; preserves a valid existing choice
function populateQuadrantMap() {
  const rk = racks();
  document.querySelectorAll('#qSchema select[data-q]').forEach((sel, i) => {
    const keep = sel.value;
    sel.innerHTML = rk.map(r => `<option value="${r}">${r}</option>`).join('');
    sel.value = rk.includes(keep) ? keep : rk[Math.min(i, rk.length - 1)];
  });
}
function translate384() {
  if (!state.plate384.size) { flash('Paint some wells on the 384 plate first'); return; }
  const rk = racks();
  const qTarget = {};   // quadrant → rack index (from the schema dropdowns)
  document.querySelectorAll('#qSchema select[data-q]').forEach(sel => { qTarget[sel.dataset.q] = rk.indexOf(sel.value); });
  const summary = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const [id, cell] of state.plate384) {
    const rIdx = ROWS384.indexOf(id[0]), cIdx = COLS384.indexOf(id.slice(1));
    const { q, well96 } = to96(rIdx, cIdx);
    const rackIdx = qTarget[q];
    if (rackIdx == null || rackIdx < 0) continue;
    setNamedWell(state.plates[rackIdx], well96, cell.type, `Q${q}_${well96}`);
    summary[q]++;
  }
  closeModal();
  refresh();
  flash('Translated → ' + [1, 2, 3, 4].filter(q => summary[q]).map(q => `${rk[qTarget[q]]} Q${q}:${summary[q]}`).join('  '));
}
function openModal() { $('modal384').hidden = false; setPaint(state.paint); render384(); }
function closeModal() { $('modal384').hidden = true; }
$('translate384Btn').addEventListener('click', openModal);
$('close384').addEventListener('click', closeModal);
$('clear384').addEventListener('click', clear384);
$('translate384').addEventListener('click', translate384);
$('modal384').addEventListener('click', e => { if (e.target === $('modal384')) closeModal(); });   // backdrop click
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal384').hidden) closeModal(); });
