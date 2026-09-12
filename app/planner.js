"use strict";

const COLONISTS_ICON = "./assets/ui/colonists.webp";
// Building arrays are ordered by colony-building research unlock progression.
// Parallel tech branches use the technology-list/tree order; same-tech unlocks
// use the order shown in that technology's Provides list.

function eraBuildingList(era) {
  const d = ERA_DATA[era];
  if (!d) return [];
  return [...d.residential, ...d.goods, ...d.lifeSupport];
}
function eraBuildingByKey(era, key) {
  return eraBuildingList(era).find((b) => b.key === key) || null;
}

// Width runs across the board. Height runs down it. Buildings do not rotate.
function boardBuildingDef(def) {
  return def || null;
}
function eraBoardBuildingByKey(era, key) {
  return boardBuildingDef(eraBuildingByKey(era, key));
}

const PATHLESS_ERAS = new Set(["SAT", "SASH"]);
for (const era of PATHLESS_ERAS) {
  for (const def of eraBuildingList(era)) {
    def.requiresPath = false;
  }
}
function eraUsesPaths(era = selectedEra) {
  return !PATHLESS_ERAS.has(era);
}

for (const [era, map] of Object.entries(GOODS_PRODUCTS)) {
  for (const [key, product] of Object.entries(map)) {
    const def = eraBuildingByKey(era, key);
    if (def) def.product = product;
  }
}

const BUILDINGS = {
  hub: {
    key: "hub",
    name: "Town Hall",
    category: "townHall",
    w: ERA_DATA.SAAB.townHall.w,
    h: ERA_DATA.SAAB.townHall.h,
    sizeText: ERA_DATA.SAAB.townHall.sizeText,
    sprite: ERA_DATA.SAAB.townHall.sprite,
    requiresPath: false,
  },
  ...Object.fromEntries(
    eraBuildingList("SAAB").map((b) => [b.key, boardBuildingDef(b)]),
  ),
};

let selectedEra = "SAM";

const STORAGE_KEY = "foe-colony-optimizer-workspace-v2";
let workspace = {
  sharedCamera: null,
  eras: { SAAB: { freeBuild: null, currentView: null, customPresets: {} } },
};
let activeLayoutMode = "free";
let activePresetId = null;

let savedDataUnreadable = false;
try {
  let parsed = null;
  const savedV2 = localStorage.getItem(STORAGE_KEY);
  if (savedV2) parsed = JSON.parse(savedV2);

  if (!parsed) {
    const oldRaw = localStorage.getItem("foe-colony-optimizer-workspace-v1");
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const legacy = old?.eras?.SAAB;
      if (legacy?.grid) {
        const migrated = {
          grid: legacy.grid,
          buildings: legacy.buildings || [],
          hubTop: legacy.hubTop || [0, 8],
          enabled: legacy.enabled || [],
          panX: Number.isFinite(legacy.panX) ? legacy.panX : 0,
          panY: Number.isFinite(legacy.panY) ? legacy.panY : 0,
          viewZoom: Number.isFinite(legacy.viewZoom) ? legacy.viewZoom : 1,
        };
        parsed = {
          eras: {
            SAAB: {
              freeBuild: migrated,
              currentView: migrated,
              customPresets: {},
              activeLayoutMode: "free",
              activePresetId: null,
            },
          },
        };
      }
    }
  }

  if (parsed) {
    if (
      !parsed.eras ||
      typeof parsed.eras !== "object" ||
      Array.isArray(parsed.eras) ||
      Object.values(parsed.eras).some(
        (slot) => !slot || typeof slot !== "object" || Array.isArray(slot),
      )
    ) {
      throw new Error("Invalid saved planner data");
    }
    workspace = parsed;
  }
} catch {
  savedDataUnreadable = true;
}

if (!workspace.eras) workspace.eras = {};
if (!workspace.eras.SAAB) {
  workspace.eras.SAAB = {
    freeBuild: null,
    currentView: null,
    customPresets: {},
  };
}
if (!workspace.eras.SAAB.customPresets) workspace.eras.SAAB.customPresets = {};

if (!workspace.eras.SAM) {
  workspace.eras.SAM = {
    freeBuild: null,
    currentView: null,
    customPresets: {},
    activeLayoutMode: "free",
    activePresetId: null,
  };
}
if (!workspace.eras.SAM.customPresets) workspace.eras.SAM.customPresets = {};

activeLayoutMode = workspace.eras.SAM.activeLayoutMode || "free";
activePresetId = workspace.eras.SAM.activePresetId || null;

function cloneState(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function currentColonyState() {
  return {
    era: selectedEra,
    grid: cloneState(grid),
    buildings: cloneState(buildings),
    hubTop: [...hubTop],
    enabled: [...enabledExpansions],
    panX,
    panY,
    viewZoom,
  };
}

function persistColonyState(era = selectedEra) {
  if (!isEditableColonyEra(era)) return;
  if (era !== selectedEra) return;
  if (!Array.isArray(grid) || grid.length !== 28) return;

  saveSharedCamera();

  const slot = workspace.eras[era] || (workspace.eras[era] = {});
  slot.currentView = currentColonyState();
  slot.activeLayoutMode = activeLayoutMode;
  slot.activePresetId = activePresetId;

  if (activeLayoutMode === "free") {
    slot.freeBuild = cloneState(slot.currentView);
  }

  if (!slot.customPresets) slot.customPresets = {};
  saveWorkspace();
}

let colonyPersistTimer = null;
let colonyPersistEra = null;
function scheduleColonyPersist(era = selectedEra, delay = 120) {
  colonyPersistEra = era;
  if (colonyPersistTimer) clearTimeout(colonyPersistTimer);
  colonyPersistTimer = setTimeout(() => {
    colonyPersistTimer = null;
    const target = colonyPersistEra;
    colonyPersistEra = null;
    persistColonyState(target);
  }, delay);
}
window.addEventListener("pagehide", () => {
  if (colonyPersistTimer) {
    clearTimeout(colonyPersistTimer);
    colonyPersistTimer = null;
  }
  persistColonyState(selectedEra);
});

function applyColonyState(state, { preserveCamera = false } = {}) {
  if (!state || !Array.isArray(state.grid) || state.grid.length !== 28)
    return false;

  const oldPanX = panX,
    oldPanY = panY,
    oldZoom = viewZoom;

  grid = cloneState(state.grid);
  buildings = cloneState(state.buildings || []);
  hubTop = Array.isArray(state.hubTop)
    ? [...state.hubTop]
    : [...activeColonyConfig().defaultHub];
  enabledExpansions = new Set(
    Array.isArray(state.enabled) ? state.enabled : [],
  );

  if (preserveCamera) {
    panX = oldPanX;
    panY = oldPanY;
    viewZoom = oldZoom;
  } else if (!applySharedCamera()) {
    // Migration fallback for older saves that predate shared camera.
    panX = Number.isFinite(state.panX) ? state.panX : oldPanX;
    panY = Number.isFinite(state.panY) ? state.panY : oldPanY;
    viewZoom = Number.isFinite(state.viewZoom) ? state.viewZoom : oldZoom;
    saveSharedCamera();
  }

  movingItem = null;
  clearRoadChain();
  renderExpGrid();
  render();
  applyViewTransform();
  return true;
}

function colonyConfigCellState(era, r, c, enabledSet) {
  if (r < 0 || r >= 28 || c < 0 || c >= 28) return "out";
  const cfg = COLONY_CONFIGS[era];
  if (!cfg) return "out";

  const br = Math.floor(r / 4),
    bc = Math.floor(c / 4);
  const isBase = cfg.baseChunks.some((x) => x[0] === br && x[1] === bc);
  if (isBase) return "empty";

  const exp = cfg.expansions.find((e) => e.br === br && e.bc === bc);
  if (exp) return enabledSet.has(exp.id) ? "empty" : "future";

  return "out";
}

function colonyStateMatchesGeometry(state, era) {
  if (!state || !Array.isArray(state.grid) || state.grid.length !== 28)
    return false;
  if (!Array.isArray(state.buildings)) return false;
  if (!COLONY_CONFIGS[era]) return false;
  if (state.era && state.era !== era) return false;

  const enabledSet = new Set(Array.isArray(state.enabled) ? state.enabled : []);
  const validExpansionIds = new Set(
    COLONY_CONFIGS[era].expansions.map((e) => e.id),
  );
  for (const id of enabledSet) {
    if (!validExpansionIds.has(id)) return false;
  }

  const hall = ERA_DATA[era]?.townHall;
  if (
    !hall ||
    !Array.isArray(state.hubTop) ||
    state.hubTop.length !== 2 ||
    !Number.isInteger(state.hubTop[0]) ||
    !Number.isInteger(state.hubTop[1])
  )
    return false;

  const hubSet = new Set();
  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      const r = state.hubTop[0] + dr,
        c = state.hubTop[1] + dc;
      if (r < 0 || r >= 28 || c < 0 || c >= 28) return false;
      hubSet.add(cellKey(r, c));
    }
  }

  const validBuildingKeys = new Set(eraBuildingList(era).map((def) => def.key));
  const expectedBuildingCells = new Map();

  for (const b of state.buildings) {
    if (
      !b ||
      !validBuildingKeys.has(b.type) ||
      !Number.isInteger(b.r) ||
      !Number.isInteger(b.c)
    )
      return false;

    const def = eraBoardBuildingByKey(era, b.type);
    if (!def) return false;

    const expected = [];
    for (let dr = 0; dr < def.h; dr++) {
      for (let dc = 0; dc < def.w; dc++) {
        const r = b.r + dr,
          c = b.c + dc;
        if (r < 0 || r >= 28 || c < 0 || c >= 28) return false;
        expected.push([r, c]);
      }
    }

    if (!Array.isArray(b.cells) || b.cells.length !== expected.length)
      return false;
    if (
      b.cells.some(
        (cell) =>
          !Array.isArray(cell) ||
          cell.length !== 2 ||
          !Number.isInteger(cell[0]) ||
          !Number.isInteger(cell[1]),
      )
    )
      return false;

    const actualSet = new Set(b.cells.map(([r, c]) => cellKey(r, c)));
    if (expected.some(([r, c]) => !actualSet.has(cellKey(r, c)))) return false;

    for (const [r, c] of expected) {
      const k = cellKey(r, c);
      if (expectedBuildingCells.has(k) || hubSet.has(k)) return false;
      expectedBuildingCells.set(k, b.type);
    }
  }

  for (let r = 0; r < 28; r++) {
    if (!Array.isArray(state.grid[r]) || state.grid[r].length !== 28)
      return false;

    for (let c = 0; c < 28; c++) {
      const actual = state.grid[r][c];
      const expectedLand = colonyConfigCellState(era, r, c, enabledSet);
      const key = cellKey(r, c);

      if (hubSet.has(key)) {
        if (expectedLand !== "empty" || actual !== "hub") return false;
        continue;
      }

      if (actual === "hub") return false;

      const expectedBuilding = expectedBuildingCells.get(key);
      if (expectedBuilding) {
        if (expectedLand !== "empty" || actual !== expectedBuilding)
          return false;
        continue;
      }

      if (actual === "road") {
        if (!eraUsesPaths(era) || expectedLand !== "empty") return false;
        continue;
      }

      if (actual !== expectedLand) return false;
    }
  }

  return true;
}
function migrateSavTownHallState(state) {
  if (!state || !Array.isArray(state.grid) || state.grid.length !== 28) {
    return false;
  }

  const oldHub = [0, 12];
  const newHub = [4, 4];

  if (
    !Array.isArray(state.hubTop) ||
    state.hubTop[0] !== oldHub[0] ||
    state.hubTop[1] !== oldHub[1]
  ) {
    return false;
  }

  const enabledSet = new Set(Array.isArray(state.enabled) ? state.enabled : []);
  const hall = ERA_DATA.SAV.townHall;

  // Only migrate automatically when the intended new Hall area is empty.
  // This protects a user who may have deliberately edited the old SAV map.
  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      const r = newHub[0] + dr;
      const c = newHub[1] + dc;
      const current = state.grid[r]?.[c];
      const base = colonyConfigCellState("SAV", r, c, enabledSet);

      if (base !== "empty") return false;
      if (current !== "empty") return false;
    }
  }

  // Clear the old 5x5 Hall back to the SAV land state.
  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      const r = oldHub[0] + dr;
      const c = oldHub[1] + dc;
      if (state.grid[r]?.[c] === "hub") {
        state.grid[r][c] = colonyConfigCellState("SAV", r, c, enabledSet);
      }
    }
  }

  // Place it at the corrected default.
  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      state.grid[newHub[0] + dr][newHub[1] + dc] = "hub";
    }
  }

  state.hubTop = [...newHub];
  return true;
}

function migrateSajmTownHallState(state) {
  if (!state || !Array.isArray(state.grid) || state.grid.length !== 28) {
    return false;
  }

  const oldHub = [12, 4];
  const newHub = [12, 19];

  if (
    !Array.isArray(state.hubTop) ||
    state.hubTop[0] !== oldHub[0] ||
    state.hubTop[1] !== oldHub[1]
  ) {
    return false;
  }

  const enabledSet = new Set(Array.isArray(state.enabled) ? state.enabled : []);
  const hall = ERA_DATA.SAJM.townHall;

  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      const r = newHub[0] + dr;
      const c = newHub[1] + dc;
      const current = state.grid[r]?.[c];
      const base = colonyConfigCellState("SAJM", r, c, enabledSet);

      if (base !== "empty") return false;
      if (current !== "empty") return false;
    }
  }

  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      const r = oldHub[0] + dr;
      const c = oldHub[1] + dc;
      if (state.grid[r]?.[c] === "hub") {
        state.grid[r][c] = colonyConfigCellState("SAJM", r, c, enabledSet);
      }
    }
  }

  for (let dr = 0; dr < hall.h; dr++) {
    for (let dc = 0; dc < hall.w; dc++) {
      state.grid[newHub[0] + dr][newHub[1] + dc] = "hub";
    }
  }

  state.hubTop = [...newHub];
  return true;
}

