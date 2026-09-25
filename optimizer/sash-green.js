/* SASH optimizer: maximize credits while keeping the selected Life Support pair green. */

const SASH_OPTIMIZER_PAIRS = Object.freeze([
  Object.freeze({
    id: "scq-fse",
    residentialKey: "simpleCrewQuarters",
    supportKey: "floraShipExpress",
    label: "Simple Crew Quarters + FloraShip Express",
  }),
  Object.freeze({
    id: "scq-cce",
    residentialKey: "simpleCrewQuarters",
    supportKey: "cosmicCleanExpress",
    label: "Simple Crew Quarters + CosmicClean Express",
  }),
  Object.freeze({
    id: "oq-cce",
    residentialKey: "officersQuarters",
    supportKey: "cosmicCleanExpress",
    label: "Officers Quarters + CosmicClean Express",
  }),
  Object.freeze({
    id: "oq-sesp",
    residentialKey: "officersQuarters",
    supportKey: "sitEatSpacePizza",
    label: "Officers Quarters + Sit'n'Eat SpacePizza",
  }),
]);

function sashPairFromId(value) {
  if (!value) return SASH_OPTIMIZER_PAIRS[0];
  if (value === "simpleCrewQuarters") return SASH_OPTIMIZER_PAIRS[0];
  return (
    SASH_OPTIMIZER_PAIRS.find((pair) => pair.id === value) ||
    SASH_OPTIMIZER_PAIRS[0]
  );
}

function sashMinSupportForResidential(pairOrId, residentialCount) {
  const pair =
    typeof pairOrId === "string" ? sashPairFromId(pairOrId) : pairOrId;
  const residential = eraBoardBuildingByKey(
    "SASH",
    pair?.residentialKey,
  );
  const support = eraBoardBuildingByKey("SASH", pair?.supportKey);
  if (!residential || !support || !support.lifeSupport) return Infinity;

  // Green tier: Life Support >= 125% of colonists.
  return Math.ceil(
    (5 * Number(residential.colonists || 0) * Math.max(0, residentialCount)) /
      (4 * Number(support.lifeSupport)),
  );
}

function sashPairStats(state, pairOrId) {
  const pair =
    typeof pairOrId === "string" ? sashPairFromId(pairOrId) : pairOrId;
  const residentialDef = eraBoardBuildingByKey(
    "SASH",
    pair.residentialKey,
  );
  const supportDef = eraBoardBuildingByKey("SASH", pair.supportKey);

  let residentialCount = 0,
    supportCount = 0,
    colonists = 0,
    lifeSupport = 0,
    credits4h = 0,
    area = 0;

  for (const building of state?.buildings || []) {
    const def = eraBoardBuildingByKey("SASH", building.type);
    if (!def) continue;

    area += def.w * def.h;

    if (building.type === pair.residentialKey) {
      residentialCount++;
      colonists += Number(def.colonists || 0);
      if (def.creditAmount && def.creditHours) {
        credits4h +=
          Number(def.creditAmount) * (4 / Number(def.creditHours));
      }
    } else if (building.type === pair.supportKey) {
      supportCount++;
      lifeSupport += Number(def.lifeSupport || 0);
    }
  }

  const ratio = colonists ? lifeSupport / colonists : 0;
  return {
    pairId: pair.id,
    residentialKey: pair.residentialKey,
    supportKey: pair.supportKey,
    residentialName: residentialDef?.name || pair.residentialKey,
    supportName: supportDef?.name || pair.supportKey,
    residentialCount,
    supportCount,
    colonists,
    lifeSupport,
    ratio,
    green: colonists > 0 && lifeSupport * 4 >= colonists * 5,
    credits4h,
    area,
  };
}

function sashGreenStateUsesPair(state, pairOrId) {
  const pair =
    typeof pairOrId === "string" ? sashPairFromId(pairOrId) : pairOrId;
  return (state?.buildings || []).every(
    (building) =>
      building.type === pair.residentialKey ||
      building.type === pair.supportKey,
  );
}

