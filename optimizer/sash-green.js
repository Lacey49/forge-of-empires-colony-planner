/* SASH early-game optimizer: maximize Simple Crew Quarters while keeping Life Support green. */

const SASH_GREEN_RULE = Object.freeze({
  crewKey: "simpleCrewQuarters",
  supportKey: "floraShipExpress",
  // 336F >= 1.25 * 137Q  ->  1344F >= 685Q
  supportNumerator: 685,
  supportDenominator: 1344,
});

function sashMinFloraForCrew(crewCount) {
  return Math.ceil(
    (SASH_GREEN_RULE.supportNumerator * Math.max(0, crewCount)) /
      SASH_GREEN_RULE.supportDenominator,
  );
}

function sashGreenStats(state) {
  let crew = 0,
    flora = 0,
    colonists = 0,
    lifeSupport = 0,
    credits4h = 0,
    area = 0;

  for (const building of state?.buildings || []) {
    const def = eraBoardBuildingByKey("SASH", building.type);
    if (!def) continue;

    area += def.w * def.h;

    if (building.type === SASH_GREEN_RULE.crewKey) {
      crew++;
      colonists += Number(def.colonists || 0);
      if (def.creditAmount && def.creditHours) {
        credits4h +=
          Number(def.creditAmount) * (4 / Number(def.creditHours));
      }
    } else if (building.type === SASH_GREEN_RULE.supportKey) {
      flora++;
      lifeSupport += Number(def.lifeSupport || 0);
    }
  }

  const green = colonists > 0 && lifeSupport * 4 >= colonists * 5;
  return {
    crew,
    flora,
    colonists,
    lifeSupport,
    ratio: colonists ? lifeSupport / colonists : 0,
    green,
    credits4h,
    area,
  };
}

function sashGreenStateUsesEarlyBuildingsOnly(state) {
  return (state?.buildings || []).every(
    (building) =>
      building.type === SASH_GREEN_RULE.crewKey ||
      building.type === SASH_GREEN_RULE.supportKey,
  );
}

function sashGreenBetter(a, b) {
  if (!b) return true;
  if (a.crew !== b.crew) return a.crew > b.crew;
  if (a.flora !== b.flora) return a.flora < b.flora;
  return a.unused < b.unused;
}

function sashPlacementIndex(ctx, hall, crewDef, floraDef) {
  const freeIds = [...ctx.owned].filter((id) => !hall.set.has(id));
  const crewPlacements = oxPlacements(ctx, crewDef, hall, new Set());
  const floraPlacements = oxPlacements(ctx, floraDef, hall, new Set());
  const byCell = new Map(freeIds.map((id) => [id, []]));

  const add = (kind, placement) => {
    for (const id of placement.ids) {
      const list = byCell.get(id);
      if (list) list.push({ kind, placement });
    }
  };
  for (const placement of floraPlacements) add("flora", placement);
  for (const placement of crewPlacements) add("crew", placement);

  return {
    freeIds,
    freeMask: ctx.ownedMask & ~hall.mask,
    byCell,
  };
}