function migrateSatHeatedResidenceState(state) {
  if (
    !state ||
    !Array.isArray(state.grid) ||
    state.grid.length !== 28 ||
    !Array.isArray(state.buildings)
  )
    return false;

  const enabledSet = new Set(Array.isArray(state.enabled) ? state.enabled : []);
  const cellId = (r, c) => `${r},${c}`;
  let changed = false;

  for (const building of state.buildings) {
    if (
      building?.type !== "heatedResidence" ||
      !Number.isInteger(building.r) ||
      !Number.isInteger(building.c) ||
      !Array.isArray(building.cells) ||
      !building.cells.every(
        (cell) =>
          Array.isArray(cell) &&
          cell.length === 2 &&
          Number.isInteger(cell[0]) &&
          Number.isInteger(cell[1]),
      )
    )
      continue;

    const oldCells = [];
    const newCells = [];
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 4; dc++) {
        oldCells.push([building.r + dr, building.c + dc]);
      }
    for (let dr = 0; dr < 4; dr++)
      for (let dc = 0; dc < 3; dc++) {
        newCells.push([building.r + dr, building.c + dc]);
      }

    const actual = new Set(building.cells.map(([r, c]) => cellId(r, c)));
    const oldSet = new Set(oldCells.map(([r, c]) => cellId(r, c)));
    const newSet = new Set(newCells.map(([r, c]) => cellId(r, c)));

    if (
      actual.size === newSet.size &&
      [...newSet].every((id) => actual.has(id))
    )
      continue;

    if (
      actual.size !== oldSet.size ||
      ![...oldSet].every((id) => actual.has(id))
    )
      continue;

    const oldOnly = oldCells.filter(([r, c]) => !newSet.has(cellId(r, c)));
    const newOnly = newCells.filter(([r, c]) => !oldSet.has(cellId(r, c)));

    const canMigrate =
      oldOnly.every(([r, c]) => state.grid[r]?.[c] === "heatedResidence") &&
      newOnly.every(
        ([r, c]) =>
          r >= 0 &&
          r < 28 &&
          c >= 0 &&
          c < 28 &&
          colonyConfigCellState("SAT", r, c, enabledSet) === "empty" &&
          state.grid[r]?.[c] === "empty",
      );
    if (!canMigrate) continue;

    for (const [r, c] of oldOnly) {
      state.grid[r][c] = colonyConfigCellState("SAT", r, c, enabledSet);
    }
    for (const [r, c] of newOnly) {
      state.grid[r][c] = "heatedResidence";
    }
    building.cells = newCells;
    changed = true;
  }

  return changed;
}

function migrateColonyWorkspaceForEra(era) {
  let changed = false;

  if (era === "SAV") {
    const slot = workspace.eras?.SAV;
    if (!slot) return false;

    if (migrateSavTownHallState(slot.currentView)) {
      changed = true;
    }
    if (migrateSavTownHallState(slot.freeBuild)) {
      changed = true;
    }
  } else if (era === "SAJM") {
    const slot = workspace.eras?.SAJM;
    if (!slot) return false;

    if (migrateSajmTownHallState(slot.currentView)) {
      changed = true;
    }
    if (migrateSajmTownHallState(slot.freeBuild)) {
      changed = true;
    }
  } else if (era === "SAT") {
    const slot = workspace.eras?.SAT;
    if (!slot) return false;

    if (migrateSatHeatedResidenceState(slot.currentView)) changed = true;
    if (migrateSatHeatedResidenceState(slot.freeBuild)) changed = true;
    for (const preset of Object.values(slot.customPresets || {})) {
      if (migrateSatHeatedResidenceState(preset?.state)) changed = true;
    }
  } else {
    return false;
  }

  if (changed) saveWorkspace();
  return changed;
}

function restoreColonyState(era = selectedEra) {
  migrateColonyWorkspaceForEra(era);

  const slot = workspace.eras[era];

  if (
    slot?.activeLayoutMode === "preset" &&
    typeof slot.activePresetId === "string" &&
    slot.activePresetId.startsWith("builtin:") &&
    !colonyStateMatchesGeometry(slot.currentView, era)
  ) {
    const fresh = getPresetById(slot.activePresetId);
    if (fresh?.state) {
      slot.currentView = cloneState(fresh.state);
      saveWorkspace();
    }
  }

  if (!slot?.currentView) return false;

  if (!colonyStateMatchesGeometry(slot.currentView, era)) {
    if (colonyStateMatchesGeometry(slot.freeBuild, era)) {
      slot.currentView = cloneState(slot.freeBuild);
      slot.activeLayoutMode = "free";
      slot.activePresetId = null;
      activeLayoutMode = "free";
      activePresetId = null;
      return applyColonyState(slot.freeBuild);
    }
    slot.currentView = null;
    slot.activeLayoutMode = "free";
    slot.activePresetId = null;
    saveWorkspace();
    return false;
  }

  activeLayoutMode = slot.activeLayoutMode || "free";
  activePresetId = slot.activePresetId || null;
  return applyColonyState(slot.currentView);
}

function saveWorkspace() {
  if (savedDataUnreadable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch {}
}

function saveSharedCamera() {
  workspace.sharedCamera = {
    panX,
    panY,
    viewZoom,
  };
}

function applySharedCamera() {
  const cam = workspace.sharedCamera;
  if (!cam) return false;

  panX = Number.isFinite(cam.panX) ? cam.panX : 0;
  panY = Number.isFinite(cam.panY) ? cam.panY : 0;
  viewZoom = Number.isFinite(cam.viewZoom) ? cam.viewZoom : 1;
  return true;
}

let buildCategory = "residential";
let viewZoom = 1;
let panX = 0;
let panY = 0;
let panPointerId = null;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;
let panMoved = false;
let suppressClickUntil = 0;
let hoveredExpansionId = null;

let enabledExpansions = new Set();
let grid = [],
  buildings = [],
  hubTop = [...CURRENT_HUB],
  history = [];
let mode = null,
  preset = "none";
let movingItem = null;
let roadChainAnchor = null;

const $ = (id) => document.getElementById(id);
const chunkKey = (br, bc) => `${br},${bc}`;
const cellKey = (r, c) => `${r},${c}`;
const expByChunk = new Map(EXPANSIONS.map((e) => [chunkKey(e.br, e.bc), e]));

const COLONY_CONFIGS = {
  SAAB: {
    baseChunks: BASE_CHUNKS,
    expansions: EXPANSIONS,
    defaultHub: [0, 8],
    townHall: ERA_DATA.SAAB.townHall,
  },
  SAM: {
    baseChunks: SAM_BASE_CHUNKS,
    expansions: SAM_EXPANSIONS,
    defaultHub: [4, 4],
    townHall: ERA_DATA.SAM.townHall,
  },
  SAV: {
    baseChunks: SAV_BASE_CHUNKS,
    expansions: SAV_EXPANSIONS,
    defaultHub: [4, 4],
    townHall: ERA_DATA.SAV.townHall,
  },
  SAJM: {
    baseChunks: SAJM_BASE_CHUNKS,
    expansions: SAJM_EXPANSIONS,
    defaultHub: [12, 19],
    townHall: ERA_DATA.SAJM.townHall,
  },
  SAT: {
    baseChunks: SAT_BASE_CHUNKS,
    expansions: SAT_EXPANSIONS,
    defaultHub: [4, 15],
    townHall: ERA_DATA.SAT.townHall,
  },
  SASH: {
    baseChunks: SASH_BASE_CHUNKS,
    expansions: SASH_EXPANSIONS,
    defaultHub: [8, 4],
    townHall: ERA_DATA.SASH.townHall,
  },
};

function isEditableColonyEra(era = selectedEra) {
  return !!COLONY_CONFIGS[era];
}
function activeColonyConfig() {
  return COLONY_CONFIGS[selectedEra] || COLONY_CONFIGS.SAAB;
}
function activeBaseChunks() {
  return activeColonyConfig().baseChunks;
}
function activeExpansions() {
  return activeColonyConfig().expansions;
}
function activeExpansionMap() {
  return new Map(activeExpansions().map((e) => [chunkKey(e.br, e.bc), e]));
}
function activeTownHallDef() {
  return ERA_DATA[selectedEra]?.townHall || ERA_DATA.SAAB.townHall;
}
function activeBuildingDef(type) {
  if (type === "hub") {
    const h = activeTownHallDef();
    return {
      key: "hub",
      name: h.name,
      category: "townHall",
      w: h.w,
      h: h.h,
      sizeText: h.sizeText,
      sprite: h.sprite,
      requiresPath: false,
    };
  }
  return (
    eraBoardBuildingByKey(selectedEra, type) ||
    (selectedEra === "SAAB" ? BUILDINGS[type] : null)
  );
}

function baseOwnedCell(r, c) {
  if (r < 0 || r >= 28 || c < 0 || c >= 28) return false;
  const br = Math.floor(r / 4),
    bc = Math.floor(c / 4);
  return activeBaseChunks().some((x) => x[0] === br && x[1] === bc);
}
function expansionForCell(r, c) {
  const br = Math.floor(r / 4),
    bc = Math.floor(c / 4);
  return activeExpansionMap().get(chunkKey(br, bc)) || null;
}
function ownedCell(r, c) {
  if (baseOwnedCell(r, c)) return true;
  const e = expansionForCell(r, c);
  return !!(e && enabledExpansions.has(e.id));
}
function cellStateBase(r, c) {
  if (baseOwnedCell(r, c)) return "empty";
  const e = expansionForCell(r, c);
  if (e) return enabledExpansions.has(e.id) ? "empty" : "future";
  return "out";
}
function baseGrid() {
  return Array.from({ length: 28 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) => cellStateBase(r, c)),
  );
}
function cellsFor(type, r, c) {
  const d = activeBuildingDef(type),
    a = [];
  if (!d) return a;
  for (let dr = 0; dr < d.h; dr++)
    for (let dc = 0; dc < d.w; dc++) a.push([r + dr, c + dc]);
  return a;
}
function hubCells(r, c) {
  return cellsFor("hub", r, c);
}
function snapshot() {
  history.push(
    JSON.stringify({
      grid,
      buildings,
      hubTop,
      enabled: [...enabledExpansions],
      activeLayoutMode,
      activePresetId,
      freeBuild: workspace.eras[selectedEra]?.freeBuild,
      preset,
    }),
  );
  if (history.length > 100) history.shift();
}
function restore(raw) {
  const o = JSON.parse(raw);
  if (o.freeBuild !== undefined)
    workspace.eras[selectedEra].freeBuild = o.freeBuild;
  activeLayoutMode = o.activeLayoutMode || "free";
  activePresetId = o.activePresetId || null;
  preset = o.preset || "none";
  updateLayoutModeButtons();
  grid = o.grid;
  buildings = o.buildings;
  hubTop = o.hubTop;
  enabledExpansions = new Set(o.enabled);
  movingItem = null;
  clearRoadChain();
  renderExpGrid();
  render();
  persistColonyState(selectedEra);
}
function refreshLandPreservingLayout() {
  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) {
      if (
        grid[r][c] === "empty" ||
        grid[r][c] === "future" ||
        grid[r][c] === "out"
      )
        grid[r][c] = cellStateBase(r, c);
    }
}
function applyHub() {
  for (const [r, c] of hubCells(...hubTop)) grid[r][c] = "hub";
}
function addKnownBuilding(type, r, c) {
  const cells = cellsFor(type, r, c);
  buildings.push({ type, r, c, cells });
  for (const [rr, cc] of cells) grid[rr][cc] = type;
}
function makeSaabPresetState(kind) {
  const previousEnabled = enabledExpansions;
  enabledExpansions = new Set();
  const g = baseGrid();
  enabledExpansions = previousEnabled;

  const state = {
    grid: g,
    buildings: [],
    hubTop: [0, 8],
    enabled: [],
    panX,
    panY,
    viewZoom,
  };

  const addBuilding = (type, r, c) => {
    const cells = cellsFor(type, r, c);
    state.buildings.push({ type, r, c, cells });
    for (const [rr, cc] of cells) state.grid[rr][cc] = type;
  };

  const addHub = (position) => {
    state.hubTop = [...position];
    for (const [rr, cc] of hubCells(...position)) state.grid[rr][cc] = "hub";
  };

  if (kind === "early") {
    addHub(CURRENT_HUB);
    for (const [r, c] of CURRENT_ROADS) state.grid[r][c] = "road";
    for (const [r, c] of CURRENT_MOVABLES) addBuilding("movable", r, c);
    return state;
  }

  if (kind === "late") {
    addHub(LATE_HUB);
    for (const [r, c] of LATE_ROADS) state.grid[r][c] = "road";
    for (const [r, c] of LATE_DEEP) addBuilding("deep", r, c);
    for (const [r, c] of LATE_MOVABLE) addBuilding("movable", r, c);
    return state;
  }

  addHub([0, 8]);
  return state;
}

