/* Refreshed SAAB built-in presets. */
(() => {
  if (window.__FOE_SAAB_PRESETS_V1__) return;
  window.__FOE_SAAB_PRESETS_V1__ = true;

  if (
    typeof makeSaabPresetState !== 'function' ||
    typeof getPresetCatalog !== 'function' ||
    typeof colonyConfigCellState !== 'function'
  ) return;

  // Starting colony: 59 Movable Abodes, 65 paths, 26 unused tiles.
  const MOVABLE_59_HUB = [0,8];
  const MOVABLE_59_BUILDINGS = [[0,13],[0,16],[0,18],[0,21],[2,13],[2,16],[2,18],[2,21],[4,26],[5,8],[5,11],[5,13],[5,16],[5,18],[5,21],[5,23],[6,26],[7,8],[7,11],[7,13],[7,16],[7,18],[7,21],[7,23],[8,26],[9,8],[9,11],[9,13],[9,16],[9,18],[9,21],[9,23],[10,26],[11,8],[11,11],[11,13],[11,16],[11,18],[11,21],[11,23],[12,26],[13,11],[13,13],[13,16],[13,18],[13,21],[13,23],[14,9],[14,25],[15,13],[15,16],[15,18],[15,21],[17,12],[17,16],[17,18],[17,22],[18,14],[18,20]];
  const MOVABLE_59_PATHS = [[1,15],[1,20],[2,15],[2,20],[3,15],[3,20],[4,13],[4,14],[4,15],[4,16],[4,17],[4,18],[4,19],[4,20],[4,21],[4,22],[4,23],[4,24],[4,25],[5,10],[5,15],[5,20],[5,25],[6,10],[6,15],[6,20],[6,25],[7,10],[7,15],[7,20],[7,25],[8,10],[8,15],[8,20],[8,25],[9,10],[9,15],[9,20],[9,25],[10,10],[10,15],[10,20],[10,25],[11,10],[11,15],[11,20],[11,25],[12,10],[12,15],[12,20],[12,25],[13,10],[13,15],[13,20],[13,25],[14,15],[14,20],[15,15],[15,20],[16,15],[16,20],[17,14],[17,15],[17,20],[17,21]];

  // All 23 expansions: 88 Deep-Seated Housing + 2 Movable Abodes,
  // 134 paths, 25 unused tiles.
  const DEEP_88_ALL_HUB = [23,19];
  const DEEP_88_ALL_BUILDINGS = [[0,9],[0,12],[0,15],[0,18],[0,21],[0,25],[2,25],[3,9],[3,12],[3,15],[3,18],[3,21],[4,0],[4,25],[5,3],[5,6],[5,9],[5,12],[5,15],[5,18],[5,21],[6,25],[8,0],[8,3],[8,6],[8,9],[8,12],[8,15],[8,18],[8,21],[8,25],[10,0],[10,3],[10,6],[10,9],[10,12],[10,15],[10,18],[10,21],[10,25],[12,25],[13,0],[13,3],[13,6],[13,9],[13,12],[13,15],[13,18],[13,21],[14,25],[15,0],[15,3],[15,6],[15,9],[15,12],[15,15],[15,18],[15,21],[16,25],[18,0],[18,3],[18,6],[18,9],[18,12],[18,15],[18,18],[18,21],[18,25],[20,0],[20,3],[20,6],[20,9],[20,12],[20,15],[20,18],[20,21],[20,25],[22,25],[23,4],[23,7],[23,10],[23,13],[23,16],[25,4],[25,7],[25,10],[25,13],[25,16]];
  const DEEP_88_ALL_MOVABLES = [[6,0],[22,0]];
  const DEEP_88_ALL_PATHS = [[1,24],[2,11],[2,12],[2,13],[2,14],[2,15],[2,16],[2,17],[2,18],[2,19],[2,20],[2,21],[2,22],[2,23],[2,24],[3,24],[4,24],[5,24],[6,2],[6,24],[7,2],[7,3],[7,4],[7,5],[7,6],[7,7],[7,8],[7,9],[7,10],[7,11],[7,12],[7,13],[7,14],[7,15],[7,16],[7,17],[7,18],[7,19],[7,20],[7,21],[7,22],[7,23],[7,24],[8,24],[9,24],[10,24],[11,24],[12,2],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8],[12,9],[12,10],[12,11],[12,12],[12,13],[12,14],[12,15],[12,16],[12,17],[12,18],[12,19],[12,20],[12,21],[12,22],[12,23],[12,24],[13,24],[14,24],[15,24],[16,24],[17,2],[17,3],[17,4],[17,5],[17,6],[17,7],[17,8],[17,9],[17,10],[17,11],[17,12],[17,13],[17,14],[17,15],[17,16],[17,17],[17,18],[17,19],[17,20],[17,21],[17,22],[17,23],[17,24],[18,24],[19,24],[20,24],[21,24],[22,2],[22,3],[22,4],[22,5],[22,6],[22,7],[22,8],[22,9],[22,10],[22,11],[22,12],[22,13],[22,14],[22,15],[22,16],[22,17],[22,18],[22,19],[22,24],[23,24],[27,6],[27,7],[27,8],[27,9],[27,10],[27,11],[27,12],[27,13],[27,14],[27,15],[27,16],[27,17],[27,18]];

  function makeState({enabled, hub, roads, deep = [], movable = []}) {
    const enabledSet = new Set(enabled);
    const grid = Array.from({length:28}, (_,r) =>
      Array.from({length:28}, (_,c) => colonyConfigCellState('SAAB',r,c,enabledSet))
    );
    const state = {
      era:'SAAB',
      grid,
      buildings:[],
      hubTop:[...hub],
      enabled:[...enabled],
      panX:0,
      panY:0,
      viewZoom:1
    };

    const hall = ERA_DATA.SAAB.townHall;
    for (let dr=0; dr<hall.h; dr++) {
      for (let dc=0; dc<hall.w; dc++) grid[hub[0]+dr][hub[1]+dc] = 'hub';
    }
    for (const [r,c] of roads) grid[r][c] = 'road';

    const addBuilding = (type,r,c) => {
      const def = eraBoardBuildingByKey('SAAB',type);
      const cells = [];
      for (let dr=0; dr<def.h; dr++) {
        for (let dc=0; dc<def.w; dc++) {
          grid[r+dr][c+dc] = type;
          cells.push([r+dr,c+dc]);
        }
      }
      state.buildings.push({type,r,c,cells});
    };

    for (const [r,c] of deep) addBuilding('deep',r,c);
    for (const [r,c] of movable) addBuilding('movable',r,c);
    return state;
  }

  function makeMovable59State() {
    return makeState({
      enabled:[],
      hub:MOVABLE_59_HUB,
      roads:MOVABLE_59_PATHS,
      movable:MOVABLE_59_BUILDINGS
    });
  }

  function makeDeep88AllState() {
    return makeState({
      enabled:COLONY_CONFIGS.SAAB.expansions.map(exp => exp.id),
      hub:DEEP_88_ALL_HUB,
      roads:DEEP_88_ALL_PATHS,
      deep:DEEP_88_ALL_BUILDINGS,
      movable:DEEP_88_ALL_MOVABLES
    });
  }

  const originalMakeSaabPresetState = makeSaabPresetState;
  makeSaabPresetState = function(kind) {
    if (kind === 'early') return makeMovable59State();
    return originalMakeSaabPresetState(kind);
  };

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function(...args) {
    const result = originalGetPresetCatalog.apply(this,args);
    if (selectedEra !== 'SAAB') return result;

    const movablePreset = result.find(p => p?.id === 'builtin:early');
    if (movablePreset) {
      movablePreset.name = 'Movable Abodes (59)';
      movablePreset.state = makeMovable59State();
    }

    if (!result.some(p => p?.id === 'builtin:saab-deep-all')) {
      const allPreset = {
        id:'builtin:saab-deep-all',
        name:'Deep-Seated Housing (88)',
        kind:'Built-in',
        state:makeDeep88AllState(),
        era:'SAAB'
      };
      const startingDeepIndex = result.findIndex(p => p?.id === 'builtin:late');
      result.splice(startingDeepIndex >= 0 ? startingDeepIndex + 1 : result.length, 0, allPreset);
    }

    return result;
  };
})();
