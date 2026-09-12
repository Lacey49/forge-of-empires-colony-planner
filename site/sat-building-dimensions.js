/* Correct non-rotatable Space Age Titan colony building orientations. */
(() => {
  if (window.__FOE_SAT_BUILDING_DIMENSIONS_V3__) return;
  window.__FOE_SAT_BUILDING_DIMENSIONS_V3__ = true;

  if (!ERA_DATA?.SAT?.goods) return;

  // Titan colony buildings do not connect to roads. Keep the per-building
  // metadata aligned with the era-level no-path rule used by the planner.
  for (const def of [
    ...ERA_DATA.SAT.residential,
    ...ERA_DATA.SAT.goods,
    ...ERA_DATA.SAT.lifeSupport
  ]) {
    def.requiresPath = false;
  }

  // The wiki lists the nominal footprints, while the in-game Titan colony
  // renders these five non-rotatable goods buildings in the opposite grid
  // orientation from the planner's original width/height interpretation.
  const corrected = {
    matterCompressionReactor: {w:4, h:6, sizeText:'4×6'},
    moleculeDrill:             {w:6, h:4, sizeText:'6×4'},
    experimentalTestSite:      {w:5, h:4, sizeText:'5×4'},
    purificationFacility:      {w:4, h:5, sizeText:'4×5'},
    chemicalCleaningPlant:     {w:3, h:6, sizeText:'3×6'}
  };

  const previous = Object.fromEntries(
    ERA_DATA.SAT.goods
      .filter(def => corrected[def.key])
      .map(def => [def.key, {w:def.w, h:def.h}])
  );

  for (const def of ERA_DATA.SAT.goods) {
    const next = corrected[def.key];
    if (!next) continue;
    def.w = next.w;
    def.h = next.h;
    def.sizeText = next.sizeText;
  }

  function cellsFor(r,c,w,h) {
    const cells=[];
    for (let dr=0; dr<h; dr++) {
      for (let dc=0; dc<w; dc++) cells.push([r+dr,c+dc]);
    }
    return cells;
  }

  function cellSet(cells) {
    return new Set((cells || []).map(([r,c]) => `${r},${c}`));
  }

  function matchesFootprint(building,dims) {
    if (
      !dims ||
      !Number.isInteger(building?.r) ||
      !Number.isInteger(building?.c) ||
      !Array.isArray(building?.cells)
    ) return false;

    const expected=cellsFor(building.r,building.c,dims.w,dims.h);
    const actual=cellSet(building.cells);
    return actual.size===expected.length && expected.every(([r,c]) => actual.has(`${r},${c}`));
  }

  function migrateState(state) {
    if (
      !state ||
      !Array.isArray(state.grid) ||
      state.grid.length !== 28 ||
      !Array.isArray(state.buildings)
    ) return false;

    // Only touch layouts that still use the original footprint. Corrected
    // layouts are deliberately ignored, making this migration safe on reload.
    const targets = state.buildings.filter(building =>
      corrected[building?.type] &&
      matchesFootprint(building,previous[building.type]) &&
      !matchesFootprint(building,corrected[building.type])
    );
    if (!targets.length) return false;

    const enabledSet = new Set(Array.isArray(state.enabled) ? state.enabled : []);
    const nextGrid = state.grid.map(row => Array.isArray(row) ? [...row] : row);

    // Remove the old footprints first so nearby corrected buildings can be
    // repacked without treating each other's obsolete orientation as occupied.
    for (const building of targets) {
      const old = previous[building.type];
      for (const [r,c] of cellsFor(building.r,building.c,old.w,old.h)) {
        if (r<0 || r>=28 || c<0 || c>=28) continue;
        if (nextGrid[r]?.[c] === building.type) {
          nextGrid[r][c] = colonyConfigCellState('SAT',r,c,enabledSet);
        }
      }
    }

    const placements=[];

    for (const building of targets) {
      const old = previous[building.type];
      const next = corrected[building.type];
      const oldCenterR = building.r + (old.h - 1) / 2;
      const oldCenterC = building.c + (old.w - 1) / 2;
      let best=null;

      for (let r=0; r<=28-next.h; r++) {
        for (let c=0; c<=28-next.w; c++) {
          const cells=cellsFor(r,c,next.w,next.h);
          const valid=cells.every(([rr,cc]) =>
            colonyConfigCellState('SAT',rr,cc,enabledSet) === 'empty' &&
            nextGrid[rr]?.[cc] === 'empty'
          );
          if (!valid) continue;

          const centerR = r + (next.h - 1) / 2;
          const centerC = c + (next.w - 1) / 2;
          const score = Math.abs(centerR-oldCenterR) + Math.abs(centerC-oldCenterC);
          const anchorPenalty = Math.abs(r-building.r) + Math.abs(c-building.c);

          if (!best || score < best.score || (score === best.score && anchorPenalty < best.anchorPenalty)) {
            best={r,c,cells,score,anchorPenalty};
          }
        }
      }

      // Do not silently delete a user's building. If the corrected footprint
      // cannot be placed anywhere, leave the saved state untouched.
      if (!best) return false;

      placements.push({building,best});
      for (const [r,c] of best.cells) nextGrid[r][c]=building.type;
    }

    state.grid=nextGrid;
    for (const {building,best} of placements) {
      building.r=best.r;
      building.c=best.c;
      building.cells=best.cells;
    }
    return true;
  }

  let workspaceChanged=false;
  const slot=workspace?.eras?.SAT;
  if (slot) {
    if (migrateState(slot.currentView)) workspaceChanged=true;
    if (migrateState(slot.freeBuild)) workspaceChanged=true;
    for (const preset of Object.values(slot.customPresets || {})) {
      if (migrateState(preset?.state)) workspaceChanged=true;
    }
    if (workspaceChanged && typeof saveWorkspace === 'function') saveWorkspace();
  }

  // The external modules load after the initial colony restore. Refresh the
  // live SAT state once so an already-open Titan colony adopts the correction.
  if (selectedEra === 'SAT') {
    const current = slot?.currentView;
    if (current && typeof applyColonyState === 'function') {
      applyColonyState(current,{preserveCamera:true});
    } else {
      if (typeof renderBuildMenu === 'function') renderBuildMenu();
      if (typeof render === 'function') render();
    }
  }
})();