function makeSamPresetState(kind) {
  const previousEnabled = enabledExpansions;
  enabledExpansions = new Set();

  try {
    const g = baseGrid();
    const state = {
      grid: g,
      buildings: [],
      hubTop: [...activeColonyConfig().defaultHub],
      enabled: [],
      panX,
      panY,
      viewZoom,
    };

    const addBuilding = (type, r, c) => {
      const def = eraBoardBuildingByKey("SAM", type);
      if (!def) return;
      const cells = [];
      for (let dr = 0; dr < def.h; dr++) {
        for (let dc = 0; dc < def.w; dc++) {
          cells.push([r + dr, c + dc]);
        }
      }
      state.buildings.push({ type, r, c, cells });
      for (const [rr, cc] of cells) state.grid[rr][cc] = type;
    };

    const addHub = (position) => {
      state.hubTop = [...position];
      const hall = ERA_DATA.SAM.townHall;
      for (let dr = 0; dr < hall.h; dr++) {
        for (let dc = 0; dc < hall.w; dc++) {
          state.grid[position[0] + dr][position[1] + dc] = "hub";
        }
      }
    };

    if (kind === "dropPods") {
      addHub(SAM_DROP_POD_PRESET_HUB);
      for (const [r, c] of SAM_DROP_POD_PRESET_PATHS) state.grid[r][c] = "road";
      for (const [r, c] of SAM_DROP_POD_PRESET_BUILDINGS)
        addBuilding("dropPod", r, c);
      return state;
    }

    if (kind === "simpleShelters") {
      addHub(SAM_SIMPLE_SHELTER_PRESET_HUB);
      for (const [r, c] of SAM_SIMPLE_SHELTER_PRESET_PATHS)
        state.grid[r][c] = "road";
      for (const [r, c] of SAM_SIMPLE_SHELTER_PRESET_BUILDINGS)
        addBuilding("simpleShelter", r, c);
      for (const [r, c] of SAM_SIMPLE_SHELTER_PRESET_DROP_PODS)
        addBuilding("dropPod", r, c);
      return state;
    }

    addHub(activeColonyConfig().defaultHub);
    return state;
  } finally {
    enabledExpansions = previousEnabled;
  }
}

function makeSavPresetState(kind) {
  const enabledSet = new Set();
  const g = Array.from({ length: 28 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) =>
      colonyConfigCellState("SAV", r, c, enabledSet),
    ),
  );

  const state = {
    grid: g,
    buildings: [],
    hubTop: [...COLONY_CONFIGS.SAV.defaultHub],
    enabled: [],
    panX,
    panY,
    viewZoom,
  };

  const addHub = (position) => {
    state.hubTop = [...position];
    const hall = ERA_DATA.SAV.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++) {
        state.grid[position[0] + dr][position[1] + dc] = "hub";
      }
    }
  };

  const addBuilding = (type, r, c) => {
    const def = eraBoardBuildingByKey("SAV", type);
    if (!def) return;
    const cells = [];
    for (let dr = 0; dr < def.h; dr++) {
      for (let dc = 0; dc < def.w; dc++) {
        cells.push([r + dr, c + dc]);
      }
    }
    state.buildings.push({ type, r, c, cells });
    for (const [rr, cc] of cells) {
      state.grid[rr][cc] = type;
    }
  };

  if (kind === "floatingShelters") {
    addHub(SAV_FLOATING_SHELTER_PRESET_HUB);
    for (const [r, c] of SAV_FLOATING_SHELTER_PRESET_PATHS) {
      state.grid[r][c] = "road";
    }
    for (const [r, c] of SAV_FLOATING_SHELTER_PRESET_BUILDINGS) {
      addBuilding("floatingShelter", r, c);
    }
    return state;
  }

  if (kind === "inflatableHomes") {
    addHub(SAV_INFLATABLE_HOME_PRESET_HUB);
    for (const [r, c] of SAV_INFLATABLE_HOME_PRESET_PATHS) {
      state.grid[r][c] = "road";
    }
    for (const [r, c] of SAV_INFLATABLE_HOME_PRESET_BUILDINGS) {
      addBuilding("inflatableHome", r, c);
    }
    for (const [r, c] of SAV_INFLATABLE_HOME_PRESET_FLOATING_SHELTERS) {
      addBuilding("floatingShelter", r, c);
    }
    return state;
  }

  addHub(COLONY_CONFIGS.SAV.defaultHub);
  return state;
}

function makeSajmPresetState(kind) {
  const enabledSet =
    kind === "aquaCabinsAll"
      ? new Set(SAJM_EXPANSIONS.map((exp) => exp.id))
      : new Set();
  const g = Array.from({ length: 28 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) =>
      colonyConfigCellState("SAJM", r, c, enabledSet),
    ),
  );

  const state = {
    grid: g,
    buildings: [],
    hubTop: [...COLONY_CONFIGS.SAJM.defaultHub],
    enabled: [...enabledSet],
    panX,
    panY,
    viewZoom,
  };

  const addHub = (position) => {
    state.hubTop = [...position];
    const hall = ERA_DATA.SAJM.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++) {
        state.grid[position[0] + dr][position[1] + dc] = "hub";
      }
    }
  };

  const addBuilding = (type, r, c) => {
    const def = eraBoardBuildingByKey("SAJM", type);
    if (!def) return;
    const cells = [];
    for (let dr = 0; dr < def.h; dr++) {
      for (let dc = 0; dc < def.w; dc++) {
        cells.push([r + dr, c + dc]);
      }
    }
    state.buildings.push({ type, r, c, cells });
    for (const [rr, cc] of cells) {
      state.grid[rr][cc] = type;
    }
  };

  if (kind === "aquaCabinsAll") {
    addHub(SAJM_AQUA_CABIN_ALL_PRESET_HUB);
    for (const [r, c] of SAJM_AQUA_CABIN_ALL_PRESET_PATHS) {
      state.grid[r][c] = "road";
    }
    for (const [r, c] of SAJM_AQUA_CABIN_ALL_PRESET_BUILDINGS) {
      addBuilding("aquaCabin", r, c);
    }
    for (const [r, c] of SAJM_AQUA_CABIN_ALL_PRESET_PODS) {
      addBuilding("aquaPod", r, c);
    }
    return state;
  }

  if (kind === "aquaCabins") {
    addHub(SAJM_AQUA_CABIN_PRESET_HUB);
    for (const [r, c] of SAJM_AQUA_CABIN_PRESET_PATHS) {
      state.grid[r][c] = "road";
    }
    for (const [r, c] of SAJM_AQUA_CABIN_PRESET_BUILDINGS) {
      addBuilding("aquaCabin", r, c);
    }
    for (const [r, c] of SAJM_AQUA_CABIN_PRESET_PODS) {
      addBuilding("aquaPod", r, c);
    }
    return state;
  }

  if (kind === "aquaPods") {
    addHub(SAJM_AQUA_POD_PRESET_HUB);
    for (const [r, c] of SAJM_AQUA_POD_PRESET_PATHS) {
      state.grid[r][c] = "road";
    }
    for (const [r, c] of SAJM_AQUA_POD_PRESET_BUILDINGS) {
      addBuilding("aquaPod", r, c);
    }
    return state;
  }

  addHub(COLONY_CONFIGS.SAJM.defaultHub);
  return state;
}

function makeSatPresetState(kind) {
  const enabledSet = new Set();
  const g = Array.from({ length: 28 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) =>
      colonyConfigCellState("SAT", r, c, enabledSet),
    ),
  );

  const state = {
    grid: g,
    buildings: [],
    hubTop: [...COLONY_CONFIGS.SAT.defaultHub],
    enabled: [],
    panX,
    panY,
    viewZoom,
  };

  const addHub = (position) => {
    state.hubTop = [...position];
    const hall = ERA_DATA.SAT.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++) {
        state.grid[position[0] + dr][position[1] + dc] = "hub";
      }
    }
  };

  const addBuilding = (type, r, c) => {
    const def = eraBoardBuildingByKey("SAT", type);
    if (!def) return;
    const cells = [];
    for (let dr = 0; dr < def.h; dr++) {
      for (let dc = 0; dc < def.w; dc++) {
        cells.push([r + dr, c + dc]);
      }
    }
    state.buildings.push({ type, r, c, cells });
    for (const [rr, cc] of cells) {
      state.grid[rr][cc] = type;
    }
  };

  if (kind === "igloos") {
    addHub(SAT_IGLOO_PRESET_HUB);
    for (const [r, c] of SAT_IGLOO_PRESET_BUILDINGS) {
      addBuilding("igloo", r, c);
    }
    return state;
  }

  if (kind === "screenedDomiciles") {
    addHub(SAT_DOMICILE_PRESET_HUB);
    for (const [r, c] of SAT_DOMICILE_PRESET_BUILDINGS) {
      addBuilding("screenedDomicile", r, c);
    }
    for (const [r, c] of SAT_DOMICILE_PRESET_IGLOOS) {
      addBuilding("igloo", r, c);
    }
    return state;
  }

  addHub(COLONY_CONFIGS.SAT.defaultHub);
  return state;
}

function makeSashPresetState(kind) {
  const enabledSet = new Set();
  const g = Array.from({ length: 28 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) =>
      colonyConfigCellState("SASH", r, c, enabledSet),
    ),
  );

  const state = {
    grid: g,
    buildings: [],
    hubTop: [...COLONY_CONFIGS.SASH.defaultHub],
    enabled: [],
    panX,
    panY,
    viewZoom,
  };

  const addHub = (position) => {
    state.hubTop = [...position];
    const hall = ERA_DATA.SASH.townHall;
    for (let dr = 0; dr < hall.h; dr++) {
      for (let dc = 0; dc < hall.w; dc++) {
        state.grid[position[0] + dr][position[1] + dc] = "hub";
      }
    }
  };

  const addBuilding = (type, r, c) => {
    const def = eraBoardBuildingByKey("SASH", type);
    if (!def) return;
    const cells = [];
    for (let dr = 0; dr < def.h; dr++) {
      for (let dc = 0; dc < def.w; dc++) {
        cells.push([r + dr, c + dc]);
      }
    }
    state.buildings.push({ type, r, c, cells });
    for (const [rr, cc] of cells) {
      state.grid[rr][cc] = type;
    }
  };

  if (kind === "simpleCrew") {
    addHub(SASH_SIMPLE_PRESET_HUB);
    for (const [r, c] of SASH_SIMPLE_PRESET_BUILDINGS) {
      addBuilding("simpleCrewQuarters", r, c);
    }
    return state;
  }

  if (kind === "officers") {
    addHub(SASH_OFFICER_PRESET_HUB);
    for (const [r, c] of SASH_OFFICER_PRESET_BUILDINGS) {
      addBuilding("officersQuarters", r, c);
    }
    for (const [r, c] of SASH_OFFICER_PRESET_FILLERS) {
      addBuilding("simpleCrewQuarters", r, c);
    }
    return state;
  }

  addHub(COLONY_CONFIGS.SASH.defaultHub);
  return state;
}

function getPresetCatalog() {
  const result = [];

  if (selectedEra === "SAAB") {
    result.push(
      {
        id: "builtin:early",
        name: "Movable Abodes (58)",
        kind: "Built-in",
        state: makeSaabPresetState("early"),
      },
      {
        id: "builtin:late",
        name: "Deep-Seated Housing (40)",
        kind: "Built-in",
        state: makeSaabPresetState("late"),
      },
    );
  } else if (selectedEra === "SAM") {
    result.push(
      {
        id: "builtin:sam-drop-pods",
        name: "Drop Pods (57)",
        kind: "Built-in",
        state: makeSamPresetState("dropPods"),
      },
      {
        id: "builtin:sam-simple-shelters",
        name: "Simple Shelters (25)",
        kind: "Built-in",
        state: makeSamPresetState("simpleShelters"),
      },
    );
  } else if (selectedEra === "SAV") {
    result.push(
      {
        id: "builtin:sav-floating-shelters",
        name: "Floating Shelters (58)",
        kind: "Built-in",
        state: makeSavPresetState("floatingShelters"),
      },
      {
        id: "builtin:sav-inflatable-homes",
        name: "Inflatable Homes (37)",
        kind: "Built-in",
        state: makeSavPresetState("inflatableHomes"),
      },
    );
  } else if (selectedEra === "SAJM") {
    result.push(
      {
        id: "builtin:sajm-aqua-pods",
        name: "Aqua Pods (60)",
        kind: "Built-in",
        state: makeSajmPresetState("aquaPods"),
      },
      {
        id: "builtin:sajm-aqua-cabins",
        name: "Aqua Cabins (40)",
        kind: "Built-in",
        state: makeSajmPresetState("aquaCabins"),
      },
      {
        id: "builtin:sajm-aqua-cabins-all",
        name: "Aqua Cabins (89)",
        kind: "Built-in",
        state: makeSajmPresetState("aquaCabinsAll"),
      },
    );
  } else if (selectedEra === "SAT") {
    result.push(
      {
        id: "builtin:sat-igloos",
        name: "Igloos (34)",
        kind: "Built-in",
        state: makeSatPresetState("igloos"),
      },
      {
        id: "builtin:sat-screened-domiciles",
        name: "Screened Domiciles (20)",
        kind: "Built-in",
        state: makeSatPresetState("screenedDomiciles"),
      },
    );
  } else if (selectedEra === "SASH") {
    result.push(
      {
        id: "builtin:sash-simple-crew",
        name: "Simple Crew Quarters (54)",
        kind: "Built-in",
        state: makeSashPresetState("simpleCrew"),
      },
      {
        id: "builtin:sash-officers",
        name: "Officers Quarters (21)",
        kind: "Built-in",
        state: makeSashPresetState("officers"),
      },
    );
  }

  const custom = workspace.eras[selectedEra]?.customPresets || {};
  for (const [id, p] of Object.entries(custom)) {
    if (!p?.state) continue;
    result.push({
      id: "custom:" + id,
      customId: id,
      name: p.name || "Custom preset",
      kind: "Saved",
      state: cloneState(p.state),
    });
  }

  for (const item of result) item.era = selectedEra;
  return result;
}

