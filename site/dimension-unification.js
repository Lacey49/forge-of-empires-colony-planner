/* Use one authoritative footprint per building: w x h. */
(() => {
  if (window.__FOE_DIMENSION_UNIFICATION_V1__) return;
  window.__FOE_DIMENSION_UNIFICATION_V1__ = true;

  if (!ERA_DATA || typeof ERA_DATA !== 'object') return;

  for (const era of Object.values(ERA_DATA)) {
    const defs = [
      era?.townHall,
      ...(era?.residential || []),
      ...(era?.goods || []),
      ...(era?.lifeSupport || [])
    ].filter(Boolean);

    for (const def of defs) {
      delete def.boardW;
      delete def.boardH;
    }
  }

  // Legacy helpers used boardW/boardH when present. From this point on,
  // every board consumer reads the same w/h values shown everywhere else.
  const directBoardDef = def => def || null;
  const directEraBoardDef = (era, key) => eraBuildingByKey(era, key);

  try { boardBuildingDef = directBoardDef; } catch (_) {}
  try { eraBoardBuildingByKey = directEraBoardDef; } catch (_) {}

  // Keep window aliases aligned for any later-loaded compatibility code.
  window.boardBuildingDef = directBoardDef;
  window.eraBoardBuildingByKey = directEraBoardDef;
})();