function sashGreenBetter(a, b) {
  if (!b) return true;
  const aResidential = a.residentialCount ?? 0;
  const bResidential = b.residentialCount ?? 0;
  if (aResidential !== bResidential)
    return aResidential > bResidential;

  const aSupport = a.supportCount ?? 0;
  const bSupport = b.supportCount ?? 0;
  if (aSupport !== bSupport) return aSupport < bSupport;

  return (a.unused ?? Infinity) < (b.unused ?? Infinity);
}

function sashPlacementIndex(ctx, hall, residentialDef, supportDef) {
  const freeIds = [...ctx.owned].filter((id) => !hall.set.has(id));
  const residentialPlacements = oxPlacements(
    ctx,
    residentialDef,
    hall,
    new Set(),
  );
  const supportPlacements = oxPlacements(ctx, supportDef, hall, new Set());
  const byCell = new Map(freeIds.map((id) => [id, []]));

  const add = (kind, placement) => {
    for (const id of placement.ids) {
      const list = byCell.get(id);
      if (list) list.push({ kind, placement });
    }
  };

  for (const placement of supportPlacements) add("support", placement);
  for (const placement of residentialPlacements)
    add("residential", placement);

  return {
    freeIds,
    freeMask: ctx.ownedMask & ~hall.mask,
    byCell,
  };
}