function getPresetById(id) {
  return getPresetCatalog().find((item) => item.id === id) || null;
}

function loadBlank() {
  enabledExpansions.clear();
  grid = baseGrid();
  buildings = [];
  hubTop = [...activeColonyConfig().defaultHub];
  applyHub();
  history = [];
  renderExpGrid();
  render();
  applySharedCamera();
  applyViewTransform();
  status("", true);
}
function buildingAt(r, c) {
  return buildings.find((b) =>
    b.cells.some(([rr, cc]) => rr === r && cc === c),
  );
}
function eraseAt(r, c) {
  if (!ownedCell(r, c)) return false;

  const b = buildingAt(r, c);
  if (b) {
    snapshot();
    removeBuilding(b);
    render();
    status("", true);
    return true;
  }

  if (grid[r][c] === "road") {
    snapshot();
    grid[r][c] = "empty";
    render();
    status("", true);
    return true;
  }

  return false;
}
function removeBuilding(b) {
  if (!b) return;
  for (const [r, c] of b.cells) grid[r][c] = cellStateBase(r, c);
  buildings = buildings.filter((x) => x !== b);
}
function placeBuilding(type, r, c) {
  const def = activeBuildingDef(type);
  if (!def) return;
  const cells = cellsFor(type, r, c);
  if (!cells.every(([rr, cc]) => ownedCell(rr, cc) && grid[rr][cc] === "empty"))
    return status("Cannot place building there.", false);
  snapshot();
  addKnownBuilding(type, r, c);
  render();
}

function movingCells() {
  if (!movingItem) return [];
  if (movingItem.kind === "hub") return hubCells(movingItem.r, movingItem.c);
  if (movingItem.kind === "road") return [[movingItem.r, movingItem.c]];
  if (movingItem.kind === "building") {
    const d = activeBuildingDef(movingItem.type);
    const cells = [];
    for (let dr = 0; dr < d.h; dr++)
      for (let dc = 0; dc < d.w; dc++)
        cells.push([movingItem.r + dr, movingItem.c + dc]);
    return cells;
  }
  return [];
}

function isMovingOriginalCell(r, c) {
  return movingCells().some(([rr, cc]) => rr === r && cc === c);
}

function selectMoveItem(r, c) {
  const state = grid[r][c];

  if (state === "hub") {
    const d = activeTownHallDef();
    movingItem = {
      kind: "hub",
      r: hubTop[0],
      c: hubTop[1],
      w: d.w,
      h: d.h,
    };
    render();
    return true;
  }

  const b = buildingAt(r, c);
  if (b) {
    const d = activeBuildingDef(b.type);
    if (!d) return false;
    movingItem = {
      kind: "building",
      type: b.type,
      r: b.r,
      c: b.c,
      w: d.w,
      h: d.h,
    };
    render();
    return true;
  }

  if (state === "road") {
    movingItem = { kind: "road", r, c, w: 1, h: 1 };
    render();
    return true;
  }

  return false;
}

function moveDestinationFits(r, c) {
  if (!movingItem) return false;

  const cells = [];
  for (let dr = 0; dr < movingItem.h; dr++)
    for (let dc = 0; dc < movingItem.w; dc++) cells.push([r + dr, c + dc]);

  return cells.every(([rr, cc]) => {
    if (!ownedCell(rr, cc)) return false;
    if (isMovingOriginalCell(rr, cc)) return true;
    return grid[rr][cc] === "empty";
  });
}

function commitMove(r, c) {
  if (!movingItem) return false;

  if (r === movingItem.r && c === movingItem.c) {
    movingItem = null;
    render();
    return true;
  }

  if (!moveDestinationFits(r, c)) {
    status("Cannot move there.", false);
    return false;
  }

  snapshot();

  if (movingItem.kind === "hub") {
    for (const [rr, cc] of hubCells(movingItem.r, movingItem.c)) {
      if (grid[rr][cc] === "hub") grid[rr][cc] = cellStateBase(rr, cc);
    }
    hubTop = [r, c];
    applyHub();
  } else if (movingItem.kind === "building") {
    const old = buildingAt(movingItem.r, movingItem.c);
    removeBuilding(old);
    addKnownBuilding(movingItem.type, r, c);
  } else if (movingItem.kind === "road") {
    grid[movingItem.r][movingItem.c] = cellStateBase(
      movingItem.r,
      movingItem.c,
    );
    grid[r][c] = "road";
  }

  movingItem = null;
  render();
  status("", true);
  return true;
}

function clearRoadChain() {
  roadChainAnchor = null;
}

function roadSegmentTo(r, c) {
  if (!roadChainAnchor) return null;

  const ar = roadChainAnchor.r;
  const ac = roadChainAnchor.c;
  let er = r;
  let ec = c;

  // FoE-style road dragging snaps to one straight axis from the last click.
  if (r !== ar && c !== ac) {
    const dr = Math.abs(r - ar);
    const dc = Math.abs(c - ac);
    if (dc >= dr) er = ar;
    else ec = ac;
  }

  const cells = [];
  if (er === ar) {
    if (ec !== ac) {
      const step = ec > ac ? 1 : -1;
      for (let cc = ac + step; cc !== ec + step; cc += step)
        cells.push([ar, cc]);
    }
  } else if (ec === ac) {
    const step = er > ar ? 1 : -1;
    for (let rr = ar + step; rr !== er + step; rr += step) cells.push([rr, ac]);
  }

  if (!cells.length) {
    return { endR: er, endC: ec, cells, topR: ar, leftC: ac, w: 1, h: 1 };
  }

  const rows = cells.map(([rr]) => rr);
  const cols = cells.map(([, cc]) => cc);
  const topR = Math.min(...rows);
  const leftC = Math.min(...cols);

  return {
    endR: er,
    endC: ec,
    cells,
    topR,
    leftC,
    w: Math.max(...cols) - leftC + 1,
    h: Math.max(...rows) - topR + 1,
  };
}

function roadSegmentFits(segment) {
  return (
    !!segment &&
    segment.cells.every(
      ([rr, cc]) =>
        ownedCell(rr, cc) &&
        (grid[rr][cc] === "empty" || grid[rr][cc] === "road"),
    )
  );
}

function placeRoadClick(r, c) {
  if (!ownedCell(r, c)) {
    status("Cannot place path there.", false);
    return false;
  }

  // First click places one tile and starts the straight-line hologram.
  if (!roadChainAnchor) {
    if (grid[r][c] === "road") {
      roadChainAnchor = { r, c };
      render();
      status("", true);
      return true;
    }
    if (grid[r][c] !== "empty") {
      status("Cannot place path there.", false);
      return false;
    }

    snapshot();
    grid[r][c] = "road";
    roadChainAnchor = { r, c };
    render();
    status("", true);
    return true;
  }

  const segment = roadSegmentTo(r, c);
  if (!segment || !segment.cells.length) return true;

  if (!roadSegmentFits(segment)) {
    status("Cannot place path there.", false);
    return false;
  }

  const newCells = segment.cells.filter(([rr, cc]) => grid[rr][cc] !== "road");
  if (newCells.length) {
    snapshot();
    for (const [rr, cc] of newCells) grid[rr][cc] = "road";
  }

  // Keep chaining from the last clicked endpoint, like the in-game road tool.
  roadChainAnchor = { r: segment.endR, c: segment.endC };
  render();
  status("", true);
  return true;
}

function edit(r, c) {
  if (!mode) return;
  if (!ownedCell(r, c)) return;

  if (mode === "erase") {
    eraseAt(r, c);
    return;
  }

  if (mode === "move") {
    if (movingItem) commitMove(r, c);
    else selectMoveItem(r, c);
    return;
  }

  if (mode.startsWith("build:")) {
    const key = mode.slice(6);
    if (activeBuildingDef(key)) placeBuilding(key, r, c);
    return;
  }

  if (mode === "road") {
    placeRoadClick(r, c);
  }
}
function neigh(r, c) {
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ].filter(([rr, cc]) => rr >= 0 && rr < 28 && cc >= 0 && cc < 28);
}
function cellEl(r, c) {
  return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}
function validate() {
  document.querySelectorAll(".bad").forEach((x) => x.classList.remove("bad"));

  const roots = [];
  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) {
      if (
        grid[r][c] === "road" &&
        neigh(r, c).some(([rr, cc]) => grid[rr][cc] === "hub")
      ) {
        roots.push([r, c]);
      }
    }

  const seen = new Set(),
    q = [...roots];
  while (q.length) {
    const [r, c] = q.shift(),
      k = cellKey(r, c);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const [rr, cc] of neigh(r, c)) {
      if (grid[rr][cc] === "road" && !seen.has(cellKey(rr, cc)))
        q.push([rr, cc]);
    }
  }

  const badRoads = [];
  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) {
      if (grid[r][c] === "road" && !seen.has(cellKey(r, c)))
        badRoads.push([r, c]);
    }

  const pathBuildings = buildings.filter(
    (b) => activeBuildingDef(b.type)?.requiresPath,
  );

  const badBuildings = [];
  for (const b of pathBuildings) {
    const connected = b.cells.some(([r, c]) =>
      neigh(r, c).some(
        ([rr, cc]) => grid[rr][cc] === "road" && seen.has(cellKey(rr, cc)),
      ),
    );
    if (!connected) badBuildings.push(b);
  }

  for (const b of badBuildings) {
    for (const [r, c] of b.cells) cellEl(r, c)?.classList.add("bad");
  }
  for (const [r, c] of badRoads) cellEl(r, c)?.classList.add("bad");

  if (!badBuildings.length && !badRoads.length) {
    const count = pathBuildings.length;
    const message =
      count === 0
        ? "No buildings need connection."
        : `${count} building${count === 1 ? "" : "s"} connected to Town Hall.`;
    notifyToast(message, "", "success", 3200);
    return;
  }

  const parts = [];
  if (badBuildings.length) {
    const n = badBuildings.length;
    parts.push(`${n} building${n === 1 ? " needs" : "s need"} connection`);
  }
  if (badRoads.length) {
    const n = badRoads.length;
    parts.push(`${n} path${n === 1 ? "" : "s"} disconnected`);
  }

  notifyToast(parts.join(" · "), "", "warning", 4200);
}
function countGrid(type) {
  let n = 0;
  for (const row of grid) for (const x of row) if (x === type) n++;
  return n;
}

function placeGridOverlay(el, r, c, w, h) {
  el.style.gridColumn = `${c + 1} / span ${w}`;
  el.style.gridRow = `${r + 1} / span ${h}`;
}

function previewSpec(r = null, c = null) {
  if (
    mode === "road" &&
    roadChainAnchor &&
    Number.isInteger(r) &&
    Number.isInteger(c)
  ) {
    const segment = roadSegmentTo(r, c);
    if (!segment || !segment.cells.length) return null;
    return {
      w: segment.w,
      h: segment.h,
      kind: "road",
      r: segment.topR,
      c: segment.leftC,
      segment,
    };
  }

  if (mode === "move" && movingItem) {
    const kind =
      movingItem.kind === "hub"
        ? "hub"
        : movingItem.kind === "road"
          ? "road"
          : activeBuildingDef(movingItem.type)?.category || "residential";
    return { w: movingItem.w, h: movingItem.h, kind };
  }

  if (mode?.startsWith("build:")) {
    const key = mode.slice(6);
    const d = activeBuildingDef(key);
    if (!d) return null;
    return { w: d.w, h: d.h, kind: d.category };
  }

  if (mode === "road") return { w: 1, h: 1, kind: "road" };
  return null;
}

function previewFits(r, c, spec) {
  if (!spec) return false;

  if (spec.segment) return roadSegmentFits(spec.segment);
  if (mode === "move" && movingItem) return moveDestinationFits(r, c);

  const cells = [];
  for (let dr = 0; dr < spec.h; dr++)
    for (let dc = 0; dc < spec.w; dc++) cells.push([r + dr, c + dc]);

  if (spec.kind === "road") {
    return cells.every(
      ([rr, cc]) => ownedCell(rr, cc) && grid[rr][cc] === "empty",
    );
  }

  return cells.every(
    ([rr, cc]) => ownedCell(rr, cc) && grid[rr][cc] === "empty",
  );
}

function showPlacementPreview(r, c) {
  const preview = $("placementPreview");
  if (!preview) return;
  if (
    !isEditableColonyEra(selectedEra) ||
    mode === "erase" ||
    (mode === "move" && !movingItem)
  ) {
    preview.style.display = "none";
    return;
  }

  const spec = previewSpec(r, c);
  if (!spec) {
    preview.style.display = "none";
    return;
  }

  preview.className = "placement-preview";
  if (spec.kind === "road") preview.classList.add("road-preview");
  if (spec.kind === "hub") preview.classList.add("hub-preview");
  if (spec.kind === "goods") preview.classList.add("goods-preview");
  if (spec.kind === "lifeSupport")
    preview.classList.add("life-support-preview");
  if (!previewFits(r, c, spec)) preview.classList.add("invalid-preview");

  const previewR = Number.isInteger(spec.r) ? spec.r : r;
  const previewC = Number.isInteger(spec.c) ? spec.c : c;
  placeGridOverlay(preview, previewR, previewC, spec.w, spec.h);
  preview.style.display = "block";
}

function hidePlacementPreview() {
  const preview = $("placementPreview");
  if (preview) preview.style.display = "none";
}

function canBuyExpansion() {
  return mode === null;
}

function updateBuyHover(id) {
  hoveredExpansionId = id || null;
  const allow = canBuyExpansion();
  document.querySelectorAll(".exp-buy-overlay").forEach((el) => {
    el.classList.toggle(
      "show-buy",
      allow && el.dataset.buyExpansion === hoveredExpansionId,
    );
  });
}

