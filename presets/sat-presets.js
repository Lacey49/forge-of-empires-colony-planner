/* Refreshed SAT built-in presets. */
(() => {
  if (window.__FOE_SAT_PRESETS_V1__) return;
  window.__FOE_SAT_PRESETS_V1__ = true;

  if (
    typeof getPresetCatalog !== 'function' ||
    typeof colonyConfigCellState !== 'function'
  ) return;

  // All 17 expansions: 37 Screened Domiciles + 3 Igloos,
  // 12 unused tiles, 382,602 credits / 4h.
  const SCREENED_37_ALL_HUB = [4,15];
  const SCREENED_37_ALL_DOMICILES = [[0,0],[0,4],[0,8],[0,12],[4,0],[4,4],[4,8],[8,0],[8,4],[8,8],[8,20],[8,24],[9,12],[9,16],[12,0],[12,4],[12,8],[12,20],[12,24],[13,12],[13,16],[16,4],[16,8],[16,20],[16,24],[17,12],[17,16],[20,4],[20,8],[20,20],[20,24],[21,12],[21,16],[24,4],[24,8],[24,20],[24,24]];
  const SCREENED_37_ALL_IGLOOS = [[4,12],[25,12],[25,15]];

  function makeScreened37AllState() {
    const enabled = COLONY_CONFIGS.SAT.expansions.map(exp => exp.id);
    const enabledSet = new Set(enabled);
    const grid = Array.from({length:28}, (_,r) =>
      Array.from({length:28}, (_,c) => colonyConfigCellState('SAT',r,c,enabledSet))
    );
    const state = {
      era:'SAT',
      grid,
      buildings:[],
      hubTop:[...SCREENED_37_ALL_HUB],
      enabled:[...enabled],
      panX:0,
      panY:0,
      viewZoom:1
    };

    const hall = ERA_DATA.SAT.townHall;
    for (let dr=0; dr<hall.h; dr++) {
      for (let dc=0; dc<hall.w; dc++) grid[SCREENED_37_ALL_HUB[0]+dr][SCREENED_37_ALL_HUB[1]+dc] = 'hub';
    }

    const addBuilding = (type,r,c) => {
      const def = eraBoardBuildingByKey('SAT',type);
      const cells = [];
      for (let dr=0; dr<def.h; dr++) {
        for (let dc=0; dc<def.w; dc++) {
          grid[r+dr][c+dc] = type;
          cells.push([r+dr,c+dc]);
        }
      }
      state.buildings.push({type,r,c,cells});
    };

    for (const [r,c] of SCREENED_37_ALL_DOMICILES) addBuilding('screenedDomicile',r,c);
    for (const [r,c] of SCREENED_37_ALL_IGLOOS) addBuilding('igloo',r,c);
    return state;
  }

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function(...args) {
    const result = originalGetPresetCatalog.apply(this,args);
    if (selectedEra !== 'SAT') return result;

    if (!result.some(p => p?.id === 'builtin:sat-screened-domiciles-all')) {
      const preset = {
        id:'builtin:sat-screened-domiciles-all',
        name:'Screened Domiciles (37)',
        kind:'Built-in',
        state:makeScreened37AllState(),
        era:'SAT'
      };
      const startingIndex = result.findIndex(p => p?.id === 'builtin:sat-screened-domiciles');
      result.splice(startingIndex >= 0 ? startingIndex + 1 : result.length, 0, preset);
    }
    return result;
  };
})();
