/* Keep expansion changes and preset switching consistent with the visible colony. */
(() => {
  if (window.__FOE_STATE_CONSISTENCY_V1__) return;
  window.__FOE_STATE_CONSISTENCY_V1__ = true;

  if (
    typeof toggleExpansion !== 'function' ||
    typeof setExpansionCount !== 'function' ||
    typeof loadPresetItem !== 'function'
  ) return;

  const originalToggleExpansion = toggleExpansion;
  const originalSetExpansionCount = setExpansionCount;

  function cellsForBuildingRecord(building) {
    if (Array.isArray(building?.cells) && building.cells.length) return building.cells;
    if (building && typeof cellsFor === 'function') return cellsFor(building.type,building.r,building.c);
    return [];
  }

  function clearBuildingRecord(building) {
    for (const [r,c] of cellsForBuildingRecord(building)) {
      if (r < 0 || r >= 28 || c < 0 || c >= 28) continue;
      if (grid[r][c] === building.type) grid[r][c] = cellStateBase(r,c);
    }
  }

  function occupiedBuildingCells() {
    const occupied = new Set();
    for (const building of buildings) {
      for (const [r,c] of cellsForBuildingRecord(building)) occupied.add(r+','+c);
    }
    return occupied;
  }

  function hallFitsAt(top, occupied) {
    if (!Array.isArray(top) || top.length < 2) return false;
    for (const [r,c] of hubCells(top[0],top[1])) {
      if (r < 0 || r >= 28 || c < 0 || c >= 28 || !ownedCell(r,c)) return false;
      if (occupied?.has(r+','+c)) return false;
    }
    return true;
  }

  function chooseSafeHallPosition() {
    const cfg = activeColonyConfig();
    const preferred = Array.isArray(cfg?.defaultHub) ? [...cfg.defaultHub] : null;
    const occupied = occupiedBuildingCells();
    if (preferred && hallFitsAt(preferred,occupied)) return preferred;

    const hall = ERA_DATA[selectedEra]?.townHall;
    if (!hall) return preferred || [...hubTop];
    let best = null, bestScore = Infinity;
    const pr = preferred?.[0] ?? hubTop[0], pc = preferred?.[1] ?? hubTop[1];
    for (let r=0; r<=28-hall.h; r++) {
      for (let c=0; c<=28-hall.w; c++) {
        const top = [r,c];
        if (!hallFitsAt(top,occupied)) continue;
        const score = Math.abs(r-pr) + Math.abs(c-pc);
        if (score < bestScore) {
          bestScore = score;
          best = top;
        }
      }
    }
    return best || preferred || [...hubTop];
  }

  function removeBuildingsOverlapping(cellSet) {
    let removed = 0;
    const kept = [];
    for (const building of buildings) {
      const hit = cellsForBuildingRecord(building).some(([r,c]) => cellSet.has(r+','+c));
      if (!hit) {
        kept.push(building);
        continue;
      }
      clearBuildingRecord(building);
      removed++;
    }
    buildings = kept;
    return removed;
  }

  function sanitizeAfterLandChange() {
    let removedBuildings = 0;
    let removedRoads = 0;
    let movedHall = false;

    const kept = [];
    for (const building of buildings) {
      const cells = cellsForBuildingRecord(building);
      const valid = cells.length && cells.every(([r,c]) =>
        r >= 0 && r < 28 && c >= 0 && c < 28 && ownedCell(r,c)
      );
      if (valid) {
        kept.push(building);
      } else {
        clearBuildingRecord(building);
        removedBuildings++;
      }
    }
    buildings = kept;

    for (let r=0; r<28; r++) {
      for (let c=0; c<28; c++) {
        if (grid[r][c] === 'road' && !ownedCell(r,c)) {
          grid[r][c] = cellStateBase(r,c);
          removedRoads++;
        }
      }
    }

    const currentHallCells = hubCells(...hubTop);
    if (!currentHallCells.every(([r,c]) => ownedCell(r,c))) {
      for (const [r,c] of currentHallCells) {
        if (r >= 0 && r < 28 && c >= 0 && c < 28 && grid[r][c] === 'hub') {
          grid[r][c] = cellStateBase(r,c);
        }
      }

      const nextHub = chooseSafeHallPosition();
      const nextCells = hubCells(...nextHub);
      const nextSet = new Set(nextCells.map(([r,c]) => r+','+c));
      removedBuildings += removeBuildingsOverlapping(nextSet);

      for (const [r,c] of nextCells) {
        if (grid[r][c] === 'road') removedRoads++;
        grid[r][c] = cellStateBase(r,c);
      }
      hubTop = [...nextHub];
      applyHub();
      movedHall = true;
    }

    refreshLandPreservingLayout();
    renderExpGrid();
    render();
    persistColonyState(selectedEra);

    if (removedBuildings || removedRoads || movedHall) {
      const parts = [];
      if (removedBuildings) parts.push(removedBuildings+' building'+(removedBuildings===1?'':'s'));
      if (removedRoads) parts.push(removedRoads+' path'+(removedRoads===1?'':'s'));
      if (movedHall) parts.push('Town Hall moved onto owned land');
      if (typeof notifyToast === 'function') {
        notifyToast('Layout adjusted',parts.join(' · ')+'. Undo is available with Ctrl+Z.','success',4200);
      }
    }
  }

  toggleExpansion = function(id) {
    originalToggleExpansion(id);
    sanitizeAfterLandChange();
  };

  setExpansionCount = function(n) {
    originalSetExpansionCount(n);
    sanitizeAfterLandChange();
  };

  // Presets are a non-destructive view switch. Free Build is saved separately,
  // so there is no reason to warn that it is being removed.
  loadPresetItem = async function(item) {
    if (!item || !isEditableColonyEra(selectedEra)) return;

    const era = selectedEra;
    if (item.era && item.era !== era) return;
    if (!colonyStateMatchesGeometry(item.state,era)) return;
    if (selectedEra !== era) return;

    if (activeLayoutMode === 'free') persistColonyState(era);

    movingItem = null;
    clearRoadChain();
    setMode(null,false);

    activeLayoutMode = 'preset';
    activePresetId = item.id;
    preset = item.id;

    applyColonyState(item.state,{preserveCamera:true});
    updateLayoutModeButtons();
    closePresetPopover();
    persistColonyState(era);
  };
})();