let hoverTooltipWidth = 180;
let hoverTooltipHeight = 30;
function showHoverTooltip(text, e) {
  const tip = $("hoverTooltip");
  if (!tip || !text) return;
  tip.textContent = text;
  tip.hidden = false;
  hoverTooltipWidth = tip.offsetWidth || 180;
  hoverTooltipHeight = tip.offsetHeight || 30;
  moveHoverTooltip(e);
}
function moveHoverTooltip(e) {
  const tip = $("hoverTooltip");
  if (!tip || tip.hidden || !e) return;
  const margin = 14;
  let x = e.clientX + margin;
  let y = e.clientY + margin;
  const w = hoverTooltipWidth;
  const h = hoverTooltipHeight;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - margin;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - margin;
  tip.style.left = `${Math.max(6, x)}px`;
  tip.style.top = `${Math.max(6, y)}px`;
}
function hideHoverTooltip() {
  const tip = $("hoverTooltip");
  if (tip) tip.hidden = true;
}
function placedThingTooltip(r, c) {
  const state = grid[r][c];
  if (state === "hub") {
    const d = activeTownHallDef();
    return `${d.name}, ${d.sizeText}`;
  }
  if (state === "road") {
    const d = ERA_DATA[selectedEra].path;
    return `${d.name}, ${d.sizeText}`;
  }
  if (state !== "empty" && state !== "future" && state !== "out") {
    const d = activeBuildingDef(state);
    if (d) return `${d.name}, ${d.sizeText}`;
  }
  return null;
}
function buildMenuTooltip(def) {
  const tiles = Math.max(1, Number(def.w) * Number(def.h));
  if (def.category === "residential") {
    const creditsPerHour =
      Number(def.creditAmount || 0) / Number(def.creditHours || 1);
    const perTile = creditsPerHour / tiles;
    return `${def.name} · ${perTile.toLocaleString(undefined, { maximumFractionDigits: 2 })} credits per tile per hour`;
  }
  if (def.category === "lifeSupport") {
    const perTile = Number(def.lifeSupport || 0) / tiles;
    return `${def.name} · ${perTile.toLocaleString(undefined, { maximumFractionDigits: 2 })} life support per tile`;
  }
  if (def.category === "goods") {
    return `${def.name} · Produces ${def.product || "goods"}`;
  }
  return `${def.name}, ${def.sizeText}`;
}

function boardCellFromTarget(target) {
  const cell = target?.closest?.(".cell");
  return cell && cell.parentElement === $("board") ? cell : null;
}
function boardCellCoords(cell) {
  if (!cell) return null;
  const r = Number(cell.dataset.r),
    c = Number(cell.dataset.c);
  return Number.isInteger(r) && Number.isInteger(c) ? { r, c } : null;
}
function ensureBoardDelegatedEvents() {
  const board = $("board");
  if (!board || board.dataset.delegatedEvents === "1") return;
  board.dataset.delegatedEvents = "1";

  board.addEventListener("pointerover", (e) => {
    const cell = boardCellFromTarget(e.target);
    if (!cell) return;
    if (boardCellFromTarget(e.relatedTarget) === cell) return;

    const pos = boardCellCoords(cell);
    if (!pos) return;

    const expId = cell.dataset.expansion;
    if (expId) {
      if (canBuyExpansion()) updateBuyHover(expId);
      return;
    }

    if (grid[pos.r][pos.c] === "out") return;
    const label = placedThingTooltip(pos.r, pos.c);
    if (label) showHoverTooltip(label, e);
    if (!panMoved) showPlacementPreview(pos.r, pos.c);
  });

  board.addEventListener("pointermove", (e) => {
    if (!$("hoverTooltip")?.hidden) moveHoverTooltip(e);
  });

  board.addEventListener("pointerout", (e) => {
    const cell = boardCellFromTarget(e.target);
    if (!cell) return;
    if (boardCellFromTarget(e.relatedTarget) === cell) return;

    const expId = cell.dataset.expansion;
    if (expId) {
      if (hoveredExpansionId === expId) updateBuyHover(null);
      return;
    }

    hideHoverTooltip();
    if (!panMoved) hidePlacementPreview();
  });

  board.addEventListener("click", (e) => {
    const cell = boardCellFromTarget(e.target);
    if (!cell || performance.now() < suppressClickUntil) return;

    const pos = boardCellCoords(cell);
    if (!pos) return;

    const expId = cell.dataset.expansion;
    if (expId) {
      if (!canBuyExpansion()) return;
      toggleExpansion(expId);
      updateBuyHover(null);
      return;
    }

    if (grid[pos.r][pos.c] !== "out") edit(pos.r, pos.c);
  });

  board.addEventListener("contextmenu", (e) => {
    const cell = boardCellFromTarget(e.target);
    if (!cell || cell.dataset.expansion) return;

    const pos = boardCellCoords(cell);
    if (!pos || grid[pos.r][pos.c] === "out") return;
    e.preventDefault();

    if (grid[pos.r][pos.c] === "hub") return;

    const b = buildingAt(pos.r, pos.c);
    if (b) {
      snapshot();

      if (
        mode === "move" &&
        movingItem?.kind === "building" &&
        movingItem.r === b.r &&
        movingItem.c === b.c
      ) {
        movingItem = null;
        hidePlacementPreview();
      }

      removeBuilding(b);
      render();
      return;
    }

    if (grid[pos.r][pos.c] === "road") {
      snapshot();

      if (
        mode === "move" &&
        movingItem?.kind === "road" &&
        movingItem.r === pos.r &&
        movingItem.c === pos.c
      ) {
        movingItem = null;
        hidePlacementPreview();
      }

      grid[pos.r][pos.c] = cellStateBase(pos.r, pos.c);
      if (roadChainAnchor?.r === pos.r && roadChainAnchor?.c === pos.c)
        clearRoadChain();
      render();
    }
  });
}

function render() {
  const board = $("board");
  ensureBoardDelegatedEvents();
  board.replaceChildren();
  board.classList.toggle("erase-mode", mode === "erase");
  const fragment = document.createDocumentFragment();

  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) {
      const st = grid[r][c],
        d = document.createElement("div");
      d.className = "cell " + st;
      d.dataset.r = r;
      d.dataset.c = c;
      d.style.gridColumn = String(c + 1);
      d.style.gridRow = String(r + 1);

      if (
        movingItem?.kind === "road" &&
        movingItem.r === r &&
        movingItem.c === c
      )
        d.classList.add("move-selected");

      const exp = expansionForCell(r, c);
      if (st === "future" && exp) {
        d.dataset.expansion = exp.id;
        const rr = r % 4,
          cc = c % 4;
        if (rr === 0) d.classList.add("chunk-edge-top");
        if (rr === 3) d.classList.add("chunk-edge-bottom");
        if (cc === 0) d.classList.add("chunk-edge-left");
        if (cc === 3) d.classList.add("chunk-edge-right");
      }
      fragment.appendChild(d);
    }

  // Every building is one continuous top-view block.
  for (const b of buildings) {
    const dims = activeBuildingDef(b.type);
    if (!dims) continue;

    const overlay = document.createElement("div");
    const categoryClass =
      dims.category === "goods"
        ? "goods-overlay"
        : dims.category === "lifeSupport"
          ? "life-support-overlay"
          : "residential-overlay";

    overlay.className = `building-overlay ${categoryClass}`;
    if (
      movingItem?.kind === "building" &&
      movingItem.r === b.r &&
      movingItem.c === b.c
    )
      overlay.classList.add("move-selected");

    overlay.dataset.buildingType = b.type;
    overlay.dataset.r = b.r;
    overlay.dataset.c = b.c;
    placeGridOverlay(overlay, b.r, b.c, dims.w, dims.h);
    fragment.appendChild(overlay);
  }

  // Town Hall remains one continuous block.
  {
    const hubOverlay = document.createElement("div");
    hubOverlay.className = "building-overlay hub-overlay";
    if (movingItem?.kind === "hub") hubOverlay.classList.add("move-selected");
    hubOverlay.dataset.r = hubTop[0];
    hubOverlay.dataset.c = hubTop[1];
    placeGridOverlay(
      hubOverlay,
      hubTop[0],
      hubTop[1],
      activeTownHallDef().w,
      activeTownHallDef().h,
    );
    fragment.appendChild(hubOverlay);
  }

  for (const exp of activeExpansions()) {
    if (enabledExpansions.has(exp.id)) continue;
    const overlay = document.createElement("div");
    overlay.className = "exp-buy-overlay";
    overlay.dataset.buyExpansion = exp.id;
    overlay.textContent = "BUY";
    placeGridOverlay(overlay, exp.br * 4, exp.bc * 4, 4, 4);
    fragment.appendChild(overlay);
  }

  const preview = document.createElement("div");
  preview.id = "placementPreview";
  preview.className = "placement-preview";
  fragment.appendChild(preview);

  board.appendChild(fragment);
  board.style.transform = `translate3d(${panX}px,${panY}px,0) scale(${viewZoom})`;
  updateStats();
  if (isEditableColonyEra(selectedEra)) scheduleColonyPersist(selectedEra);
}

function renderExpGrid() {
  const box = $("expGrid");
  if (!box) return;
  box.innerHTML = "";

  const base = activeBaseChunks();
  const expMap = activeExpansionMap();
  const max = activeExpansions().length;

  for (let br = 0; br < 7; br++)
    for (let bc = 0; bc < 7; bc++) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "exp-slot";

      const isBase = base.some((x) => x[0] === br && x[1] === bc);
      const e = expMap.get(chunkKey(br, bc));

      if (!isBase && !e) {
        d.classList.add("corner");
        d.disabled = true;
        box.appendChild(d);
        continue;
      }

      if (isBase) {
        d.classList.add("current");
        d.textContent = "";
        d.disabled = true;
        box.appendChild(d);
        continue;
      }

      d.textContent = "";
      if (enabledExpansions.has(e.id)) d.classList.add("on");
      d.addEventListener("click", () => toggleExpansion(e.id));
      box.appendChild(d);
    }

  const range = $("expRange");
  if (range) {
    range.max = max;
    range.value = enabledExpansions.size;
  }
  const label = $("expRangeLabel");
  if (label) label.textContent = `${enabledExpansions.size} / ${max}`;
}

function toggleExpansion(id) {
  snapshot();
  if (enabledExpansions.has(id)) enabledExpansions.delete(id);
  else enabledExpansions.add(id);
  refreshLandPreservingLayout();
  renderExpGrid();
  render();
}
function setExpansionCount(n) {
  snapshot();
  enabledExpansions.clear();
  for (const e of activeExpansions().slice(0, n)) enabledExpansions.add(e.id);
  refreshLandPreservingLayout();
  renderExpGrid();
  render();
}
function makeSummaryRow({
  name,
  count,
  colonists = null,
  creditAmount = null,
  creditHours = null,
  sprite = null,
  path = false,
}) {
  const row = document.createElement("div");
  row.className = "compact-building-row" + (path ? " path-summary-row" : "");

  const buildingCell = document.createElement("div");
  buildingCell.className = "compact-building-cell";
  if (sprite) {
    const image = document.createElement("img");
    image.src = sprite;
    image.alt = name;
    buildingCell.appendChild(image);
  } else if (path) {
    const fallback = document.createElement("span");
    fallback.className = "path-fallback-icon";
    buildingCell.appendChild(fallback);
  }

  const label = document.createElement("span");
  label.className = "compact-building-name";
  label.textContent = name;
  buildingCell.appendChild(label);

  const number = document.createElement("div");
  number.className = "compact-number";
  number.textContent = Number(count).toLocaleString();

  const pop = document.createElement("div");
  pop.className = "compact-colonists";
  if (colonists == null) {
    pop.textContent = "—";
  } else {
    const n = Number(colonists);
    pop.textContent =
      n < 0 ? `−${Math.abs(n).toLocaleString()}` : n.toLocaleString();
  }

  const credits = document.createElement("div");
  credits.className = "compact-credits";
  if (creditAmount != null && creditHours) {
    const wrap = document.createElement("span");
    const amount = document.createElement("span");
    amount.textContent = Number(creditAmount).toLocaleString();
    const period = document.createElement("span");
    period.className = "compact-credit-period";
    period.textContent = `/${creditHours}h`;
    wrap.append(amount, period);

    const icon = document.createElement("img");
    icon.src = "./assets/ui/credits.png";
    icon.alt = "credits";
    credits.append(icon, wrap);
  } else {
    credits.textContent = "—";
  }

  row.append(buildingCell, number, pop, credits);
  return row;
}

function connectedSaabRoadIds() {
  const roots = [];
  const seen = new Set();
  const queue = [];

  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) {
      if (grid[r][c] !== "road") continue;
      const id = optId(r, c);

      if (neigh(r, c).some(([rr, cc]) => grid[rr][cc] === "hub")) {
        seen.add(id);
        queue.push(id);
      }
    }

  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    const [r, c] = optRC(id);

    for (const [rr, cc] of neigh(r, c)) {
      if (grid[rr][cc] !== "road") continue;
      const nid = optId(rr, cc);
      if (seen.has(nid)) continue;
      seen.add(nid);
      queue.push(nid);
    }
  }

  return seen;
}

function placedBuildingHasConnectedRoad(placed, connectedRoadIds) {
  return placed.cells.some(([r, c]) =>
    neigh(r, c).some(([rr, cc]) => connectedRoadIds.has(optId(rr, cc))),
  );
}

