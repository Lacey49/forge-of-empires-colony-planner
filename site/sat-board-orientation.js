/* Enforce the verified Space Age Titan colony footprints on the actual board.
   The planner keeps boardW/boardH overrides separate from the visible w/h labels. */
(() => {
  if (window.__FOE_SAT_BOARD_ORIENTATION_V1__) return;
  window.__FOE_SAT_BOARD_ORIENTATION_V1__ = true;

  if (!ERA_DATA?.SAT) return;

  const corrected = {
    heatedResidence:          {w:4, h:3},
    matterCompressionReactor: {w:4, h:6},
    moleculeDrill:            {w:6, h:4},
    experimentalTestSite:     {w:5, h:4},
    purificationFacility:     {w:4, h:5},
    chemicalCleaningPlant:    {w:3, h:6}
  };

  for (const def of [...ERA_DATA.SAT.residential, ...ERA_DATA.SAT.goods]) {
    const next = corrected[def.key];
    if (!next) continue;

    // Keep both dimension systems in sync. boardW/boardH are what
    // eraBoardBuildingByKey() actually returns to placement/rendering code.
    def.w = next.w;
    def.h = next.h;
    def.boardW = next.w;
    def.boardH = next.h;
    def.sizeText = `${next.w}×${next.h}`;
    def.requiresPath = false;
  }

  if (selectedEra === 'SAT') {
    if (typeof renderBuildMenu === 'function') renderBuildMenu();
    if (typeof render === 'function') render();
  }
})();