function sashExactPackingForHall(
  ctx,
  hall,
  residentialDef,
  supportDef,
  residentialTarget,
  supportTarget,
  stopAt,
) {
  const index = sashPlacementIndex(
    ctx,
    hall,
    residentialDef,
    supportDef,
  );
  const residentialArea = residentialDef.w * residentialDef.h;
  const supportArea = supportDef.w * supportDef.h;
  const unused =
    index.freeIds.length -
    residentialTarget * residentialArea -
    supportTarget * supportArea;

  if (unused < 0) return { solution: null, complete: true, nodes: 0 };

  const memo = new Set();
  let nodes = 0;
  let timedOut = false;

  const dfs = (
    mask,
    residentialLeft,
    supportLeft,
    unusedLeft,
    placements,
  ) => {
    nodes++;
    if (
      (nodes & 511) === 0 &&
      (performance.now() >= stopAt || optimizerCancelRequested)
    ) {
      timedOut = true;
      return null;
    }

    if (residentialLeft === 0 && supportLeft === 0) return placements;

    let bestId = null;
    let bestOptions = null;
    let bestCount = Infinity;

    for (const id of index.freeIds) {
      const bit = oxIdBit(id);
      if ((mask & bit) === 0n) continue;

      const options = [];
      for (const entry of index.byCell.get(id) || []) {
        if (entry.kind === "residential" && residentialLeft <= 0)
          continue;
        if (entry.kind === "support" && supportLeft <= 0) continue;
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
      mask.toString(36) +
      "|" +
      residentialLeft +
      "|" +
      supportLeft;
    if (memo.has(memoKey)) return null;

    // Try Life Support first. It is usually the larger or less flexible piece.
    bestOptions.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "support" ? -1 : 1;
      return (
        a.placement.r - b.placement.r ||
        a.placement.c - b.placement.c
      );
    });

    for (const entry of bestOptions) {
      const p = entry.placement;
      const next =
        entry.kind === "support"
          ? dfs(
              mask ^ p.mask,
              residentialLeft,
              supportLeft - 1,
              unusedLeft,
              [...placements, p],
            )
          : dfs(
              mask ^ p.mask,
              residentialLeft - 1,
              supportLeft,
              unusedLeft,
              [...placements, p],
            );
      if (next) return next;
      if (timedOut) return null;
    }

    if (unusedLeft > 0) {
      const next = dfs(
        mask ^ oxIdBit(bestId),
        residentialLeft,
        supportLeft,
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
    residentialTarget,
    supportTarget,
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

const SASH_STARTING_GREEN_SEEDS = Object.freeze({
  "scq-cce": Object.freeze({
    hub: [0, 4],
    residential: [
      [0, 18],
      [3, 18],
      [5, 7],
      [8, 0],
      [8, 2],
      [8, 7],
      [8, 9],
      [8, 14],
      [9, 4],
      [11, 0],
      [11, 2],
      [11, 6],
      [11, 8],
      [12, 4],
      [12, 10],
      [14, 0],
      [14, 2],
      [14, 6],
      [14, 8],
      [15, 4],
      [15, 10],
      [17, 0],
      [17, 2],
      [17, 6],
      [17, 8],
    ],
    support: [
      [0, 9],
      [0, 12],
      [0, 15],
      [4, 9],
      [4, 12],
      [4, 15],
      [5, 4],
      [8, 11],
    ],
  }),
  "oq-cce": Object.freeze({
    hub: [0, 4],
    residential: [
      [8, 7],
      [8, 11],
      [12, 0],
      [12, 4],
      [12, 8],
      [16, 0],
      [16, 4],
      [16, 8],
    ],
    support: [
      [0, 9],
      [0, 12],
      [0, 15],
      [4, 9],
      [4, 12],
      [4, 15],
      [5, 4],
      [8, 0],
    ],
  }),
  "oq-sesp": Object.freeze({
    hub: [0, 4],
    residential: [
      [8, 0],
      [8, 8],
      [8, 12],
      [9, 4],
      [12, 0],
      [12, 8],
      [13, 4],
      [16, 0],
      [16, 8],
    ],
    support: [
      [0, 9],
      [0, 13],
      [4, 9],
      [4, 13],
      [5, 4],
    ],
  }),
});

function sashKnownStartingFallback(ctx, pairOrId) {
  if (ctx.enabled.size !== 0) return null;

  const pair =
    typeof pairOrId === "string" ? sashPairFromId(pairOrId) : pairOrId;
  const residentialDef = eraBoardBuildingByKey(
    "SASH",
    pair.residentialKey,
  );
  const supportDef = eraBoardBuildingByKey("SASH", pair.supportKey);
  if (!residentialDef || !supportDef) return null;

  let seed = null;
  if (pair.id === "scq-fse") {
    seed = {
      hub: SASH_SIMPLE_PRESET_HUB,
      residential: SASH_SIMPLE_PRESET_BUILDINGS,
      support: SASH_SIMPLE_PRESET_LIFE_SUPPORT,
    };
  } else {
    seed = SASH_STARTING_GREEN_SEEDS[pair.id] || null;
  }
  if (!seed) return null;

  const hall = oxHall(ctx, seed.hub);
  if (!hall) return null;

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
      ...seed.support.map(([r, c]) =>
        makePlacement(supportDef, r, c),
      ),
      ...seed.residential.map(([r, c]) =>
        makePlacement(residentialDef, r, c),
      ),
    ],
  };

  const state = oxState(ctx, sol);
  const stats = sashPairStats(state, pair);
  if (
    !oxValid(ctx, state) ||
    !sashGreenStateUsesPair(state, pair) ||
    !stats.green
  )
    return null;

  return {
    state,
    stats: {
      ...stats,
      unused:
        ctx.ownedCount - ctx.hall.w * ctx.hall.h - stats.area,
    },
    solution: sol,
  };
}

async function optimizeSashGreen(ctx, pairId) {
  const pair = sashPairFromId(pairId);
  const residentialDef = eraBoardBuildingByKey(
    "SASH",
    pair.residentialKey,
  );
  const supportDef = eraBoardBuildingByKey("SASH", pair.supportKey);

  if (!residentialDef || !supportDef)
    throw new Error("Missing SASH optimizer building data");

  let best = sashKnownStartingFallback(ctx, pair);

  const current = currentColonyState();
  const currentStats = sashPairStats(current, pair);
  if (
    sashGreenStateUsesPair(current, pair) &&
    currentStats.green &&
    oxValid(ctx, current)
  ) {
    const candidate = {
      state: cloneState(current),
      stats: {
        ...currentStats,
        unused:
          ctx.ownedCount -
          ctx.hall.w * ctx.hall.h -
          currentStats.area,
      },
    };
    if (!best || sashGreenBetter(candidate.stats, best.stats))
      best = candidate;
  }

  if (best) {
    ctx.bestState = best.state;
    ctx.bestScore = oxScore(
      ctx,
      best.state,
      pair.residentialKey,
    );
  }

  const hallArea = ctx.hall.w * ctx.hall.h;
  const residentialArea = residentialDef.w * residentialDef.h;
  const supportArea = supportDef.w * supportDef.h;

  let theoreticalMax = Math.floor(
    (ctx.ownedCount - hallArea) / residentialArea,
  );
  while (
    theoreticalMax > 0 &&
    hallArea +
      theoreticalMax * residentialArea +
      sashMinSupportForResidential(pair, theoreticalMax) * supportArea >
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
    let residentialTarget = theoreticalMax;
    residentialTarget >= 0 &&
    performance.now() < ctx.deadline &&
    !optimizerCancelRequested;
    residentialTarget--
  ) {
    const supportTarget = sashMinSupportForResidential(
      pair,
      residentialTarget,
    );
    const required =
      hallArea +
      residentialTarget * residentialArea +
      supportTarget * supportArea;
    if (required > ctx.ownedCount) continue;

    if (
      best?.stats &&
      residentialTarget < best.stats.residentialCount
    )
      break;

    let candidateComplete = true;

    for (let hi = 0; hi < hubs.length; hi++) {
      if (optimizerCancelRequested || performance.now() >= ctx.deadline) {
        candidateComplete = false;
        break;
      }

      const hall = oxHall(ctx, hubs[hi]);
      if (!hall) continue;

      const branchStop = Math.min(
        ctx.deadline,
        performance.now() + 125,
      );
      const attempt = sashExactPackingForHall(
        ctx,
        hall,
        residentialDef,
        supportDef,
        residentialTarget,
        supportTarget,
        branchStop,
      );
      ctx.tested += attempt.nodes;

      if (!attempt.complete) {
        candidateComplete = false;
        allHigherCandidatesProvenImpossible = false;
      }

      if (attempt.solution) {
        const state = oxState(ctx, attempt.solution);
        const baseStats = sashPairStats(state, pair);
        const stats = {
          ...baseStats,
          unused:
            ctx.ownedCount - hallArea - baseStats.area,
        };

        if (
          oxValid(ctx, state) &&
          sashGreenStateUsesPair(state, pair) &&
          stats.green &&
          sashGreenBetter(stats, best?.stats)
        ) {
          best = { state, stats, solution: attempt.solution };
          ctx.bestState = state;
          ctx.bestScore = oxScore(
            ctx,
            state,
            pair.residentialKey,
          );
          oxProgress(ctx, "Improved");
        }

        if (
          stats.green &&
          stats.residentialCount === residentialTarget
        ) {
          return {
            state,
            score: oxScore(
              ctx,
              state,
              pair.residentialKey,
            ),
            cancelled: false,
            tested: ctx.tested,
            sashGreen: stats,
            sashPairId: pair.id,
            proven:
              candidateComplete && allHigherCandidatesProvenImpossible,
          };
        }
      }

      if ((hi & 3) === 3) {
        if (!(await oxYield(ctx))) break;
      }
    }

    if (!candidateComplete)
      allHigherCandidatesProvenImpossible = false;
  }

  if (!best)
    throw new Error(
      "No green-Life-Support SASH layout was found for the selected buildings",
    );

  return {
    state: best.state,
    score: oxScore(ctx, best.state, pair.residentialKey),
    cancelled: optimizerCancelRequested,
    tested: ctx.tested,
    sashGreen: best.stats,
    sashPairId: pair.id,
    proven: false,
  };
}

/*
 * SASH uses a different optimization problem from the other colonies.
 * Keep it outside the generic residential/path post-processing chain so those
 * passes cannot remove Life Support buildings or strip SASH-specific results.
 * This file is loaded after the generic optimizer passes and before the shared
 * search-time wrapper.
 */
if (typeof optimizeColonyV2 === "function") {
  const optimizeOtherColony = optimizeColonyV2;
  optimizeColonyV2 = async function (era, goal, primaryKey, mode) {
    if (era !== "SASH")
      return optimizeOtherColony(era, goal, primaryKey, mode);

    const ctx = oxCtx(era);
    ctx.goal = goal;
    ctx.primaryKey = primaryKey;
    ctx.started = performance.now();
    ctx.lastYield = ctx.started;
    ctx.deadline =
      ctx.started + (OPT_BUDGET[mode] || OPT_BUDGET.deep);
    return optimizeSashGreen(ctx, primaryKey);
  };
}