function updateStats() {
  const rows = $("compactBuildingRows");
  if (!rows) return;
  rows.innerHTML = "";

  const era = ERA_DATA[selectedEra];
  const footer =
    $("creditsPer8h")?.closest?.(".compact-summary-footer") ||
    $("creditsPer8h")?.parentElement;

  if (!era) {
    if (footer) footer.style.display = "none";
    return;
  }

  if (!isEditableColonyEra(selectedEra)) {
    rows.appendChild(
      makeSummaryRow({
        name: era.townHall.name,
        count: 1,
        colonists: null,
        creditAmount: null,
        sprite: era.townHall.sprite,
      }),
    );
    if (footer) footer.style.display = "none";
    renderBuildMenu();
    return;
  }

  const counts = new Map();
  for (const placed of buildings) {
    counts.set(placed.type, (counts.get(placed.type) || 0) + 1);
  }

  rows.appendChild(
    makeSummaryRow({
      name: era.townHall.name,
      count: 1,
      colonists: null,
      creditAmount: null,
      sprite: era.townHall.sprite,
    }),
  );

  const producers = [];
  const connectedRoadIds = connectedSaabRoadIds();
  let totalColonists = 0;

  for (const def of eraBuildingList(selectedEra)) {
    const count = counts.get(def.key) || 0;
    if (!count) continue;

    rows.appendChild(
      makeSummaryRow({
        name: def.name,
        count,
        colonists: def.colonists,
        creditAmount: def.creditAmount,
        creditHours: def.creditHours,
        sprite: def.sprite,
      }),
    );

    if (def.colonists != null) {
      totalColonists += count * Number(def.colonists);
    }

    if (def.category === "residential" && def.creditAmount && def.creditHours) {
      const connectedCount = eraUsesPaths(selectedEra)
        ? buildings.filter(
            (placed) =>
              placed.type === def.key &&
              placedBuildingHasConnectedRoad(placed, connectedRoadIds),
          ).length
        : count;

      if (connectedCount > 0) producers.push({ count: connectedCount, def });
    }
  }

  const roadCount = countGrid("road");
  if (roadCount > 0) {
    rows.appendChild(
      makeSummaryRow({
        name: era.path.name,
        count: roadCount,
        colonists: null,
        creditAmount: null,
        sprite: era.path.sprite,
        path: true,
      }),
    );
  }

  if (footer) footer.style.display = "grid";

  // Normalize every residential producer to a 4-hour rate.
  // Example: an 8h building contributes half of its listed production.
  const totalHours = 4;
  let totalCredits = 0;
  for (const { count, def } of producers) {
    totalCredits +=
      count * Number(def.creditAmount) * (totalHours / Number(def.creditHours));
  }

  const unused = countGrid("empty");
  $("creditsTotalLabel").textContent = "Credit output (4h):";
  $("creditsPer8h").textContent = Math.round(totalCredits).toLocaleString();
  $("colonistsTotal").textContent = totalColonists.toLocaleString();
  $("emptyTilesTotal").textContent = unused.toLocaleString();

  const maxExp = activeExpansions().length;
  if ($("compactExpCount"))
    $("compactExpCount").textContent = `${enabledExpansions.size}/${maxExp}`;

  const owned = activeBaseChunks().length * 16 + enabledExpansions.size * 16;

  const legacy = {
    statMov: counts.get("movable") || 0,
    statDeep: counts.get("deep") || 0,
    roadCount,
    unusedCount: unused,
    ownedTiles: owned,
    expCount: `${enabledExpansions.size} / ${maxExp}`,
    expRangeLabel: `${enabledExpansions.size} / ${maxExp}`,
  };
  for (const [id, val] of Object.entries(legacy)) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  renderBuildMenu();
}

function buildItemButton({
  def,
  modeName = null,
  disabled = false,
  path = false,
  slotIndex = null,
}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "build-item";
  btn.disabled = disabled;
  if (modeName && mode === modeName) btn.classList.add("active");
  if (slotIndex) {
    btn.setAttribute("aria-keyshortcuts", String(slotIndex));
  }

  if (def.sprite) {
    const img = document.createElement("img");
    img.src = def.sprite;
    img.alt = def.name;
    btn.appendChild(img);
  } else {
    const fallback = document.createElement("span");
    fallback.className = path ? "path-fallback-icon" : "";
    btn.appendChild(fallback);
  }

  const copy = document.createElement("span");
  copy.className = "build-item-copy";

  const label = document.createElement("span");
  label.className = "build-item-name";
  label.textContent = def.name;

  const detail = document.createElement("span");
  detail.className = "build-item-detail";

  if (def.category === "residential") {
    detail.textContent = `${Number(def.creditAmount || 0).toLocaleString()} credits / ${def.creditHours}h`;
  } else if (def.category === "goods") {
    detail.textContent = `${Math.abs(Number(def.colonists || 0)).toLocaleString()} colonists needed`;
  } else if (def.category === "lifeSupport") {
    detail.textContent = `+${Number(def.lifeSupport || 0).toLocaleString()} life support`;
  } else {
    detail.textContent = "";
  }

  copy.append(label, detail);

  const footprint = document.createElement("span");
  footprint.className = "build-item-size";
  footprint.textContent = def.sizeText;

  btn.append(copy, footprint);

  btn.addEventListener("mouseenter", (e) => {
    showHoverTooltip(buildMenuTooltip(def), e);
  });
  btn.addEventListener("mousemove", (e) => moveHoverTooltip(e));
  btn.addEventListener("mouseleave", hideHoverTooltip);

  if (!disabled && modeName) {
    btn.addEventListener("click", () => {
      if (mode === modeName) setMode(null);
      else setMode(modeName);
      renderBuildMenu();
    });
  }

  return btn;
}

function renderBuildMenu() {
  const menu = $("buildMenuItems");
  if (!menu) return;
  menu.innerHTML = "";

  const era = ERA_DATA[selectedEra];
  if (!era) return;

  const pathless = !eraUsesPaths(selectedEra);
  const pathTab = document.querySelector(
    '.build-tab[data-build-category="paths"]',
  );
  const buildTabs = document.querySelector(".build-tabs");

  if (pathTab) pathTab.style.display = pathless ? "none" : "";
  if (buildTabs)
    buildTabs.style.gridTemplateColumns = pathless
      ? "repeat(3,1fr)"
      : "repeat(4,1fr)";

  if (pathless && buildCategory === "paths") buildCategory = "residential";

  document.querySelectorAll(".build-tab").forEach((btn) => {
    const selected = btn.dataset.buildCategory === buildCategory;
    btn.classList.toggle("active", selected);
    btn.setAttribute("aria-selected", String(selected));
    btn.tabIndex = selected ? 0 : -1;
    if (btn === pathTab) btn.setAttribute("aria-hidden", String(pathless));
    else btn.removeAttribute("aria-hidden");
    if (selected && btn.id) menu.setAttribute("aria-labelledby", btn.id);
  });

  const editable = isEditableColonyEra(selectedEra);

  if (buildCategory === "paths") {
    if (!eraUsesPaths(selectedEra)) {
      const note = document.createElement("div");
      note.className = "no-paths-note";
      note.textContent = "No paths required";
      menu.appendChild(note);
      return;
    }

    menu.appendChild(
      buildItemButton({
        def: era.path,
        modeName: editable ? "road" : null,
        disabled: !editable,
        path: true,
        slotIndex: 1,
      }),
    );
    return;
  }

  const list = era[buildCategory] || [];
  list.forEach((def, index) => {
    menu.appendChild(
      buildItemButton({
        def,
        modeName: editable ? `build:${def.key}` : null,
        disabled: !editable,
        slotIndex: index + 1,
      }),
    );
  });
}

function triggerBuildSlot(slot) {
  if (!isEditableColonyEra(selectedEra)) return false;
  const era = ERA_DATA[selectedEra];
  if (!era) return false;

  let nextMode = null;

  if (buildCategory === "paths") {
    if (!eraUsesPaths(selectedEra) || slot !== 1) return false;
    nextMode = "road";
  } else {
    const list = era[buildCategory] || [];
    const def = list[slot - 1];
    if (!def) return false;
    nextMode = `build:${def.key}`;
  }

  setMode(mode === nextMode ? null : nextMode);
  return true;
}

/* SAAB layout */

function optId(r, c) {
  return r * 28 + c;
}
function optRC(id) {
  return [Math.floor(id / 28), id % 28];
}

function optNeighborIds(id) {
  const [r, c] = optRC(id);
  const out = [];
  if (r > 0) out.push(optId(r - 1, c));
  if (r < 27) out.push(optId(r + 1, c));
  if (c > 0) out.push(optId(r, c - 1));
  if (c < 27) out.push(optId(r, c + 1));
  return out;
}

document.querySelectorAll(".build-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    buildCategory = btn.dataset.buildCategory;
    renderBuildMenu();
  });

  btn.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll(".build-tab")].filter(
      (tab) =>
        tab.style.display !== "none" &&
        tab.getAttribute("aria-hidden") !== "true",
    );
    const here = tabs.indexOf(btn);
    if (here < 0) return;

    e.preventDefault();
    e.stopPropagation();

    let nextIndex = here;
    if (e.key === "ArrowLeft")
      nextIndex = (here - 1 + tabs.length) % tabs.length;
    else if (e.key === "ArrowRight") nextIndex = (here + 1) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;

    const next = tabs[nextIndex];
    buildCategory = next.dataset.buildCategory;
    renderBuildMenu();
    next.focus();
  });
});

let dialogResolver = null;

function showConfirmDialog({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
}) {
  return new Promise((resolve) => {
    const dlg = $("appDialog");
    const input = $("appDialogInput");
    $("appDialogTitle").textContent = title;
    $("appDialogMessage").textContent = message;
    $("appDialogConfirm").textContent = confirmText;
    $("appDialogCancel").textContent = cancelText;
    input.hidden = true;
    input.value = "";
    dialogResolver = resolve;
    dlg.showModal();
  });
}

function showInputDialog({
  title,
  message,
  confirmText = "Save",
  placeholder = "",
}) {
  return new Promise((resolve) => {
    const dlg = $("appDialog");
    const input = $("appDialogInput");
    $("appDialogTitle").textContent = title;
    $("appDialogMessage").textContent = message;
    $("appDialogConfirm").textContent = confirmText;
    $("appDialogCancel").textContent = "Cancel";
    input.hidden = false;
    input.placeholder = placeholder;
    input.value = "";
    dialogResolver = resolve;
    dlg.showModal();
    setTimeout(() => input.focus(), 0);
  });
}

$("appDialog")?.addEventListener("close", () => {
  if (!dialogResolver) return;
  const dlg = $("appDialog");
  const input = $("appDialogInput");
  const accepted = dlg.returnValue === "default";
  const value = input.hidden ? accepted : accepted ? input.value.trim() : null;
  const resolve = dialogResolver;
  dialogResolver = null;
  resolve(value);
});

function updateLayoutModeButtons() {
  $("freeBuildBtn")?.classList.toggle("active", activeLayoutMode === "free");
  $("presetsBtn")?.classList.toggle("active", activeLayoutMode === "preset");
}

function activateFreeBuild() {
  if (!isEditableColonyEra(selectedEra)) return;

  if (activeLayoutMode === "free") {
    updateLayoutModeButtons();
    return;
  }

  const era = selectedEra;
  const saved = cloneState(workspace.eras[era]?.freeBuild);
  history = [];

  movingItem = null;
  setMode(null, false);

  activeLayoutMode = "free";
  activePresetId = null;
  preset = "none";

  if (saved) applyColonyState(saved, { preserveCamera: true });
  else loadBlank();

  updateLayoutModeButtons();
  persistColonyState(era);
}

async function loadPresetItem(item) {
  if (!item || !isEditableColonyEra(selectedEra)) return;
  const era = selectedEra;
  if (item.era && item.era !== era) return;
  if (!colonyStateMatchesGeometry(item.state, era)) return;
  if (activeLayoutMode === "free") persistColonyState(era);
  history = [];
  movingItem = null;
  clearRoadChain();
  setMode(null, false);
  activeLayoutMode = "preset";
  activePresetId = item.id;
  preset = item.id;
  applyColonyState(item.state, { preserveCamera: true });
  updateLayoutModeButtons();
  closePresetPopover();
  persistColonyState(era);
}

function clearPlacedObjects() {
  snapshot();
  grid = baseGrid();
  buildings = [];
  hubTop = [...activeColonyConfig().defaultHub];
  applyHub();
  movingItem = null;
  clearRoadChain();
  render();
  status("", true);
}

async function requestClearAll() {
  const era = selectedEra;
  const placed = buildings.length + countGrid("road");
  if (placed === 0) return;

  const ok = await showConfirmDialog({
    title: "Clear all?",
    message:
      "Remove all buildings and paths? Your expansions stay unlocked, and the Town Hall returns to its starting spot.",
    confirmText: "Clear all",
  });
  if (!ok || selectedEra !== era) return;
  clearPlacedObjects();
}

function drawPresetPreview(state, name) {
  const canvas = $("presetPreviewCanvas");
  if (!canvas || !state?.grid) return;

  const ctx = canvas.getContext("2d");
  const cellW = canvas.width / 28;
  const cellH = canvas.height / 28;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#15120f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cellColor = (cell) => {
    if (cell === "empty") return "#d3ccb7";
    if (cell === "road") return "#777674";
    if (cell === "hub") return "#d78624";
    if (cell === "future") return "#18351a";
    if (cell === "out") return "#15120f";

    const def = activeBuildingDef(cell);
    if (def?.category === "residential") return "#66acf3";
    if (def?.category === "goods") return "#a56ac7";
    if (def?.category === "lifeSupport") return "#76b58a";
    return "#15120f";
  };

  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) {
      ctx.fillStyle = cellColor(state.grid[r][c]);
      ctx.fillRect(c * cellW, r * cellH, cellW + 0.2, cellH + 0.2);
    }

  $("presetPreviewTitle").textContent = name || "Preset";
}

