'use strict';
/* ---------- naming ---------- */
function fullExp(c, label) { return label ? `${c.expID}_${label}` : c.expID; }
// Thermo instrument method = method folder + method name, joined with exactly one backslash
function instMethod(c) {
  const folder = (c.thermoPath || '').replace(/[\\/]+$/, '');   // drop any trailing slash(es)
  return folder ? `${folder}\\${c.MSmethod}` : c.MSmethod;
}
// standard prefix up to the personal ID (shared by generated and imported names)
function prefixHead(c, tag) { return `${c.dateID}_${c.instID}_Eno${c.evosepNo}_${c.gradientID}_${tag}_${c.personalID}`; }
function prefix(c, label, tag) { return `${prefixHead(c, tag)}_${fullExp(c, label)}`; }
function sampleName(c, label, well) { return `${prefix(c, label, SAMPLE_TAG)}_${well}`; }
function qcName(c, label, well)     { return `${prefix(c, label, QC_TAG)}_QC_${well}`; }
function blankName(c, label, n)     { return `${prefix(c, label, SAMPLE_TAG)}_blank_${n}`; }
// imported name = standard prefix + the raw cell text (QC → ADIAMA tag, else SA)
function customName(c, type, raw) { return `${prefixHead(c, type === 'qc' ? QC_TAG : SAMPLE_TAG)}_${raw}`; }

// deterministic PRNG (mulberry32) so a given seed always yields the same shuffle
