/* Current built-in preset overrides.
   New optimizer-tested presets can move here as they are refreshed. */
(() => {
  if (typeof makeSamPresetState !== 'function' || typeof getPresetCatalog !== 'function') return;

  const SAM_DROP_POD_60_HUB = [12, 18];
  const SAM_DROP_POD_60_BUILDINGS = [[4,4],[4,6],[4,8],[4,10],[4,12],[4,14],[4,16],[4,18],[7,4],[7,6],[7,8],[7,10],[7,12],[7,14],[7,16],[8,19],[8,21],[9,4],[9,6],[9,8],[9,10],[9,12],[9,14],[9,16],[10,19],[10,21],[12,4],[12,6],[12,8],[12,10],[12,12],[12,14],[12,16],[14,4],[14,6],[14,8],[14,10],[14,12],[14,14],[14,16],[17,4],[17,6],[17,8],[17,10],[17,12],[17,14],[17,16],[18,19],[18,21],[19,8],[19,10],[19,12],[19,14],[19,16],[22,8],[22,10],[22,12],[22,14],[22,16],[22,18]];
  const SAM_DROP_POD_60_PATHS = [[6,5],[6,6],[6,7],[6,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[6,15],[6,16],[6,17],[6,18],[7,18],[8,18],[9,18],[9,23],[10,18],[10,23],[11,5],[11,6],[11,7],[11,8],[11,9],[11,10],[11,11],[11,12],[11,13],[11,14],[11,15],[11,16],[11,17],[11,18],[11,23],[16,5],[16,6],[16,7],[16,8],[16,9],[16,10],[16,11],[16,12],[16,13],[16,14],[16,15],[16,16],[16,17],[18,18],[18,23],[19,18],[20,18],[21,9],[21,10],[21,11],[21,12],[21,13],[21,14],[21,15],[21,16],[21,17],[21,18]];

  const originalMakeSamPresetState = makeSamPresetState;
  makeSamPresetState = function(kind) {
    const state = originalMakeSamPresetState(kind);
    if (kind !== 'dropPods' || !state) return state;

    for (let r = 0; r < 28; r++) {
      for (let c = 0; c < 28; c++) {
        if (state.grid[r][c] === 'road' || state.grid[r][c] === 'hub' || state.grid[r][c] === 'dropPod') {
          state.grid[r][c] = 'empty';
        }
      }
    }

    state.buildings = [];
    state.hubTop = [...SAM_DROP_POD_60_HUB];
    state.enabled = [];

    for (let dr = 0; dr < 6; dr++) {
      for (let dc = 0; dc < 6; dc++) state.grid[SAM_DROP_POD_60_HUB[0] + dr][SAM_DROP_POD_60_HUB[1] + dc] = 'hub';
    }
    for (const [r,c] of SAM_DROP_POD_60_PATHS) state.grid[r][c] = 'road';
    for (const [r,c] of SAM_DROP_POD_60_BUILDINGS) {
      const cells = [];
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          state.grid[r + dr][c + dc] = 'dropPod';
          cells.push([r + dr, c + dc]);
        }
      }
      state.buildings.push({type:'dropPod', r, c, cells});
    }
    return state;
  };

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function(...args) {
    const result = originalGetPresetCatalog.apply(this, args);
    const preset = result?.find?.(p => p?.id === 'builtin:sam-drop-pods');
    if (preset) preset.name = 'Drop Pods (60)';
    return result;
  };
})();