function renderPresetPopover() {
  const list = $("presetList");
  if (!list) return;
  list.innerHTML = "";

  const items = getPresetCatalog();
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-item";
    if (activeLayoutMode === "preset" && activePresetId === item.id)
      btn.classList.add("active");

    const name = document.createElement("span");
    name.textContent = item.name;
    const kind = document.createElement("small");
    kind.textContent = item.kind;
    btn.append(name, kind);

    btn.addEventListener("mouseenter", () =>
      drawPresetPreview(item.state, item.name),
    );
    btn.addEventListener("focus", () =>
      drawPresetPreview(item.state, item.name),
    );
    btn.addEventListener("click", () => loadPresetItem(item));
    list.appendChild(btn);
  }

  if (items.length) drawPresetPreview(items[0].state, items[0].name);
}

function openPresetPopover() {
  renderPresetPopover();
  $("presetPopover").hidden = false;
}

function closePresetPopover() {
  const pop = $("presetPopover");
  if (pop) pop.hidden = true;
}

function togglePresetPopover() {
  const pop = $("presetPopover");
  if (!pop) return;
  if (pop.hidden) openPresetPopover();
  else closePresetPopover();
}

async function saveCurrentPreset() {
  if (!isEditableColonyEra(selectedEra)) return;

  const era = selectedEra;
  const name = await showInputDialog({
    title: "Save preset",
    message: "Save the current layout as a reusable preset.",
    confirmText: "Save",
    placeholder: "Preset name",
  });
  if (!name || selectedEra !== era) return;

  const slot = workspace.eras[era] || (workspace.eras[era] = {});
  if (!slot.customPresets) slot.customPresets = {};

  const id = "p" + Date.now().toString(36);
  slot.customPresets[id] = {
    name,
    state: currentColonyState(),
  };

  saveWorkspace();
  renderPresetPopover();
}

let toastSerial = 0;

function notifyToast(title, message = "", type = "success", duration = 2800) {
  const host = $("toastStack");
  if (!host || !title) return;

  const toast = document.createElement("div");
  toast.className = `app-toast ${type}`;
  toast.dataset.toastId = String(++toastSerial);

  const icon = type === "success" ? "✓" : type === "error" ? "×" : "!";

  const iconEl = document.createElement("div");
  iconEl.className = "toast-icon";
  iconEl.textContent = icon;

  const copy = document.createElement("div");
  const titleEl = document.createElement("div");
  titleEl.className = "toast-title";
  titleEl.textContent = String(title);
  copy.appendChild(titleEl);

  if (message) {
    const messageEl = document.createElement("div");
    messageEl.className = "toast-message";
    messageEl.textContent = String(message);
    copy.appendChild(messageEl);
  }

  toast.append(iconEl, copy);

  host.querySelectorAll(".app-toast").forEach((old) => old.remove());
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  const remove = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 160);
  };
  setTimeout(remove, duration);
}

function status(msg, good) {
  const legacy = $("status");
  if (legacy) {
    legacy.textContent = msg;
    legacy.className = "note " + (good ? "ok" : "warn");
  }
  const compact = $("compactStatus");
  if (compact) compact.textContent = "";
  if (!msg) return;
  notifyToast(msg, "", good ? "success" : "warning", good ? 2400 : 3600);
}
function setMode(next, renderNow = true) {
  const previous = mode;
  mode = next || null;

  if (previous === "move" && mode !== "move") movingItem = null;
  if (mode !== "road" || previous !== "road") clearRoadChain();

  const topMap = {
    move: "compactMoveBtn",
    erase: "compactEraseBtn",
  };
  for (const [modeName, id] of Object.entries(topMap)) {
    const el = $(id);
    el?.classList.toggle("active", mode === modeName);
    el?.setAttribute("aria-pressed", String(mode === modeName));
  }

  const board = $("board");
  if (board) board.classList.toggle("erase-mode", mode === "erase");

  updateBuyHover(null);
  hidePlacementPreview();
  renderBuildMenu();

  if (renderNow && isEditableColonyEra(selectedEra)) render();
}

const bindClick = (id, fn) => {
  const el = $(id);
  if (el) el.addEventListener("click", fn);
};

bindClick("freeBuildBtn", () => activateFreeBuild());
bindClick("presetsBtn", () => togglePresetPopover());
bindClick("clearAllBtn", () => requestClearAll());
bindClick("savePresetBtn", () => saveCurrentPreset());

document.addEventListener("pointerdown", (e) => {
  const pop = $("presetPopover");
  if (!pop || pop.hidden) return;
  if (pop.contains(e.target) || $("presetsBtn")?.contains(e.target)) return;
  closePresetPopover();
});

bindClick("compactMoveBtn", () => setMode(mode === "move" ? null : "move"));
bindClick("compactEraseBtn", () => setMode(mode === "erase" ? null : "erase"));
bindClick("compactUndoBtn", () => {
  if (history.length) restore(history.pop());
});
bindClick("validateBtn", validate);
bindClick("compactExpNone", () => setExpansionCount(0));
bindClick("compactExpAll", () => setExpansionCount(activeExpansions().length));

document.addEventListener("keydown", (e) => {
  const tag = (e.target?.tagName || "").toLowerCase();
  const editable =
    e.target?.isContentEditable ||
    ["input", "textarea", "select", "button"].includes(tag);
  if (
    editable ||
    appPage !== "planner" ||
    $("appDialog")?.open ||
    $("optimizerDialog")?.open
  )
    return;

  const plainArrow =
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.shiftKey;

  if (plainArrow) {
    e.preventDefault();
    e.stopPropagation();

    const step = 36 * (Number(appSettings.panSensitivity || 100) / 100);
    if (e.key === "ArrowLeft") panX -= step;
    else if (e.key === "ArrowRight") panX += step;
    else if (e.key === "ArrowUp") panY -= step;
    else if (e.key === "ArrowDown") panY += step;

    scheduleViewTransform();
    scheduleColonyPersist(selectedEra, 120);
    return;
  }

  const pressed = hotkeyFromEvent(e);
  if (!pressed) return;

  if (pressed === appSettings.hotkeyMove) {
    e.preventDefault();
    setMode(mode === "move" ? null : "move");
    return;
  }

  if (pressed === appSettings.hotkeyUndo) {
    e.preventDefault();
    if (history.length) restore(history.pop());
    return;
  }

  if (pressed === "Delete") {
    e.preventDefault();
    setMode(mode === "erase" ? null : "erase");
    return;
  }

  if (/^[1-9]$/.test(pressed)) {
    if (triggerBuildSlot(Number(pressed))) e.preventDefault();
  }
});

// Wheel zoom.
function boardCellFromPointer(e) {
  const board = $("board");
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (
    e.clientX < rect.left ||
    e.clientX >= rect.right ||
    e.clientY < rect.top ||
    e.clientY >= rect.bottom
  )
    return null;

  const c = Math.floor(((e.clientX - rect.left) * 28) / rect.width);
  const r = Math.floor(((e.clientY - rect.top) * 28) / rect.height);
  if (r < 0 || r >= 28 || c < 0 || c >= 28) return null;
  return { r, c };
}

const mapWrap = document.querySelector(".map-wrap");
if (mapWrap) {
  mapWrap.addEventListener(
    "pointerdown",
    (e) => {
      if (
        !isEditableColonyEra(selectedEra) ||
        mode !== "erase" ||
        e.button !== 0
      )
        return;
      const hit = boardCellFromPointer(e);
      if (!hit) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      suppressClickUntil = performance.now() + 300;
      panPointerId = null;
      panMoved = false;
      mapWrap.classList.remove("is-panning");

      eraseAt(hit.r, hit.c);
    },
    true,
  );
}
let viewTransformFrame = 0;
function applyViewTransform() {
  const board = $("board");
  if (board)
    board.style.transform = `translate3d(${panX}px,${panY}px,0) scale(${viewZoom})`;
  if (workspace) saveSharedCamera();
}
function scheduleViewTransform() {
  if (viewTransformFrame) return;
  viewTransformFrame = requestAnimationFrame(() => {
    viewTransformFrame = 0;
    applyViewTransform();
  });
}
if (mapWrap) {
  mapWrap.addEventListener(
    "wheel",
    (e) => {
      if (!isEditableColonyEra(selectedEra)) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      viewZoom = Math.max(
        0.55,
        Math.min(
          2.5,
          viewZoom +
            direction *
              0.015 *
              (Number(appSettings.zoomSensitivity || 100) / 100),
        ),
      );
      scheduleViewTransform();
      scheduleColonyPersist(selectedEra, 160);
    },
    { passive: false },
  );

  mapWrap.addEventListener("pointerdown", (e) => {
    if (!isEditableColonyEra(selectedEra) || e.button !== 0) return;
    panPointerId = e.pointerId;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = panX;
    panOriginY = panY;
    panMoved = false;
  });

  mapWrap.addEventListener("pointermove", (e) => {
    if (panPointerId === e.pointerId) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (!panMoved && Math.hypot(dx, dy) > 6) {
        panMoved = true;
        mapWrap.classList.add("is-panning");
        hidePlacementPreview();
        hideHoverTooltip();
        mapWrap.setPointerCapture?.(e.pointerId);
      }
      if (panMoved) {
        const panFactor = Number(appSettings.panSensitivity || 100) / 100;
        panX = panOriginX + dx * panFactor;
        panY = panOriginY + dy * panFactor;
        scheduleViewTransform();
      }
      return;
    }
  });

  const stopPan = (e) => {
    if (panPointerId !== e.pointerId) return;
    if (panMoved) {
      suppressClickUntil = performance.now() + 120;
    }
    panPointerId = null;
    panMoved = false;
    mapWrap.classList.remove("is-panning");
    persistColonyState(selectedEra);
    try {
      if (mapWrap.hasPointerCapture?.(e.pointerId))
        mapWrap.releasePointerCapture(e.pointerId);
    } catch {}
  };
  mapWrap.addEventListener("pointerup", stopPan);
  mapWrap.addEventListener("pointercancel", stopPan);
  mapWrap.addEventListener("pointerleave", (e) => {
    updateBuyHover(null);
  });
}

const SAAB_TOWNHALL_SRC = $("townHallImg").src;
const SAAB_TOWNHALL_ALT = $("townHallImg").alt;

function showEditableColonyUi(era) {
  closePresetPopover();

  if (isEditableColonyEra(selectedEra) && selectedEra !== era) {
    persistColonyState(selectedEra);
  }

  history = [];
  selectedEra = era;
  setMode(null, false);

  $("board").style.display = "grid";
  $("eraPlaceholder").style.display = "none";
  $("compactSummary").style.display = "block";

  const hideCheck = era === "SAT" || era === "SASH";
  const noExpansionEra = activeExpansions().length === 0;
  $("validateBtn").style.display = hideCheck ? "none" : "";
  $("compactMoveBtn").style.display = "";
  $("compactUndoBtn").style.display = "";
  $("clearAllBtn").style.display = "";
  $("compactExpNone").style.display = noExpansionEra ? "none" : "";
  $("compactExpAll").style.display = noExpansionEra ? "none" : "";

  $("presetsBtn").style.display = "";
  $("freeBuildBtn").style.display = "";
  $("optimizeBtn").style.display = "";
  $("savePresetBtn").style.display = "";

  const expCount = $("compactExpCount");
  if (expCount && expCount.parentElement) {
    expCount.parentElement.style.display = noExpansionEra ? "none" : "";
  }

  if (!restoreColonyState(era)) {
    activeLayoutMode = "free";
    activePresetId = null;
    loadBlank();
  }
  updateLayoutModeButtons();

  renderExpGrid();
  render();
  renderBuildMenu();
  status("", true);
}

function showSaabUi() {
  showEditableColonyUi("SAAB");
}

function showSamUi() {
  showEditableColonyUi("SAM");
}

function showSavUi() {
  showEditableColonyUi("SAV");
}

function showSajmUi() {
  showEditableColonyUi("SAJM");
}

function showSatUi() {
  showEditableColonyUi("SAT");
}

function showSashUi() {
  showEditableColonyUi("SASH");
}

function renderPendingFootprint(era) {
  const canvas = $("eraFootprintPreview");
  const chunks = PENDING_MAX_FOOTPRINTS[era];

  if (!canvas || !chunks) {
    if (canvas) canvas.style.display = "none";
    return false;
  }

  const ctx = canvas.getContext("2d");
  const size = 360;
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const cells = new Set();
  for (const [br, bc] of chunks) {
    for (let dr = 0; dr < 4; dr++) {
      for (let dc = 0; dc < 4; dc++) {
        cells.add(`${br * 4 + dr},${bc * 4 + dc}`);
      }
    }
  }

  const coords = [...cells].map((x) => x.split(",").map(Number));
  const rows = coords.map((x) => x[0]);
  const cols = coords.map((x) => x[1]);
  const minR = Math.min(...rows),
    maxR = Math.max(...rows);
  const minC = Math.min(...cols),
    maxC = Math.max(...cols);

  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const margin = 20;
  const cell = Math.min((size - margin * 2) / w, (size - margin * 2) / h);
  const ox = (size - w * cell) / 2;
  const oy = (size - h * cell) / 2;

  ctx.fillStyle = "#151311";
  ctx.fillRect(0, 0, size, size);

  for (const [r, c] of coords) {
    const x = ox + (c - minC) * cell;
    const y = oy + (r - minR) * cell;
    ctx.fillStyle = era === "SAT" ? "#173f31" : "#4a6686";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = era === "SAT" ? "#113126" : "#394f68";
    ctx.lineWidth = Math.max(0.5, cell * 0.05);
    ctx.strokeRect(x, y, cell, cell);
  }

  // Emphasize 4x4 plot borders.
  ctx.strokeStyle = era === "SAT" ? "#255943" : "#5b7798";
  ctx.lineWidth = Math.max(1, cell * 0.12);
  for (const [br, bc] of chunks) {
    const x = ox + (bc * 4 - minC) * cell;
    const y = oy + (br * 4 - minR) * cell;
    ctx.strokeRect(x, y, cell * 4, cell * 4);
  }

  canvas.style.display = "block";
  return true;
}

