/* SAT built-in presets for the corrected Titan colony footprint. */
(() => {
  if (window.__FOE_SAT_PRESETS_V2__) return;
  window.__FOE_SAT_PRESETS_V2__ = true;

  if (
    typeof getPresetCatalog !== "function" ||
    typeof colonyConfigCellState !== "function" ||
    typeof eraBoardBuildingByKey !== "function" ||
    !COLONY_CONFIGS?.SAT
  )
    return;

  // Corrected starting footprint: 18 plots / 288 tiles.
  const IGLOO_START_HUB = [15, 12];
  const IGLOO_START_BUILDINGS = [
    [0, 8],
    [0, 11],
    [3, 8],
    [3, 11],
    [6, 10],
    [6, 13],
    [8, 4],
    [8, 7],
    [8, 16],
    [9, 10],
    [9, 13],
    [11, 4],
    [11, 7],
    [11, 16],
    [12, 0],
    [12, 10],
    [12, 13],
    [14, 3],
    [14, 6],
    [14, 17],
    [15, 0],
    [15, 9],
    [17, 3],
    [17, 6],
    [17, 17],
  ];

  const SCREENED_START_HUB = [15, 11];
  const SCREENED_START_BUILDINGS = [
    [3, 8],
    [3, 12],
    [7, 8],
    [7, 12],
    [8, 4],
    [8, 16],
    [11, 8],
    [11, 12],
    [12, 0],
    [12, 4],
    [12, 16],
    [16, 3],
    [16, 7],
    [16, 16],
  ];
  const SCREENED_START_IGLOOS = [
    [0, 8],
    [0, 11],
    [16, 0],
  ];

  // Corrected full footprint: 41 plots / 656 tiles.
  // 37 Screened Domiciles + 3 Igloos leaves 12 tiles unused.
  const SCREENED_ALL_HUB = [19, 23];
  const SCREENED_ALL_BUILDINGS = [
    [0, 8],
    [0, 12],
    [0, 16],
    [0, 20],
    [3, 24],
    [4, 8],
    [4, 12],
    [4, 16],
    [4, 20],
    [7, 24],
    [8, 4],
    [8, 8],
    [8, 12],
    [8, 16],
    [8, 20],
    [11, 24],
    [12, 0],
    [12, 4],
    [12, 8],
    [12, 12],
    [12, 16],
    [12, 20],
    [15, 24],
    [16, 3],
    [16, 7],
    [16, 11],
    [16, 15],
    [16, 19],
    [20, 3],
    [20, 7],
    [20, 11],
    [20, 15],
    [20, 19],
    [24, 0],
    [24, 4],
    [24, 8],
    [24, 12],
  ];
  const SCREENED_ALL_IGLOOS = [
    [0, 24],
    [16, 0],
    [19, 0],
  ];

  function makeState({
    hub,
    screened = [],
    igloos = [],
    allExpansions = false,
  }) {
    const enabled = allExpansions
      ? COLONY_CONFIGS.SAT.expansions.map((exp) => exp.id)
      : [];
    const enabledSet = new Set(enabled);
    const grid = Array.from({ length: 28 }, (_, r) =>
      Array.from({ length: 28 }, (_, c) =>
        colonyConfigCellState("SAT", r, c, enabledSet),
      ),
    );
    const state = {
      era: "SAT",
      grid,
      buildings: [],
      hubTop: [...hub],
      enabled: [...enabled],
      panX: 0,
      panY: 0,
      viewZoom: 1,
    };

    const hall = ERA_DATA.SAT.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++) {
        const r = hub[0] + dr;
        const c = hub[1] + dc;
        if (grid[r]?.[c] !== "empty")
          throw new Error("SAT preset Town Hall is outside owned land.");
        grid[r][c] = "hub";
      }
    }

    const addBuilding = (type, r, c) => {
      const def = eraBoardBuildingByKey("SAT", type);
      if (!def) throw new Error(`Unknown SAT building ${type}`);
      const cells = [];
      for (let dr = 0; dr < def.h; dr++) {
        for (let dc = 0; dc < def.w; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (grid[rr]?.[cc] !== "empty") {
            throw new Error(
              `Invalid SAT preset placement for ${type} at ${r},${c}`,
            );
          }
          cells.push([rr, cc]);
        }
      }
      for (const [rr, cc] of cells) grid[rr][cc] = type;
      state.buildings.push({ type, r, c, cells });
    };

    for (const [r, c] of screened) addBuilding("screenedDomicile", r, c);
    for (const [r, c] of igloos) addBuilding("igloo", r, c);
    return state;
  }

  function correctedPresets() {
    return [
      {
        id: "builtin:sat-igloos",
        name: "Igloos (25)",
        kind: "Built-in",
        era: "SAT",
        state: makeState({
          hub: IGLOO_START_HUB,
          igloos: IGLOO_START_BUILDINGS,
        }),
      },
      {
        id: "builtin:sat-screened-domiciles",
        name: "Screened Domiciles (14)",
        kind: "Built-in",
        era: "SAT",
        state: makeState({
          hub: SCREENED_START_HUB,
          screened: SCREENED_START_BUILDINGS,
          igloos: SCREENED_START_IGLOOS,
        }),
      },
      {
        id: "builtin:sat-screened-domiciles-all",
        name: "Screened Domiciles (37)",
        kind: "Built-in",
        era: "SAT",
        state: makeState({
          hub: SCREENED_ALL_HUB,
          screened: SCREENED_ALL_BUILDINGS,
          igloos: SCREENED_ALL_IGLOOS,
          allExpansions: true,
        }),
      },
    ];
  }

  const originalGetPresetCatalog = getPresetCatalog;
  getPresetCatalog = function (...args) {
    const result = originalGetPresetCatalog.apply(this, args);
    if (selectedEra !== "SAT") return result;

    const custom = result.filter(
      (item) => !String(item?.id || "").startsWith("builtin:sat-"),
    );
    const presets = correctedPresets();
    const customIndex = custom.findIndex(
      (item) =>
        item?.kind === "Saved" || String(item?.id || "").startsWith("custom:"),
    );
    if (customIndex < 0) return [...custom, ...presets];
    custom.splice(customIndex, 0, ...presets);
    return custom;
  };
})();
