/* SAV all-expansion residential preset. */
(() => {
  if (window.__FOE_SAV_MAX_PRESETS_V1__) return;
  window.__FOE_SAV_MAX_PRESETS_V1__ = true;

  if (
    typeof getPresetCatalog !== "function" ||
    typeof colonyConfigCellState !== "function"
  )
    return;

  // All 23 expansions: 93 Inflatable Homes + 2 Floating Shelters,
  // 104 paths, 25 unused tiles, 190,971 credits / 4h.
  const HUB = [4, 5];
  const HOMES = [
    [0, 8],
    [0, 10],
    [0, 12],
    [0, 14],
    [0, 16],
    [0, 18],
    [0, 20],
    [0, 22],
    [0, 24],
    [0, 26],
    [4, 10],
    [4, 12],
    [4, 14],
    [4, 16],
    [4, 18],
    [4, 20],
    [4, 22],
    [4, 24],
    [4, 26],
    [7, 10],
    [7, 12],
    [7, 14],
    [7, 16],
    [7, 18],
    [7, 20],
    [7, 22],
    [7, 24],
    [7, 26],
    [9, 6],
    [11, 8],
    [11, 10],
    [11, 12],
    [11, 14],
    [11, 16],
    [11, 18],
    [11, 20],
    [11, 22],
    [11, 24],
    [11, 26],
    [12, 1],
    [12, 6],
    [14, 3],
    [14, 8],
    [14, 10],
    [14, 12],
    [14, 14],
    [14, 16],
    [14, 18],
    [14, 20],
    [14, 22],
    [14, 24],
    [14, 26],
    [15, 0],
    [18, 1],
    [18, 3],
    [18, 6],
    [18, 8],
    [18, 10],
    [18, 12],
    [18, 14],
    [18, 16],
    [18, 18],
    [18, 20],
    [18, 22],
    [18, 24],
    [18, 26],
    [21, 1],
    [21, 3],
    [21, 6],
    [21, 8],
    [21, 10],
    [21, 12],
    [21, 14],
    [21, 16],
    [21, 18],
    [21, 20],
    [21, 22],
    [21, 24],
    [21, 26],
    [25, 0],
    [25, 2],
    [25, 4],
    [25, 6],
    [25, 8],
    [25, 10],
    [25, 12],
    [25, 14],
    [25, 16],
    [25, 18],
    [25, 20],
    [25, 22],
    [25, 24],
    [25, 26],
  ];
  const FLOATING = [
    [12, 3],
    [15, 6],
  ];
  const PATHS = [
    [3, 9],
    [3, 10],
    [3, 11],
    [3, 12],
    [3, 13],
    [3, 14],
    [3, 15],
    [3, 16],
    [3, 17],
    [3, 18],
    [3, 19],
    [3, 20],
    [3, 21],
    [3, 22],
    [3, 23],
    [3, 24],
    [3, 25],
    [3, 26],
    [9, 5],
    [9, 9],
    [10, 5],
    [10, 9],
    [10, 10],
    [10, 11],
    [10, 12],
    [10, 13],
    [10, 14],
    [10, 15],
    [10, 16],
    [10, 17],
    [10, 18],
    [10, 19],
    [10, 20],
    [10, 21],
    [10, 22],
    [10, 23],
    [10, 24],
    [10, 25],
    [10, 26],
    [11, 5],
    [12, 5],
    [13, 5],
    [14, 5],
    [15, 2],
    [15, 5],
    [16, 2],
    [16, 5],
    [17, 2],
    [17, 3],
    [17, 4],
    [17, 5],
    [17, 6],
    [17, 7],
    [17, 8],
    [17, 9],
    [17, 10],
    [17, 11],
    [17, 12],
    [17, 13],
    [17, 14],
    [17, 15],
    [17, 16],
    [17, 17],
    [17, 18],
    [17, 19],
    [17, 20],
    [17, 21],
    [17, 22],
    [17, 23],
    [17, 24],
    [17, 25],
    [17, 26],
    [18, 5],
    [19, 5],
    [20, 5],
    [21, 5],
    [22, 5],
    [23, 5],
    [24, 1],
    [24, 2],
    [24, 3],
    [24, 4],
    [24, 5],
    [24, 6],
    [24, 7],
    [24, 8],
    [24, 9],
    [24, 10],
    [24, 11],
    [24, 12],
    [24, 13],
    [24, 14],
    [24, 15],
    [24, 16],
    [24, 17],
    [24, 18],
    [24, 19],
    [24, 20],
    [24, 21],
    [24, 22],
    [24, 23],
    [24, 24],
    [24, 25],
    [24, 26],
  ];

  function makeState() {
    const enabled = COLONY_CONFIGS.SAV.expansions.map((exp) => exp.id);
    const enabledSet = new Set(enabled);
    const grid = Array.from({ length: 28 }, (_, r) =>
      Array.from({ length: 28 }, (_, c) =>
        colonyConfigCellState("SAV", r, c, enabledSet),
      ),
    );
    const state = {
      era: "SAV",
      grid,
      buildings: [],
      hubTop: [...HUB],
      enabled: [...enabled],
      panX: 0,
      panY: 0,
      viewZoom: 1,
    };

    const hall = ERA_DATA.SAV.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++)
        grid[HUB[0] + dr][HUB[1] + dc] = "hub";
    }
    for (const [r, c] of PATHS) grid[r][c] = "road";

    const addBuilding = (type, r, c) => {
      const def = eraBoardBuildingByKey("SAV", type);
      const cells = [];
      for (let dr = 0; dr < def.h; dr++) {
        for (let dc = 0; dc < def.w; dc++) {
          grid[r + dr][c + dc] = type;
          cells.push([r + dr, c + dc]);
        }
      }
      state.buildings.push({ type, r, c, cells });
    };

    for (const [r, c] of HOMES) addBuilding("inflatableHome", r, c);
    for (const [r, c] of FLOATING) addBuilding("floatingShelter", r, c);
    return state;
  }

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function (...args) {
    const result = originalGetPresetCatalog.apply(this, args);
    if (selectedEra !== "SAV") return result;

    if (!result.some((p) => p?.id === "builtin:sav-inflatable-homes-all")) {
      const preset = {
        id: "builtin:sav-inflatable-homes-all",
        name: "Inflatable Homes (93)",
        kind: "Built-in",
        state: makeState(),
        era: "SAV",
      };
      const startIndex = result.findIndex(
        (p) => p?.id === "builtin:sav-inflatable-homes",
      );
      result.splice(
        startIndex >= 0 ? startIndex + 1 : result.length,
        0,
        preset,
      );
    }
    return result;
  };
})();