function showPendingEra(era) {
  if (isEditableColonyEra(selectedEra)) persistColonyState(selectedEra);

  history = [];
  selectedEra = era;
  setMode(null, false);

  $("board").style.display = "none";
  $("eraPlaceholder").style.display = "flex";
  $("compactSummary").style.display = "block";
  $("validateBtn").style.display = "none";
  $("presetsBtn").style.display = "none";
  $("freeBuildBtn").style.display = "none";
  $("optimizeBtn").style.display = "none";
  $("savePresetBtn").style.display = "none";
  $("compactMoveBtn").style.display = "none";
  $("compactUndoBtn").style.display = "none";
  $("clearAllBtn").style.display = "none";
  $("compactExpNone").style.display = "none";
  $("compactExpAll").style.display = "none";

  const data = ERA_DATA[era];
  const img = $("eraPlaceholderImg");
  const precisePreview = PRECISE_PENDING_PREVIEWS[era];
  const hasKnownMaxFootprint = precisePreview
    ? false
    : renderPendingFootprint(era);

  $("eraPlaceholderTitle").textContent = era;
  $("eraPlaceholderText").textContent = precisePreview
    ? "MAX FOOTPRINT + TOWN HALL KNOWN · START / EXPANSIONS PENDING"
    : hasKnownMaxFootprint
      ? "MAX FOOTPRINT: 656 TILES · START / EXPANSIONS / TOWN HALL PENDING"
      : "MAP LAYOUT PENDING";

  if (precisePreview) {
    const canvas = $("eraFootprintPreview");
    if (canvas) canvas.style.display = "none";
    img.src = precisePreview;
    img.alt = era + " footprint preview";
    img.classList.add("precise-pending-preview");
    img.style.display = "block";
  } else if (hasKnownMaxFootprint) {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.remove("precise-pending-preview");
    img.style.display = "none";
  } else if (data?.townHall?.sprite) {
    img.src = data.townHall.sprite;
    img.alt = era + " Town Hall";
    img.classList.remove("precise-pending-preview");
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.remove("precise-pending-preview");
    img.style.display = "none";
  }

  updateStats();
  renderBuildMenu();
  status("", false);
}

function applyEraTheme(era) {
  applyConfiguredTheme(era);
  document.querySelectorAll(".era-btn").forEach((btn) => {
    const selected = btn.dataset.era === era;
    btn.classList.toggle("active", selected);
    if (selected) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

const APP_SETTINGS_KEY = "foe-colony-optimizer-settings-v1";
const DEFAULT_APP_SETTINGS = {
  density: "normal",
  zoomSensitivity: 100,
  panSensitivity: 100,
  theme: "auto",
  hotkeyMove: "M",
  hotkeyUndo: "Ctrl+Z",
};

const HOTKEY_LABELS = {
  hotkeyMove: "Move mode",
  hotkeyUndo: "Undo",
};

const FIXED_HOTKEYS = new Set([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

function isReservedHotkey(binding) {
  return FIXED_HOTKEYS.has(binding);
}

let appSettings = { ...DEFAULT_APP_SETTINGS };
try {
  const saved = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || "null");
  if (saved && typeof saved === "object")
    appSettings = { ...DEFAULT_APP_SETTINGS, ...saved };
  delete appSettings.hotkeyErase;
  if (!["compact", "normal", "spacious"].includes(appSettings.density))
    appSettings.density = "normal";
  let hotkeysValid = true;
  const loadedHotkeys = new Set();
  for (const key of HOTKEY_SETTING_KEYS) {
    const binding = appSettings[key];
    if (
      typeof binding !== "string" ||
      !binding.trim() ||
      isReservedHotkey(binding) ||
      loadedHotkeys.has(binding)
    ) {
      hotkeysValid = false;
      break;
    }
    loadedHotkeys.add(binding);
  }
  if (!hotkeysValid) {
    for (const key of HOTKEY_SETTING_KEYS) {
      appSettings[key] = DEFAULT_APP_SETTINGS[key];
    }
  }
} catch {}

function applyThemeObject(theme, themeName) {
  if (!theme) return;
  document.body.dataset.eraTheme = themeName || "app";
  Object.entries(theme).forEach(([key, val]) =>
    document.documentElement.style.setProperty(key, val),
  );
}

function applyPageTheme(page) {
  const theme = APP_PAGE_THEMES[page];
  if (theme) applyThemeObject(theme, `page-${page}`);
}

function saveAppSettings() {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
  } catch {}
}

function effectiveThemeForEra(era) {
  if (appSettings.theme === "neutral") return NEUTRAL_THEME;
  if (appSettings.theme !== "auto" && ERA_THEMES[appSettings.theme])
    return ERA_THEMES[appSettings.theme];
  return ERA_THEMES[era] || ERA_THEMES.SAM;
}

function applyConfiguredTheme(era = selectedEra) {
  const theme = effectiveThemeForEra(era);
  applyThemeObject(
    theme,
    appSettings.theme === "auto" ? era : appSettings.theme,
  );
}

function applyDensityMode() {
  const density = ["compact", "normal", "spacious"].includes(
    appSettings.density,
  )
    ? appSettings.density
    : "normal";
  document.body.dataset.density = density;
}

function syncSettingsUi() {
  const density = $("densitySetting");
  const zoom = $("zoomSensitivitySetting");
  const pan = $("panSensitivitySetting");
  const theme = $("themeSetting");
  if (density) density.value = appSettings.density;
  if (zoom) zoom.value = appSettings.zoomSensitivity;
  if (pan) pan.value = appSettings.panSensitivity;
  if (theme) theme.value = appSettings.theme;
  if ($("zoomSensitivityValue"))
    $("zoomSensitivityValue").textContent = `${appSettings.zoomSensitivity}%`;
  if ($("panSensitivityValue"))
    $("panSensitivityValue").textContent = `${appSettings.panSensitivity}%`;
  document.querySelectorAll(".hotkey-input").forEach((input) => {
    const key = input.dataset.hotkeySetting;
    if (key && appSettings[key]) input.value = appSettings[key];
    input.classList.remove("recording");
  });
  updateHotkeyHints();
}

function hotkeyFromEvent(e) {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  let key = e.key;
  if (/^Key[A-Z]$/.test(e.code || "")) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code || "")) key = e.code.slice(5);
  else if (key === " ") key = "Space";
  else if (key === "Esc") key = "Escape";
  else if (key.length === 1) key = key.toUpperCase();

  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

function hotkeyAria(binding) {
  return String(binding || "")
    .replaceAll("Ctrl", "Control")
    .replaceAll("+", " ");
}

function updateHotkeyHints() {
  const move = $("compactMoveBtn");
  const undo = $("compactUndoBtn");

  if (move) {
    move.title = `Move a building or path (${appSettings.hotkeyMove})`;
    move.setAttribute("aria-keyshortcuts", hotkeyAria(appSettings.hotkeyMove));
  }
  if (undo) {
    undo.title = `Undo (${appSettings.hotkeyUndo})`;
    undo.setAttribute("aria-keyshortcuts", hotkeyAria(appSettings.hotkeyUndo));
  }
}

function populateHomeTownHallGrid() {
  const grid = $("homeTownHallGrid");
  if (!grid) return;
  const eras = [
    ["SAM", "Space Age Mars"],
    ["SAAB", "Space Age Asteroid Belt"],
    ["SAV", "Space Age Venus"],
    ["SAJM", "Space Age Jupiter Moon"],
    ["SAT", "Space Age Titan"],
    ["SASH", "Space Age Space Hub"],
  ];
  grid.innerHTML = "";
  eras.forEach(([era, name]) => {
    const hall = ERA_DATA[era]?.townHall;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "home-era-card";
    card.dataset.era = era;
    card.innerHTML = `<div class="home-era-thumb">${hall?.sprite ? `<img src="${hall.sprite}" alt="${name} Town Hall">` : ""}</div><div class="home-era-code">${era}</div><div class="home-era-name">${name}</div>`;
    card.addEventListener("click", () => {
      document.querySelector(`.era-btn[data-era="${era}"]`)?.click();
    });
    grid.appendChild(card);
  });
}

let appPage = "home";

function setAppPage(page) {
  appPage = page;
  const isHome = page === "home";
  const isSettings = page === "settings";

  document.body.classList.toggle("home-mode", isHome);
  document.body.classList.toggle("settings-mode", isSettings);
  if ($("homeScreen")) $("homeScreen").hidden = !isHome;
  if ($("settingsScreen")) $("settingsScreen").hidden = !isSettings;
  $("settingsBtn")?.classList.toggle("settings-active", isSettings);

  if (isHome || isSettings) {
    if (isEditableColonyEra(selectedEra)) persistColonyState(selectedEra);
    document
      .querySelectorAll(".era-btn")
      .forEach((btn) => btn.classList.remove("active"));
    closePresetPopover?.();
    hideHoverTooltip?.();
    hidePlacementPreview?.();
  }

  if (isHome) applyPageTheme("home");
  else if (isSettings) {
    applyPageTheme("settings");
    syncSettingsUi();
  }
}

function openPlannerFromEra() {
  setAppPage("planner");
}

$("appHomeBtn")?.addEventListener("click", () => setAppPage("home"));
$("settingsBtn")?.addEventListener("click", () => setAppPage("settings"));

const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/lacey49";
$("supportBtn")?.addEventListener("click", () => {
  window.open(BUY_ME_A_COFFEE_URL, "_blank", "noopener,noreferrer");
});

document.querySelectorAll(".hotkey-input").forEach((input) => {
  const settingKey = input.dataset.hotkeySetting;

  input.addEventListener("focus", () => {
    input.classList.add("recording");
    input.value = "Press a key…";
    input.select?.();
  });

  input.addEventListener("blur", () => {
    input.classList.remove("recording");
    input.value = appSettings[settingKey] || DEFAULT_APP_SETTINGS[settingKey];
  });

  input.addEventListener("keydown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      input.blur();
      return;
    }

    const binding = hotkeyFromEvent(e);
    if (!binding) return;

    if (isReservedHotkey(binding)) {
      const use = /^[1-9]$/.test(binding)
        ? "building shortcuts"
        : binding === "Delete"
          ? "deleting"
          : "moving the map";
      notifyToast(
        "That shortcut is already in use",
        `${binding} is already used for ${use}. Choose another shortcut.`,
        "warning",
        3200,
      );
      return;
    }

    const conflict = HOTKEY_SETTING_KEYS.find(
      (key) => key !== settingKey && appSettings[key] === binding,
    );
    if (conflict) {
      notifyToast(
        "That shortcut is already in use",
        `${binding} is already used for ${HOTKEY_LABELS[conflict]}. Choose another shortcut.`,
        "warning",
        3200,
      );
      return;
    }

    appSettings[settingKey] = binding;
    saveAppSettings();
    input.value = binding;
    input.classList.remove("recording");
    updateHotkeyHints();
    renderBuildMenu();
    input.blur();
  });
});

$("densitySetting")?.addEventListener("change", (e) => {
  appSettings.density = e.target.value;
  applyDensityMode();
  saveAppSettings();
});

$("zoomSensitivitySetting")?.addEventListener("input", (e) => {
  appSettings.zoomSensitivity = Number(e.target.value);
  if ($("zoomSensitivityValue"))
    $("zoomSensitivityValue").textContent = `${appSettings.zoomSensitivity}%`;
  saveAppSettings();
});

$("panSensitivitySetting")?.addEventListener("input", (e) => {
  appSettings.panSensitivity = Number(e.target.value);
  if ($("panSensitivityValue"))
    $("panSensitivityValue").textContent = `${appSettings.panSensitivity}%`;
  saveAppSettings();
});

$("themeSetting")?.addEventListener("change", (e) => {
  appSettings.theme = e.target.value;
  saveAppSettings();
  if (appPage === "planner") applyConfiguredTheme(selectedEra);
  else applyPageTheme(appPage);
});

$("resetSettingsBtn")?.addEventListener("click", async () => {
  const ok = await showConfirmDialog({
    title: "Reset settings?",
    message:
      "Reset all settings to their default values? Your colony layouts and saved presets will not be deleted.",
    confirmText: "Reset to default",
    cancelText: "Cancel",
  });
  if (!ok) return;

  appSettings = { ...DEFAULT_APP_SETTINGS };
  try {
    localStorage.removeItem(APP_SETTINGS_KEY);
  } catch {}
  applyDensityMode();
  syncSettingsUi();
  applyPageTheme("settings");
  notifyToast(
    "Settings reset",
    "Settings are back to default.",
    "success",
    2800,
  );
});

document.querySelectorAll(".era-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const era = btn.dataset.era;
    openPlannerFromEra();
    applyEraTheme(era);
    if (era === "SAAB") showSaabUi();
    else if (era === "SAM") showSamUi();
    else if (era === "SAV") showSavUi();
    else if (era === "SAJM") showSajmUi();
    else if (era === "SAT") showSatUi();
    else if (era === "SASH") showSashUi();
    else showPendingEra(era);
  });
});
