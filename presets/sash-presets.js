/* Refreshed SASH built-in presets. */
(() => {
  if (window.__FOE_SASH_PRESETS_V1__) return;
  window.__FOE_SASH_PRESETS_V1__ = true;

  if (
    typeof getPresetCatalog !== "function" ||
    typeof colonyConfigCellState !== "function"
  )
    return;

  // All 16 expansions: 37 Officers Quarters + 2 Simple Crew Quarters,
  // 10 unused tiles, 346,000 credits / 4h.
  const OFFICERS_37_ALL_HUB = [18, 17];
  const OFFICERS_37_ALL_QUARTERS = [
    [0, 8],
    [0, 12],
    [0, 16],
    [4, 0],
    [4, 4],
    [4, 8],
    [4, 12],
    [4, 16],
    [4, 20],
    [4, 24],
    [8, 0],
    [8, 4],
    [8, 8],
    [8, 12],
    [8, 16],
    [8, 20],
    [8, 24],
    [12, 0],
    [12, 4],
    [12, 8],
    [12, 12],
    [12, 16],
    [12, 20],
    [12, 24],
    [16, 0],
    [16, 4],
    [16, 8],
    [16, 12],
    [16, 24],
    [20, 0],
    [20, 4],
    [20, 8],
    [20, 12],
    [20, 24],
    [24, 8],
    [24, 12],
    [24, 16],
  ];
  const OFFICERS_37_ALL_CREW = [
    [16, 16],
    [16, 19],
  ];

  function makeOfficers37AllState() {
    const enabled = COLONY_CONFIGS.SASH.expansions.map((exp) => exp.id);
    const enabledSet = new Set(enabled);
    const grid = Array.from({ length: 28 }, (_, r) =>
      Array.from({ length: 28 }, (_, c) =>
        colonyConfigCellState("SASH", r, c, enabledSet),
      ),
    );
    const state = {
      era: "SASH",
      grid,
      buildings: [],
      hubTop: [...OFFICERS_37_ALL_HUB],
      enabled: [...enabled],
      panX: 0,
      panY: 0,
      viewZoom: 1,
    };

    const hall = ERA_DATA.SASH.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++)
        grid[OFFICERS_37_ALL_HUB[0] + dr][OFFICERS_37_ALL_HUB[1] + dc] = "hub";
    }

    const addBuilding = (type, r, c) => {
      const def = eraBoardBuildingByKey("SASH", type);
      const cells = [];
      for (let dr = 0; dr < def.h; dr++) {
        for (let dc = 0; dc < def.w; dc++) {
          grid[r + dr][c + dc] = type;
          cells.push([r + dr, c + dc]);
        }
      }
      state.buildings.push({ type, r, c, cells });
    };

    for (const [r, c] of OFFICERS_37_ALL_QUARTERS)
      addBuilding("officersQuarters", r, c);
    for (const [r, c] of OFFICERS_37_ALL_CREW)
      addBuilding("simpleCrewQuarters", r, c);
    return state;
  }

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function (...args) {
    const result = originalGetPresetCatalog.apply(this, args);
    if (selectedEra !== "SASH") return result;

    if (!result.some((p) => p?.id === "builtin:sash-officers-all")) {
      const preset = {
        id: "builtin:sash-officers-all",
        name: "Officers Quarters (37)",
        kind: "Built-in",
        state: makeOfficers37AllState(),
        era: "SASH",
      };
      const startingIndex = result.findIndex(
        (p) => p?.id === "builtin:sash-officers",
      );
      result.splice(
        startingIndex >= 0 ? startingIndex + 1 : result.length,
        0,
        preset,
      );
    }
    return result;
  };
})();