function sashExactPackingForHall(
  ctx,
  hall,
  crewDef,
  floraDef,
  crewTarget,
  floraTarget,
  stopAt,
) {
  const index = sashPlacementIndex(ctx, hall, crewDef, floraDef);
  const crewArea = crewDef.w * crewDef.h;
  const floraArea = floraDef.w * floraDef.h;
  const unused =
    index.freeIds.length -
    crewTarget * crewArea -
    floraTarget * floraArea;

  if (unused < 0) return { solution: null, complete: true, nodes: 0 };

  const memo = new Set();
  let nodes = 0;
  let timedOut = false;

  const dfs = (mask, crewLeft, floraLeft, unusedLeft, placements) => {
    nodes++;
    if (
      (nodes & 511) === 0 &&
      (performance.now() >= stopAt || optimizerCancelRequested)
    ) {
      timedOut = true;
      return null;
    }

    if (crewLeft === 0 && floraLeft === 0) return placements;

    let bestId = null;
    let bestOptions = null;
    let bestCount = Infinity;

    for (const id of index.freeIds) {
      const bit = oxIdBit(id);
      if ((mask & bit) === 0n) continue;

      const options = [];
      for (const entry of index.byCell.get(id) || []) {
        if (entry.kind === "crew" && crewLeft <= 0) continue;
        if (entry.kind === "flora" && floraLeft <= 0) continue;
        if ((entry.placement.mask & mask) === entry.placement.mask)
          options.push(entry);
      }

      if (options.length < bestCount) {
        bestCount = options.length;
        bestId = id;
        bestOptions = options;
        if (bestCount === 0) break;
      }
    }

    if (bestId == null) return null;

    const memoKey =
      mask.toString(36) + "|" + crewLeft + "|" + floraLeft;
    if (memo.has(memoKey)) return null;

    // Flora first tends to close 3x3 holes early, which makes impossible
    // high-Crew candidates fail much faster.
    bestOptions.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "flora" ? -1 : 1;
      return (
        a.placement.r - b.placement.r ||
        a.placement.c - b.placement.c
      );
    });

    for (const entry of bestOptions) {
      const p = entry.placement;
      const next =
        entry.kind === "flora"
          ? dfs(
              mask ^ p.mask,
              crewLeft,
              floraLeft - 1,
              unusedLeft,
              [...placements, p],
            )
          : dfs(
              mask ^ p.mask,
              crewLeft - 1,
              floraLeft,
              unusedLeft,
              [...placements, p],
            );
      if (next) return next;
      if (timedOut) return null;
    }

    if (unusedLeft > 0) {
      const next = dfs(
        mask ^ oxIdBit(bestId),
        crewLeft,
        floraLeft,
        unusedLeft - 1,
        placements,
      );
      if (next) return next;
      if (timedOut) return null;
    }

    memo.add(memoKey);
    return null;
  };

  const placements = dfs(
    index.freeMask,
    crewTarget,
    floraTarget,
    unused,
    [],
  );

  return {
    solution: placements
      ? { hall, roads: new Set(), placements }
      : null,
    complete: !timedOut,
    nodes,
  };
}

function sashKnownStartingFallback(ctx) {
  if (ctx.enabled.size !== 0) return null;

  const crewDef = eraBoardBuildingByKey("SASH", SASH_GREEN_RULE.crewKey);
  const floraDef = eraBoardBuildingByKey("SASH", SASH_GREEN_RULE.supportKey);
  const hall = oxHall(ctx, [6, 4]);
  if (!crewDef || !floraDef || !hall) return null;

  // Verified exact packing for the no-expansion footprint.
  const flora = [
    [0, 6],
    [0, 17],
    [3, 4],
    [3, 7],
    [3, 12],
    [3, 15],
    [7, 9],
    [14, 1],
    [14, 4],
    [14, 7],
    [17, 0],
    [17, 9],
  ];
  const crew = [
    [0, 4],
    [0, 9],
    [0, 11],
    [0, 13],
    [0, 15],
    [4, 10],
    [4, 18],
    [6, 12],
    [6, 14],
    [8, 0],
    [8, 2],
    [9, 12],
    [9, 14],
    [11, 0],
    [11, 2],
    [11, 4],
    [11, 6],
    [11, 8],
    [11, 10],
    [14, 10],
    [17, 3],
    [17, 5],
    [17, 7],
  ];

  const makePlacement = (def, r, c) => {
    const ids = oxRect(r, c, def.h, def.w);
    return {
      type: def.key,
      r,
      c,
      ids,
      mask: oxMask(ids),
      touch: 0,
    };
  };
  const sol = {
    hall,
    roads: new Set(),
    placements: [
      ...flora.map(([r, c]) => makePlacement(floraDef, r, c)),
      ...crew.map(([r, c]) => makePlacement(crewDef, r, c)),
    ],
  };
  const state = oxState(ctx, sol);
  const stats = sashGreenStats(state);
  if (
    !oxValid(ctx, state) ||
    !sashGreenStateUsesEarlyBuildingsOnly(state) ||
    !stats.green
  )
    return null;

  return {
    state,
    stats: {
      ...stats,
      unused:
        ctx.ownedCount -
        ctx.hall.w * ctx.hall.h -
        stats.area,
    },
    solution: sol,
  };
}

