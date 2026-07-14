'use strict';
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffleWith(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// a sample's "condition" = its raw imported name (whole name); non-imported wells are each their own
function conditionKey(it) { return it.cond != null ? it.cond : '#' + it.rack + it.well; }

/* reorder ONLY sample items; QCs and painted blanks keep their positions.
   mode 'slot'      → shuffle samples within each rack
        'full'      → shuffle all samples together
        'condition' → group by condition (first-appearance order), shuffle within each */
function orderSamples(seq, mode, seed) {
  if (mode === 'off') return seq;
  const rnd = makeRng(seed);
  const out = seq.slice();
  const idx = [];
  seq.forEach((it, i) => { if (it.type === 'sample') idx.push(i); });

  if (mode === 'slot') {
    const groups = {};
    idx.forEach(i => { (groups[seq[i].rack] = groups[seq[i].rack] || []).push(i); });
    Object.values(groups).forEach(g => { const sh = shuffleWith(g.map(i => seq[i]), rnd); g.forEach((p, k) => out[p] = sh[k]); });
    return out;
  }

  let ordered;
  if (mode === 'condition' || mode === 'conditionKeep' || mode === 'slotGroup' || mode === 'slotKeep') {
    const bySlot = mode === 'slotGroup' || mode === 'slotKeep';
    const shuffleWithin = mode === 'condition' || mode === 'slotGroup';
    const groups = new Map();                 // preserves first-appearance order of groups
    idx.forEach(i => { const k = bySlot ? seq[i].rack : conditionKey(seq[i]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(seq[i]); });
    ordered = [];
    groups.forEach(g => ordered.push(...(shuffleWithin ? shuffleWith(g, rnd) : g)));   // shuffle within, or keep order
  } else {   // 'full'
    ordered = shuffleWith(idx.map(i => seq[i]), rnd);
  }
  idx.forEach((p, k) => out[p] = ordered[k]);
  return out;
}

/* insert auto blank/wash runs per the Blanks block; positions cycle A1, A2… in the blank rack */
function insertBlanks(seq, c) {
  if (!c.blankBracket && c.blankInterval === 'none') return seq;
  const positions = ROWS.flatMap(r => COLS.map(col => r + col));
  let bi = 0;
  const nextBlank = () => ({ type: 'blank', rack: c.blankRack, well: positions[(bi++) % positions.length], cfg: c, label: '' });
  const out = [];
  for (let k = 0; k < c.blankBracket; k++) out.push(nextBlank());     // before the run
  if (c.blankInterval === 'every') {
    let n = 0;
    for (const it of seq) { out.push(it); if (it.type === 'sample' && ++n % c.blankEvery === 0) out.push(nextBlank()); }
  } else if (c.blankInterval === 'between') {
    let prev = null;
    for (const it of seq) {
      if (it.type === 'sample') { const k = conditionKey(it); if (prev !== null && k !== prev) out.push(nextBlank()); prev = k; }
      out.push(it);
    }
  } else if (c.blankInterval === 'betweenSlots') {
    let prev = null;
    for (const it of seq) {
      if (it.type === 'sample') { if (prev !== null && it.rack !== prev) out.push(nextBlank()); prev = it.rack; }
      out.push(it);
    }
  } else {
    out.push(...seq);
  }
  for (let k = 0; k < c.blankBracket; k++) out.push(nextBlank());     // after the run
  return out;
}

// one CSV row for the active instrument, using the batch's own captured config.
// rack is the full rack label ("S1" for Evosep, "R"/"G"/"B"/"Y" for Vanquish Neo)
function mkRow(cfg, inst, name, rack, well) {
  const lcCfg = LC_CONFIG[cfg.lc] || LC_CONFIG.Evosep;
  if (inst === 'Thermo') return [name, 'D:\\', instMethod(cfg), `${rack}:${well}`];
  if (inst === 'Bruker') return [`${rack}-${well}`, name, '', cfg.brukerSep, 'Standard', cfg.MSmethod, ''];   // Vial, Sample ID, Method Set, Separation, Injection, MS, Processing
  return [name, cfg.MSmethod, cfg.LCmethod, lcCfg.rackType, `${rack}`, lcCfg.plateType, 'Default', well, name];   // Sciex
}

/* ---------- build queue from the committed batches ---------- */
function buildQueue() {
  const inst = state.inst;
  const columns = inst === 'Thermo' ? ['File Name','Path','Instrument Method','Position']
                : inst === 'Bruker' ? ['Vial','Sample ID','Method Set','Separation Method','Injection Method','MS Method','Processing Method']
                : ['Sample Name','MS Method','LC Method','Rack Type','Rack Position','Plate Type','Plate Position','Vial Position','Data File'];

  const c = cfg();   // global config: blank settings + naming for auto-blanks
  const items = [];  // flatten batches in add order; each item carries its batch's cfg + condition
  state.batches.forEach(b => b.items.forEach(it => items.push({ ...it, cfg: b.cfg })));

  const rnd = document.querySelector('input[name="rnd"]:checked').value;
  // "between …" blanks only make sense once samples are grouped, so force the matching grouping
  const mode = c.blankInterval === 'between'      ? (rnd === 'off' ? 'conditionKeep' : 'condition')
             : c.blankInterval === 'betweenSlots' ? (rnd === 'off' ? 'slotKeep' : 'slotGroup')
             : rnd;
  let sequence = orderSamples(items, mode, state.seeds[rnd]);
  sequence = insertBlanks(sequence, c);

  let sampleCount = 0, qcCount = 0, blankCount = 0, blankSeq = 0;
  const usedRacks = new Set();
  const rows = sequence.map(it => {
    if (it.type === 'sample') sampleCount++; else if (it.type === 'qc') qcCount++; else blankCount++;
    usedRacks.add(it.rack);
    const nameWell = it.nameWell || it.well;   // "Q1_A1" for translated wells, else the plain well
    const name = it.name ? customName(it.cfg, it.type, it.name)
              : it.type === 'blank' ? blankName(it.cfg, it.label, blankSeq++)
              : it.type === 'qc'    ? qcName(it.cfg, it.label, nameWell)
              :                       sampleName(it.cfg, it.label, nameWell);
    return { cells: mkRow(it.cfg, inst, name, it.rack, it.well), type: it.type };
  });

  return { columns, rows, sampleCount, qcCount, blankCount, platesUsed: usedRacks.size, batchCount: state.batches.length };
}

/* ---------- CSV (Thermo/Sciex) ---------- */
function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(q) {
  const lines = [];
  if (state.inst === 'Thermo') lines.push('Bracket Type=4,');   // Xcalibur requires the trailing comma
  lines.push(q.columns.map(csvCell).join(','));
  for (const r of q.rows) lines.push(r.cells.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}
/* ---------- SpreadsheetML XML (Bruker HyStar SampleTable) ---------- */
function xmlEsc(v) { return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toXML(q) {
  const row = cells => '  <Row>' + cells.map(v => `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`).join('') + '</Row>';
  const body = [q.columns, ...q.rows.map(r => r.cells)].map(row).join('\n');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="SampleTable">
  <Table>
${body}
  </Table>
 </Worksheet>
</Workbook>
`;
}
