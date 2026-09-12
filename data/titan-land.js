/* Correct Space Age Titan land geometry from the in-game colony footprint. */
(() => {
  if (window.__FOE_SAT_GEOMETRY_V1__) return;
  window.__FOE_SAT_GEOMETRY_V1__ = true;

  if (typeof COLONY_CONFIGS !== "object" || !COLONY_CONFIGS?.SAT) return;

  // 18 plots available when the Titan colony opens.
  const baseChunks = [
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 1],
    [2, 2],
    [2, 3],
    [2, 4],
    [3, 0],
    [3, 1],
    [3, 2],
    [3, 3],
    [3, 4],
    [4, 0],
    [4, 1],
    [4, 2],
    [4, 3],
    [4, 4],
  ];

  // 23 purchasable 4x4 expansions.
  const expansionChunks = [
    [0, 4],
    [0, 5],
    [0, 6],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 5],
    [2, 6],
    [3, 5],
    [3, 6],
    [4, 5],
    [4, 6],
    [5, 0],
    [5, 1],
    [5, 2],
    [5, 3],
    [5, 4],
    [5, 5],
    [5, 6],
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 3],
  ];

  if (baseChunks.length !== 18 || expansionChunks.length !== 23) {
    throw new Error(
      "SAT geometry must contain 18 starting plots and 23 expansions.",
    );
  }

  const seen = new Set();
  for (const [br, bc] of [...baseChunks, ...expansionChunks]) {
    const key = `${br},${bc}`;
    if (seen.has(key)) throw new Error(`Duplicate SAT plot ${key}`);
    seen.add(key);
  }

  COLONY_CONFIGS.SAT.baseChunks = baseChunks.map((chunk) => [...chunk]);
  COLONY_CONFIGS.SAT.expansions = expansionChunks.map(([br, bc], index) => ({
    id: `T${String(index + 1).padStart(2, "0")}`,
    br,
    bc,
  }));

  // Matches the Town Hall position shown in the corrected in-game footprint.
  COLONY_CONFIGS.SAT.defaultHub = [8, 4];

  if (typeof PENDING_MAX_FOOTPRINTS === "object" && PENDING_MAX_FOOTPRINTS) {
    PENDING_MAX_FOOTPRINTS.SAT = [...baseChunks, ...expansionChunks].map(
      (chunk) => [...chunk],
    );
  }
})();