async function optimizeSashGreen(ctx, primaryKey) {
  if (primaryKey !== SASH_GREEN_RULE.crewKey)
    throw new Error("Early SASH optimization currently supports Simple Crew Quarters");

  const crewDef = eraBoardBuildingByKey("SASH", SASH_GREEN_RULE.crewKey);
  const floraDef = eraBoardBuildingByKey("SASH", SASH_GREEN_RULE.supportKey);
  if (!crewDef || !floraDef)
    throw new Error("Missing SASH Life Support optimizer building data");

  let best = sashKnownStartingFallback(ctx);
  if (!best) {
    const current = currentColonyState();
    const stats = sashGreenStats(current);
    if (
      sashGreenStateUsesEarlyBuildingsOnly(current) &&
      stats.green &&
      oxValid(ctx, current)
    ) {
      best = {
        state: cloneState(current),
        stats: {
          ...stats,
          unused:
            ctx.ownedCount -
            ctx.hall.w * ctx.hall.h -
            stats.area,
        },
      };
    }
  }

  if (best) {
    ctx.bestState = best.state;
    ctx.bestScore = oxScore(ctx, best.state, primaryKey);
  }

  const hallArea = ctx.hall.w * ctx.hall.h;
  const crewArea = crewDef.w * crewDef.h;
  const floraArea = floraDef.w * floraDef.h;
  let theoreticalMax = Math.floor(
    (ctx.ownedCount - hallArea) / crewArea,
  );
  while (
    theoreticalMax > 0 &&
    hallArea +
      theoreticalMax * crewArea +
      sashMinFloraForCrew(theoreticalMax) * floraArea >
      ctx.ownedCount
  ) {
    theoreticalMax--;
  }

  const hubs = oxHubs(ctx, [
    best?.state?.hubTop,
    hubTop,
    ctx.cfg.defaultHub,
    [0, 4],
  ]);

  let allHigherCandidatesProvenImpossible = true;

  for (
    let crewTarget = theoreticalMax;
    crewTarget >= 0 &&
    performance.now() < ctx.deadline &&
    !optimizerCancelRequested;
    crewTarget--
  ) {
    const floraTarget = sashMinFloraForCrew(crewTarget);
    const required =
      hallArea +
      crewTarget * crewArea +
      floraTarget * floraArea;
    if (required > ctx.ownedCount) continue;

    if (best?.stats && crewTarget < best.stats.crew) break;

    let candidateComplete = true;

    for (let hi = 0; hi < hubs.length; hi++) {
      if (optimizerCancelRequested || performance.now() >= ctx.deadline) {
        candidateComplete = false;
        break;
      }

      const hall = oxHall(ctx, hubs[hi]);
      if (!hall) continue;

      // Keep one hard geometry branch from freezing the browser. Starting SASH
      // completes these branches very quickly; larger colonies may return a
      // best-found result instead of claiming proof.
      const branchStop = Math.min(ctx.deadline, performance.now() + 75);
      const attempt = sashExactPackingForHall(
        ctx,
        hall,
        crewDef,
        floraDef,
        crewTarget,
        floraTarget,
        branchStop,
      );
      ctx.tested += attempt.nodes;

      if (!attempt.complete) {
        candidateComplete = false;
        allHigherCandidatesProvenImpossible = false;
      }

      if (attempt.solution) {
        const state = oxState(ctx, attempt.solution);
        const baseStats = sashGreenStats(state);
        const stats = {
          ...baseStats,
          unused:
            ctx.ownedCount -
            hallArea -
            baseStats.area,
        };

        if (
          oxValid(ctx, state) &&
          sashGreenStateUsesEarlyBuildingsOnly(state) &&
          stats.green &&
          sashGreenBetter(stats, best?.stats)
        ) {
          best = { state, stats, solution: attempt.solution };
          ctx.bestState = state;
          ctx.bestScore = oxScore(ctx, state, primaryKey);
          oxProgress(ctx, "Improved");
        }

        if (stats.green && stats.crew === crewTarget) {
          return {
            state,
            score: oxScore(ctx, state, primaryKey),
            cancelled: false,
            tested: ctx.tested,
            sashGreen: stats,
            proven:
              candidateComplete && allHigherCandidatesProvenImpossible,
          };
        }
      }

      if ((hi & 3) === 3) {
        if (!(await oxYield(ctx))) break;
      }
    }

    if (!candidateComplete) allHigherCandidatesProvenImpossible = false;
  }

  if (!best)
    throw new Error("No green-Life-Support SASH layout was found");

  return {
    state: best.state,
    score: oxScore(ctx, best.state, primaryKey),
    cancelled: optimizerCancelRequested,
    tested: ctx.tested,
    sashGreen: best.stats,
    proven: false,
  };
}
