'use strict';
loadSettings();   // restore the user's previous inputs (if any) before first render
populateImportRack();
populateBlankRack();
populateQuadrantMap();
['MSmethod', 'ThermoMethodPath', 'LCmethod', 'brukerSep'].forEach(initCombo);   // searchable method dropdowns
setupCollapse();   // collapsible Randomization / Blanks
refresh();
