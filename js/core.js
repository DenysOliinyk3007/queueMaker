"use strict";

const ROWS = ['A','B','C','D','E','F','G','H'];
const COLS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const ROWS384 = 'ABCDEFGHIJKLMNOP'.split('');                        
const COLS384 = Array.from({ length: 24 }, (_, i) => String(i + 1));

// map a 384 well (row/col index) to its quadrant (1–4) and 96-well position (standard interleave)
function to96(rIdx, cIdx) {
  const q = (rIdx % 2) * 2 + (cIdx % 2) + 1;                         // Q1 odd/odd, Q2 odd/even, Q3 even/odd, Q4 even/even
  const well96 = ROWS[Math.floor(rIdx / 2)] + (Math.floor(cIdx / 2) + 1);
  return { q, well96 };
}

// autosampler / LC configs
const LC_CONFIG = {
  Evosep:      { racks: ['S1','S2','S3','S4','S5','S6'], rackType: 'Evosep One tray',    plateType: '96 Evotip box' },
  VanquishNeo: { racks: ['R','G','B','Y'],               rackType: 'Vanquish well plate', plateType: '96 well plate' },
};
const TRAY_NAME = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' };
const TRAY_COLOR = { R: '#d24b3e', G: '#2f9e5f', B: '#3576cc', Y: '#c99a1e' };
const SAMPLE_TAG = 'SA';       // fixed identifier for samples & blanks
const QC_TAG = 'ADIAMA';       // fixed identifier for QCs
const $ = id => document.getElementById(id);

// which text fields are remembered between visits (date is intentionally excluded — it resets to today)
const STORE_KEY = 'queueMaker.settings.v1';
const PERSIST_FIELDS = ['instID','evosepNo','gradientID','personalID','expID','MSmethod','ThermoMethodPath','LCmethod','brukerSep','output_name','blankBracket','blankInterval','blankEvery','blankCount'];

/* ---------- state (starts empty) ---------- */
const state = {
  inst: 'Thermo',                                         
  lc: 'Evosep',                                           
  paint: 'sample',                                        
  plates: Array.from({ length: 6 }, () => new Map()),     
  seq: 0,                                                 
  batches: [],                                            
  activeRnd: 'off',                                       
  seeds: { slot: 1, full: 1, condition: 1 },              
  plate384: new Map(),                                    
};
function racks() { return LC_CONFIG[state.lc].racks; }    

// fresh seeds each session
['slot', 'full', 'condition'].forEach(m => state.seeds[m] = (Math.random() * 0x100000000) >>> 0);   


/* ---------- date default ---------- */
function todayStamp() { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`; }
$('dateID').value = todayStamp();


/* trimmed field value; empty stays empty (placeholders are examples, never real output) */
function val(id) { return $(id).value.trim(); }

function cfg() {
  return {
    inst: state.inst,
    instID: val('instID'), evosepNo: val('evosepNo'),
    gradientID: val('gradientID'), personalID: val('personalID'), dateID: val('dateID'),
    expID: val('expID'),
    MSmethod: val('MSmethod'), LCmethod: val('LCmethod'), thermoPath: val('ThermoMethodPath'), brukerSep: val('brukerSep'),
    random: document.querySelector('input[name="rnd"]:checked').value,   // 'off' | 'slot' | 'full' | 'condition'
    outputName: ($('output_name').value.trim() || 'queue.csv'),
    lc: state.lc,
    blankRack: $('blankRack').value,
    blankBracket: Math.max(0, parseInt($('blankBracket').value || '0', 10)),
    blankInterval: $('blankInterval').value,                             // 'none' | 'every' | 'between'
    blankEvery: Math.max(1, parseInt($('blankEvery').value || '1', 10)),
    blankCount: Math.max(1, parseInt($('blankCount').value || '1', 10)),   // how many blanks per break
  };
}

/* ---------- persistence (localStorage) ---------- */
function saveSettings() {
  try {
    const data = { inst: state.inst, lc: state.lc, random: document.querySelector('input[name="rnd"]:checked').value, fields: {} };
    PERSIST_FIELDS.forEach(id => { data.fields[id] = $(id).value; });
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable (private mode / file://) — silently skip */ }
}
function loadSettings() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return; }
  if (!data) return;
  if (data.fields) PERSIST_FIELDS.forEach(id => { if (data.fields[id] != null) $(id).value = data.fields[id]; });
  setInstrument(['Thermo', 'Sciex', 'Bruker'].includes(data.inst) ? data.inst : 'Thermo');
  setLC(data.lc || 'Evosep');
  if (data.random) {
    const r = document.querySelector(`input[name="rnd"][value="${data.random}"]`);
    if (r) r.checked = true;
    state.activeRnd = data.random;
  }
  syncRandomUI();
}
