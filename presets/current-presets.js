/* Current built-in preset overrides.
   New optimizer-tested presets can move here as they are refreshed. */
(() => {
  if (window.__FOE_CURRENT_PRESETS_V2__) return;
  window.__FOE_CURRENT_PRESETS_V2__ = true;

  if (
    typeof makeSamPresetState !== "function" ||
    typeof getPresetCatalog !== "function" ||
    typeof colonyConfigCellState !== "function"
  )
    return;

  const SAM_DROP_POD_60_HUB = [12, 18];
  const SAM_DROP_POD_60_BUILDINGS = [
    [4, 4],
    [4, 6],
    [4, 8],
    [4, 10],
    [4, 12],
    [4, 14],
    [4, 16],
    [4, 18],
    [7, 4],
    [7, 6],
    [7, 8],
    [7, 10],
    [7, 12],
    [7, 14],
    [7, 16],
    [8, 19],
    [8, 21],
    [9, 4],
    [9, 6],
    [9, 8],
    [9, 10],
    [9, 12],
    [9, 14],
    [9, 16],
    [10, 19],
    [10, 21],
    [12, 4],
    [12, 6],
    [12, 8],
    [12, 10],
    [12, 12],
    [12, 14],
    [12, 16],
    [14, 4],
    [14, 6],
    [14, 8],
    [14, 10],
    [14, 12],
    [14, 14],
    [14, 16],
    [17, 4],
    [17, 6],
    [17, 8],
    [17, 10],
    [17, 12],
    [17, 14],
    [17, 16],
    [18, 19],
    [18, 21],
    [19, 8],
    [19, 10],
    [19, 12],
    [19, 14],
    [19, 16],
    [22, 8],
    [22, 10],
    [22, 12],
    [22, 14],
    [22, 16],
    [22, 18],
  ];
  const SAM_DROP_POD_60_PATHS = [
    [6, 5],
    [6, 6],
    [6, 7],
    [6, 8],
    [6, 9],
    [6, 10],
    [6, 11],
    [6, 12],
    [6, 13],
    [6, 14],
    [6, 15],
    [6, 16],
    [6, 17],
    [6, 18],
    [7, 18],
    [8, 18],
    [9, 18],
    [9, 23],
    [10, 18],
    [10, 23],
    [11, 5],
    [11, 6],
    [11, 7],
    [11, 8],
    [11, 9],
    [11, 10],
    [11, 11],
    [11, 12],
    [11, 13],
    [11, 14],
    [11, 15],
    [11, 16],
    [11, 17],
    [11, 18],
    [11, 23],
    [16, 5],
    [16, 6],
    [16, 7],
    [16, 8],
    [16, 9],
    [16, 10],
    [16, 11],
    [16, 12],
    [16, 13],
    [16, 14],
    [16, 15],
    [16, 16],
    [16, 17],
    [18, 18],
    [18, 23],
    [19, 18],
    [20, 18],
    [21, 9],
    [21, 10],
    [21, 11],
    [21, 12],
    [21, 13],
    [21, 14],
    [21, 15],
    [21, 16],
    [21, 17],
    [21, 18],
  ];

  // Optimizer-tested SAM all-expansions Simple Shelter layout from 2026-09-10.
  // 65 Simple Shelters + 2 Drop Pods, 96 paths, 27 unused tiles.
  const SAM_SIMPLE_SHELTER_ALL_HUB = [4, 4];
  const SAM_SIMPLE_SHELTER_ALL_SHELTERS = [
    [0, 4],
    [0, 7],
    [0, 10],
    [0, 13],
    [0, 16],
    [0, 19],
    [0, 22],
    [0, 25],
    [4, 0],
    [4, 10],
    [4, 13],
    [4, 16],
    [4, 19],
    [4, 22],
    [4, 25],
    [7, 0],
    [7, 10],
    [7, 13],
    [7, 16],
    [7, 19],
    [7, 22],
    [7, 25],
    [10, 0],
    [10, 4],
    [11, 7],
    [11, 10],
    [11, 13],
    [11, 16],
    [11, 19],
    [11, 22],
    [11, 25],
    [13, 0],
    [13, 4],
    [14, 7],
    [14, 10],
    [14, 13],
    [14, 16],
    [14, 19],
    [14, 22],
    [14, 25],
    [16, 0],
    [18, 4],
    [18, 7],
    [18, 10],
    [18, 13],
    [18, 16],
    [18, 19],
    [18, 22],
    [18, 25],
    [19, 0],
    [21, 5],
    [21, 8],
    [21, 11],
    [21, 14],
    [21, 17],
    [21, 20],
    [21, 23],
    [25, 4],
    [25, 7],
    [25, 10],
    [25, 13],
    [25, 16],
    [25, 19],
    [25, 22],
    [25, 25],
  ];
  const SAM_SIMPLE_SHELTER_ALL_DROP_PODS = [
    [22, 1],
    [23, 26],
  ];
  const SAM_SIMPLE_SHELTER_ALL_PATHS = [
    [3, 6],
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
    [6, 3],
    [9, 3],
    [10, 3],
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
    [11, 3],
    [12, 3],
    [13, 3],
    [14, 3],
    [15, 3],
    [16, 3],
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
    [18, 3],
    [19, 3],
    [20, 3],
    [21, 3],
    [22, 3],
    [23, 3],
    [23, 4],
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
  ];

  const originalMakeSamPresetState = makeSamPresetState;
  makeSamPresetState = function (kind) {
    const state = originalMakeSamPresetState(kind);
    if (kind !== "dropPods" || !state) return state;

    for (let r = 0; r < 28; r++) {
      for (let c = 0; c < 28; c++) {
        if (
          state.grid[r][c] === "road" ||
          state.grid[r][c] === "hub" ||
          state.grid[r][c] === "dropPod"
        ) {
          state.grid[r][c] = "empty";
        }
      }
    }

    state.buildings = [];
    state.hubTop = [...SAM_DROP_POD_60_HUB];
    state.enabled = [];

    for (let dr = 0; dr < 6; dr++) {
      for (let dc = 0; dc < 6; dc++)
        state.grid[SAM_DROP_POD_60_HUB[0] + dr][SAM_DROP_POD_60_HUB[1] + dc] =
          "hub";
    }
    for (const [r, c] of SAM_DROP_POD_60_PATHS) state.grid[r][c] = "road";
    for (const [r, c] of SAM_DROP_POD_60_BUILDINGS) {
      const cells = [];
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          state.grid[r + dr][c + dc] = "dropPod";
          cells.push([r + dr, c + dc]);
        }
      }
      state.buildings.push({ type: "dropPod", r, c, cells });
    }
    return state;
  };

  function makeSamSimpleShelterAllState() {
    const enabled = COLONY_CONFIGS.SAM.expansions.map((exp) => exp.id);
    const enabledSet = new Set(enabled);
    const grid = Array.from({ length: 28 }, (_, r) =>
      Array.from({ length: 28 }, (_, c) =>
        colonyConfigCellState("SAM", r, c, enabledSet),
      ),
    );
    const state = {
      era: "SAM",
      grid,
      buildings: [],
      hubTop: [...SAM_SIMPLE_SHELTER_ALL_HUB],
      enabled: [...enabled],
      panX: 0,
      panY: 0,
      viewZoom: 1,
    };

    const addBuilding = (type, r, c) => {
      const def = eraBoardBuildingByKey("SAM", type);
      const cells = [];
      for (let dr = 0; dr < def.h; dr++) {
        for (let dc = 0; dc < def.w; dc++) {
          state.grid[r + dr][c + dc] = type;
          cells.push([r + dr, c + dc]);
        }
      }
      state.buildings.push({ type, r, c, cells });
    };

    const hall = ERA_DATA.SAM.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++) {
        state.grid[SAM_SIMPLE_SHELTER_ALL_HUB[0] + dr][
          SAM_SIMPLE_SHELTER_ALL_HUB[1] + dc
        ] = "hub";
      }
    }
    for (const [r, c] of SAM_SIMPLE_SHELTER_ALL_PATHS)
      state.grid[r][c] = "road";
    for (const [r, c] of SAM_SIMPLE_SHELTER_ALL_SHELTERS)
      addBuilding("simpleShelter", r, c);
    for (const [r, c] of SAM_SIMPLE_SHELTER_ALL_DROP_PODS)
      addBuilding("dropPod", r, c);

    return state;
  }

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function (...args) {
    const result = originalGetPresetCatalog.apply(this, args);

    const dropPodPreset = result?.find?.(
      (p) => p?.id === "builtin:sam-drop-pods",
    );
    if (dropPodPreset) dropPodPreset.name = "Drop Pods (60)";

    if (
      selectedEra === "SAM" &&
      !result.some((p) => p?.id === "builtin:sam-simple-shelters-all")
    ) {
      const allExpansionPreset = {
        id: "builtin:sam-simple-shelters-all",
        name: "Simple Shelters (65)",
        kind: "Built-in",
        state: makeSamSimpleShelterAllState(),
        era: "SAM",
      };
      const startingIndex = result.findIndex(
        (p) => p?.id === "builtin:sam-simple-shelters",
      );
      result.splice(
        startingIndex >= 0 ? startingIndex + 1 : result.length,
        0,
        allExpansionPreset,
      );
    }

    return result;
  };
})();
