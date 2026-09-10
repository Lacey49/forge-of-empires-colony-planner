/* Refreshed SAV built-in presets. */
(() => {
  if (window.__FOE_SAV_PRESETS_V1__) return;
  window.__FOE_SAV_PRESETS_V1__ = true;

  if (
    typeof makeSavPresetState !== 'function' ||
    typeof getPresetCatalog !== 'function' ||
    typeof colonyConfigCellState !== 'function'
  ) return;

  // Starting colony: 39 Inflatable Homes + 5 Floating Shelters,
  // 51 paths, 22 unused tiles, 82,107 credits / 4h.
  const INFLATABLE_39_HUB = [4,7];
  const INFLATABLE_39_HOMES = [[0,8],[0,10],[0,12],[0,14],[0,16],[0,18],[4,4],[4,12],[4,14],[4,16],[4,18],[7,18],[9,4],[9,7],[9,9],[10,11],[10,13],[10,15],[10,17],[12,4],[12,7],[13,11],[13,13],[13,15],[13,17],[14,9],[15,4],[16,18],[17,12],[17,14],[17,16],[18,4],[18,7],[18,9],[20,12],[21,4],[21,7],[21,9],[21,14]];
  const INFLATABLE_39_FLOATING = [[7,4],[7,12],[7,14],[7,16],[15,7]];
  const INFLATABLE_39_PATHS = [[3,9],[3,11],[3,12],[3,13],[3,14],[3,15],[3,16],[3,17],[3,18],[6,6],[8,6],[9,6],[9,11],[9,12],[9,13],[9,14],[9,15],[9,16],[9,17],[10,6],[11,6],[12,6],[13,6],[14,6],[15,6],[16,6],[16,11],[16,12],[16,13],[16,14],[16,15],[16,16],[16,17],[17,6],[17,7],[17,8],[17,9],[17,10],[17,11],[18,6],[18,11],[19,6],[19,11],[20,6],[20,11],[21,6],[21,11],[22,11],[23,11],[23,12],[23,13]];

  function makeInflatable39State() {
    const enabledSet = new Set();
    const grid = Array.from({length:28}, (_,r) =>
      Array.from({length:28}, (_,c) => colonyConfigCellState('SAV',r,c,enabledSet))
    );
    const state = {
      era:'SAV',
      grid,
      buildings:[],
      hubTop:[...INFLATABLE_39_HUB],
      enabled:[],
      panX:0,
      panY:0,
      viewZoom:1
    };

    const hall = ERA_DATA.SAV.townHall;
    for (let dr=0; dr<hall.h; dr++) {
      for (let dc=0; dc<hall.w; dc++) grid[INFLATABLE_39_HUB[0]+dr][INFLATABLE_39_HUB[1]+dc] = 'hub';
    }
    for (const [r,c] of INFLATABLE_39_PATHS) grid[r][c] = 'road';

    const addBuilding = (type,r,c) => {
      const def = eraBoardBuildingByKey('SAV',type);
      const cells = [];
      for (let dr=0; dr<def.h; dr++) {
        for (let dc=0; dc<def.w; dc++) {
          grid[r+dr][c+dc] = type;
          cells.push([r+dr,c+dc]);
        }
      }
      state.buildings.push({type,r,c,cells});
    };

    for (const [r,c] of INFLATABLE_39_HOMES) addBuilding('inflatableHome',r,c);
    for (const [r,c] of INFLATABLE_39_FLOATING) addBuilding('floatingShelter',r,c);
    return state;
  }

  const originalMakeSavPresetState = makeSavPresetState;
  makeSavPresetState = function(kind) {
    if (kind === 'inflatableHomes') return makeInflatable39State();
    return originalMakeSavPresetState(kind);
  };

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function(...args) {
    const result = originalGetPresetCatalog.apply(this,args);
    if (selectedEra !== 'SAV') return result;

    const preset = result.find(p => p?.id === 'builtin:sav-inflatable-homes');
    if (preset) {
      preset.name = 'Inflatable Homes (39)';
      preset.state = makeInflatable39State();
    }
    return result;
  };
})();
