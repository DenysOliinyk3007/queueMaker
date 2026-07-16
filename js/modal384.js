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
      const cls = 'well' + (type ? ' ' + type : '') + (cell && cell.name ? ' named' : '');
      grid += `<td><div class="${cls}" data-plate="384" data-well="${id}" title="${cell && cell.name ? escapeAttr(cell.name) : id}"></div></td>`;
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
  // pre-flight: if two quadrants point at the same rack, their wells land on the same position
  const seen = new Set(), clashes = [];
  for (const [id] of state.plate384) {
    const { q, well96 } = to96(ROWS384.indexOf(id[0]), COLS384.indexOf(id.slice(1)));
    const rackIdx = qTarget[q];
    if (rackIdx == null || rackIdx < 0) continue;
    const key = rackIdx + ':' + well96;
    if (seen.has(key)) clashes.push(`${rk[rackIdx]} ${well96}`); else seen.add(key);
  }
  if (clashes.length && !window.confirm(`${clashes.length} rack position${clashes.length > 1 ? 's' : ''} would receive more than one sample because quadrants share a rack (e.g. ${[...new Set(clashes)].slice(0, 4).join(', ')}). Later wells overwrite earlier ones. Continue anyway?`)) return;
  const summary = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const [id, cell] of state.plate384) {
    const rIdx = ROWS384.indexOf(id[0]), cIdx = COLS384.indexOf(id.slice(1));
    const { q, well96 } = to96(rIdx, cIdx);
    const rackIdx = qTarget[q];
    if (rackIdx == null || rackIdx < 0) continue;
    if (cell.name) setImportedWell(state.plates[rackIdx], well96, cell.type, `Q${q}_${cell.name}`, cell.cond);
    else setNamedWell(state.plates[rackIdx], well96, cell.type, `Q${q}_${well96}`);
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

/* ---------- 384 layout dataset input (mirror of the main-menu import) ---------- */
// store an imported (named) well, so translate384 carries its name + condition to the rack
function setImportedWell(map, id, type, name, cond) {
  const cur = map.get(id);
  map.set(id, { type, seq: cur ? cur.seq : ++state.seq, name, cond, nameWell: undefined });
}
// empty 384 scaffold: header row (1–24) + rows A–P
function layoutTemplate384() {
  const lines = [',' + COLS384.join(',')];
  for (const r of ROWS384) lines.push(r + ','.repeat(COLS384.length));
  return lines.join('\r\n') + '\r\n';
}
// parse a 384 grid CSV into state.plate384 (types from the names, duplicates auto-numbered)
function importLayout384(text) {
  text = text.replace(/^﻿/, '').replace(/\r/g, '');
  const lines = text.split('\n').filter(l => l.trim().length);
  if (lines.length < 2) return { error: 'Need a header row (columns) plus at least one well row (A–P).' };
  const delim = detectDelimiter(lines[0]);
  const header = splitCSVLine(lines[0], delim).slice(1).map(normCol);
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCSVLine(lines[i], delim);
    const row = (f[0] || '').trim().toUpperCase();
    if (!ROWS384.includes(row)) continue;
    for (let c = 0; c < header.length; c++) {
      if (!COLS384.includes(header[c])) continue;
      const raw = (f[c + 1] || '').trim();
      if (raw) entries.push({ id: row + header[c], type: classifyName(raw), name: raw });
    }
  }
  if (!entries.length) return { error: 'No named wells found — expected a 384 grid (rows A–P down, columns 1–24 across).' };
  const counts = {};
  entries.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; });
  const numbered = Object.keys(counts).filter(k => counts[k] > 1).length;
  const running = {};
  entries.forEach(e => {
    e.cond = e.name;   // condition = the raw imported name, before numbering
    if (counts[e.name] > 1) { running[e.name] = (running[e.name] || 0) + 1; e.name = `${e.name}_${String(running[e.name]).padStart(2, '0')}`; }
  });
  const map = state.plate384;
  map.clear();
  let ns = 0, nq = 0, nb = 0;
  for (const e of entries) {
    map.set(e.id, { type: e.type, seq: ++state.seq, name: e.name, cond: e.cond });
    if (e.type === 'blank') nb++; else if (e.type === 'qc') nq++; else ns++;
  }
  return { n: entries.length, ns, nq, nb, delim, numbered };
}
$('downloadLayout384Btn').addEventListener('click', () => saveText('plate384_layout_template.csv', layoutTemplate384()));
$('importFile384').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const res = importLayout384(String(reader.result));
    const infoEl = $('plate384importInfo');
    if (res.error) {
      infoEl.innerHTML = `<span style="color:var(--danger)">${escapeHtml(res.error)}</span>`;
    } else {
      const bits = [`${res.ns} samples`, res.nq && `${res.nq} QC`, res.nb && `${res.nb} blanks`].filter(Boolean).join(', ');
      const sep = res.delim === ';' ? ' · semicolon-separated' : res.delim === '\t' ? ' · tab-separated' : '';
      const numbered = res.numbered ? ` <b>${res.numbered}</b> repeated name${res.numbered > 1 ? 's' : ''} auto-numbered (_01, _02, …).` : '';
      infoEl.innerHTML = `Imported <b>${res.n}</b> wells (${bits})${sep}.${numbered} Set the quadrant → rack schema, then Translate.`;
      render384();
    }
    e.target.value = '';   // let the same file be re-imported
  };
  reader.readAsText(file);
});
