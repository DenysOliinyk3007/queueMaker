'use strict';
/* ---------- saved method lists (localStorage) ---------- */
function methodKey(id) { return 'queueMaker.methods.' + id; }
function getMethodList(id) { try { return JSON.parse(localStorage.getItem(methodKey(id)) || '[]'); } catch (e) { return []; } }
function setMethodList(id, arr) { try { localStorage.setItem(methodKey(id), JSON.stringify(arr)); } catch (e) {} }
function saveMethod(id, val) {
  val = (val || '').trim(); if (!val) return;
  const a = getMethodList(id);
  if (!a.includes(val)) { a.push(val); a.sort((x, y) => x.localeCompare(y)); setMethodList(id, a); }
}
function deleteMethod(id, val) { setMethodList(id, getMethodList(id).filter(m => m !== val)); }

// which config field each method input maps to, for "remember on download"
const METHOD_FIELDS = { MSmethod: 'MSmethod', ThermoMethodPath: 'thermoPath', LCmethod: 'LCmethod', brukerSep: 'brukerSep' };
// on Download: save every method value used across the committed queue (+ the current field values)
function rememberMethods() {
  state.batches.forEach(b => { for (const id in METHOD_FIELDS) saveMethod(id, b.cfg[METHOD_FIELDS[id]]); });
  for (const id in METHOD_FIELDS) { const el = $(id); if (el) saveMethod(id, el.value); }
}

/* ---------- searchable method combobox (wraps a plain <input>) ---------- */
const TRASH_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>';
function initCombo(id) {
  const input = $(id);
  if (!input || input.dataset.combo) return;
  input.dataset.combo = '1';
  input.setAttribute('autocomplete', 'off');
  const wrap = document.createElement('div'); wrap.className = 'combo';
  input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
  const caret = document.createElement('button');
  caret.type = 'button'; caret.className = 'combo-caret'; caret.tabIndex = -1; caret.textContent = '▾';
  caret.setAttribute('aria-label', 'Saved methods');
  wrap.appendChild(caret);
  const panel = document.createElement('div'); panel.className = 'combo-panel'; panel.hidden = true;
  panel.innerHTML = '<input type="text" class="combo-search" placeholder="Search saved…" autocomplete="off"><div class="combo-list"></div><div class="combo-empty"></div>';
  wrap.appendChild(panel);
  const listEl = panel.querySelector('.combo-list'), searchEl = panel.querySelector('.combo-search'), emptyEl = panel.querySelector('.combo-empty');

  function render() {
    const all = getMethodList(id);
    const q = searchEl.value.trim().toLowerCase();
    const items = q ? all.filter(m => m.toLowerCase().includes(q)) : all;
    listEl.innerHTML = items.map(m =>
      `<div class="combo-item" data-val="${escapeAttr(m)}"><span class="combo-name" title="${escapeAttr(m)}">${escapeHtml(m)}</span>` +
      `<button type="button" class="combo-del" title="Delete this saved method" aria-label="Delete">${TRASH_SVG}</button></div>`).join('');
    emptyEl.textContent = all.length === 0 ? 'No saved items yet — type one; it’s saved when you download.' : (items.length === 0 ? 'No match.' : '');
    emptyEl.hidden = items.length !== 0;
  }
  function open(focusSearch) { render(); panel.hidden = false; wrap.classList.add('open'); if (focusSearch) searchEl.focus(); }
  function close() { panel.hidden = true; wrap.classList.remove('open'); }

  caret.addEventListener('click', () => panel.hidden ? open(true) : close());
  input.addEventListener('focus', () => open(false));
  searchEl.addEventListener('input', e => { e.stopPropagation(); render(); });
  searchEl.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); input.focus(); } });
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.combo-item'); if (!item) return;
    if (e.target.closest('.combo-del')) { e.stopPropagation(); deleteMethod(id, item.dataset.val); render(); return; }
    input.value = item.dataset.val;
    input.dispatchEvent(new Event('input', { bubbles: true }));   // update preview + persist
    close();
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
}

/* ---------- collapsible fieldsets (Randomization, Blanks) ---------- */
function saveCollapse() {
  const o = {};
  document.querySelectorAll('fieldset.collapsible').forEach(fs => o[fs.id] = fs.classList.contains('open'));
  try { localStorage.setItem('queueMaker.collapse', JSON.stringify(o)); } catch (e) {}
}
function setupCollapse() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('queueMaker.collapse') || '{}'); } catch (e) {}
  document.querySelectorAll('fieldset.collapsible').forEach(fs => {
    if (fs.id in saved) fs.classList.toggle('open', !!saved[fs.id]);   // remembered state wins; else HTML default
    fs.querySelector('legend').addEventListener('click', () => { fs.classList.toggle('open'); saveCollapse(); });
  });
}
