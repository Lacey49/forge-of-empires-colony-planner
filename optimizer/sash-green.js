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

const SASH_CORE_RESIDENTIAL_KEYS = Object.freeze([
  "simpleCrewQuarters",
  "officersQuarters",
]);
const SASH_SUPPORT_KEYS = Object.freeze([
  "floraShipExpress",
  "cosmicCleanExpress",
  "sitEatSpacePizza",
]);

function sashAllowedKeys(pairOrId) {
  const pair =
    typeof pairOrId === "string" ? sashPairFromId(pairOrId) : pairOrId;
  const residentialIndex = Math.max(
    0,
    SASH_CORE_RESIDENTIAL_KEYS.indexOf(pair.residentialKey),
  );
  const supportIndex = Math.max(
    0,
    SASH_SUPPORT_KEYS.indexOf(pair.supportKey),
  );
  return {
    residential: SASH_CORE_RESIDENTIAL_KEYS.slice(0, residentialIndex + 1),
    support: SASH_SUPPORT_KEYS.slice(0, supportIndex + 1),
  };
}

function sashAllowedDefs(pairOrId) {
  const allowed = sashAllowedKeys(pairOrId);
  return {
    residential: allowed.residential
      .map((key) => eraBoardBuildingByKey("SASH", key))
      .filter(Boolean),
    support: allowed.support
      .map((key) => eraBoardBuildingByKey("SASH", key))
      .filter(Boolean),
  };
}

function sashCredit4h(def) {
  return def?.creditAmount && def?.creditHours
    ? Number(def.creditAmount) * (4 / Number(def.creditHours))
    : 0;
}

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
    totalResidentialCount = 0,
    totalSupportCount = 0,
    colonists = 0,
    lifeSupport = 0,
    credits4h = 0,
    area = 0,
    supportArea = 0;
  const counts = {};

  for (const building of state?.buildings || []) {
    const def = eraBoardBuildingByKey("SASH", building.type);
    if (!def) continue;

    counts[building.type] = (counts[building.type] || 0) + 1;
    area += def.w * def.h;

    if (def.category === "residential") {
      totalResidentialCount++;
      colonists += Number(def.colonists || 0);
      credits4h += sashCredit4h(def);
      if (building.type === pair.residentialKey) residentialCount++;
    } else if (def.category === "lifeSupport") {
      totalSupportCount++;
      lifeSupport += Number(def.lifeSupport || 0);
      supportArea += def.w * def.h;
      if (building.type === pair.supportKey) supportCount++;
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
    totalResidentialCount,
    totalSupportCount,
    colonists,
    lifeSupport,
    ratio,
    green: colonists > 0 && lifeSupport * 4 >= colonists * 5,
    credits4h,
    area,
    supportArea,
    counts,
  };
}

function sashGreenStateUsesPair(state, pairOrId) {
  const allowed = sashAllowedKeys(pairOrId);
  const keys = new Set([...allowed.residential, ...allowed.support]);
  return (state?.buildings || []).every((building) => keys.has(building.type));
}

function sashGreenBetter(a, b) {
  if (!b) return true;
  if ((a.credits4h || 0) !== (b.credits4h || 0))
    return (a.credits4h || 0) > (b.credits4h || 0);

  if ((a.unused ?? Infinity) !== (b.unused ?? Infinity))
    return (a.unused ?? Infinity) < (b.unused ?? Infinity);

  const aResidential = a.residentialCount ?? 0;
  const bResidential = b.residentialCount ?? 0;
  if (aResidential !== bResidential)
    return aResidential > bResidential;

  if ((a.supportArea ?? Infinity) !== (b.supportArea ?? Infinity))
    return (a.supportArea ?? Infinity) < (b.supportArea ?? Infinity);

  return (a.totalSupportCount ?? Infinity) < (b.totalSupportCount ?? Infinity);
}

function sashStatsSummary(stats) {
  if (!stats?.counts) return "";
  const order = [
    "officersQuarters",
    "simpleCrewQuarters",
    "sitEatSpacePizza",
    "cosmicCleanExpress",
    "floraShipExpress",
  ];
  return order
    .filter((key) => stats.counts[key])
    .map((key) => {
      const def = eraBoardBuildingByKey("SASH", key);
      return stats.counts[key] + " " + (def?.name || key);
    })
    .join(" · ");
}

function sashPlacementForDef(ctx, hall, def, r, c) {
  if (r < 0 || c < 0 || r + def.h > 28 || c + def.w > 28) return null;
  const ids = oxRect(r, c, def.h, def.w);
  const mask = oxMask(ids);
  if ((mask & ~ctx.ownedMask) !== 0n || (mask & hall.mask) !== 0n) return null;
  return { type: def.key, r, c, ids, mask, touch: 0 };
}

function sashFillPreviousBuildings(ctx, state, pairOrId) {
  const pair =
    typeof pairOrId === "string" ? sashPairFromId(pairOrId) : pairOrId;
  const defs = sashAllowedDefs(pair);
  const sol = oxSolFromState(ctx, state);
  if (!sol) return { state, stats: sashPairStats(state, pair), changed: false };

  let occupied = sol.hall.mask;
  for (const placement of sol.placements) occupied |= placement.mask;

  const residentialDefs = [...defs.residential].sort(
    (a, b) =>
      sashCredit4h(b) - sashCredit4h(a) ||
      a.w * a.h - b.w * b.h,
  );
  const supportDefs = [...defs.support].sort(
    (a, b) =>
      Number(b.lifeSupport || 0) / (b.w * b.h) -
        Number(a.lifeSupport || 0) / (a.w * a.h) ||
      a.w * a.h - b.w * b.h,
  );

  const allPlacements = (def) =>
    oxPlacements(ctx, def, sol.hall, new Set()).filter(
      (placement) => (placement.mask & occupied) === 0n,
    );

  let work = {
    hall: sol.hall,
    roads: new Set(),
    placements: sol.placements.map((placement) => ({ ...placement })),
  };
  let stats = sashPairStats(state, pair);
  let changed = false;

  const addPlacement = (placement, def) => {
    work.placements.push(placement);
    occupied |= placement.mask;
    stats = {
      ...stats,
      counts: { ...stats.counts },
    };
    stats.counts[def.key] = (stats.counts[def.key] || 0) + 1;
    stats.area += def.w * def.h;
    if (def.category === "residential") {
      stats.totalResidentialCount++;
      stats.colonists += Number(def.colonists || 0);
      stats.credits4h += sashCredit4h(def);
      if (def.key === pair.residentialKey) stats.residentialCount++;
    } else {
      stats.totalSupportCount++;
      stats.lifeSupport += Number(def.lifeSupport || 0);
      stats.supportArea += def.w * def.h;
      if (def.key === pair.supportKey) stats.supportCount++;
    }
    stats.ratio = stats.colonists ? stats.lifeSupport / stats.colonists : 0;
    stats.green =
      stats.colonists > 0 && stats.lifeSupport * 4 >= stats.colonists * 5;
    changed = true;
  };

  // First consume every credit-producing placement that fits inside the
  // existing Life Support headroom. Higher-credit buildings win first.
  while (true) {
    let best = null;
    for (const def of residentialDefs) {
      for (const placement of allPlacements(def)) {
        const colonists = stats.colonists + Number(def.colonists || 0);
        if (stats.lifeSupport * 4 < colonists * 5) continue;
        const candidate = { def, placement, credit: sashCredit4h(def) };
        if (
          !best ||
          candidate.credit > best.credit ||
          (candidate.credit === best.credit &&
            def.w * def.h < best.def.w * best.def.h)
        )
          best = candidate;
      }
    }
    if (!best) break;
    addPlacement(best.placement, best.def);
  }

  // When Life Support is the blocker, add the smallest useful earlier/current
  // support building together with the best residence it enables. Never add
  // Life Support by itself because the objective is credits, not spare support.
  while (true) {
    let best = null;
    for (const supportDef of supportDefs) {
      for (const supportPlacement of allPlacements(supportDef)) {
        const occupiedWithSupport = occupied | supportPlacement.mask;
        for (const residentialDef of residentialDefs) {
          const residentialPlacements = oxPlacements(
            ctx,
            residentialDef,
            sol.hall,
            new Set(),
          );
          for (const residentialPlacement of residentialPlacements) {
            if ((residentialPlacement.mask & occupiedWithSupport) !== 0n)
              continue;
            const lifeSupport =
              stats.lifeSupport + Number(supportDef.lifeSupport || 0);
            const colonists =
              stats.colonists + Number(residentialDef.colonists || 0);
            if (lifeSupport * 4 < colonists * 5) continue;

            const candidate = {
              supportDef,
              supportPlacement,
              residentialDef,
              residentialPlacement,
              credit: sashCredit4h(residentialDef),
              area:
                supportDef.w * supportDef.h +
                residentialDef.w * residentialDef.h,
            };
            if (
              !best ||
              candidate.credit > best.credit ||
              (candidate.credit === best.credit &&
                candidate.area < best.area) ||
              (candidate.credit === best.credit &&
                candidate.area === best.area &&
                Number(supportDef.lifeSupport || 0) >
                  Number(best.supportDef.lifeSupport || 0))
            )
              best = candidate;
          }
        }
      }
    }

    if (!best) break;
    addPlacement(best.supportPlacement, best.supportDef);
    addPlacement(best.residentialPlacement, best.residentialDef);

    // The support/residence pair may leave enough headroom for more residences.
    while (true) {
      let extra = null;
      for (const def of residentialDefs) {
        for (const placement of allPlacements(def)) {
          const colonists = stats.colonists + Number(def.colonists || 0);
          if (stats.lifeSupport * 4 < colonists * 5) continue;
          const candidate = { def, placement, credit: sashCredit4h(def) };
          if (
            !extra ||
            candidate.credit > extra.credit ||
            (candidate.credit === extra.credit &&
              def.w * def.h < extra.def.w * extra.def.h)
          )
            extra = candidate;
        }
      }
      if (!extra) break;
      addPlacement(extra.placement, extra.def);
    }
  }

  if (!changed)
    return {
      state,
      stats: {
        ...stats,
        unused: ctx.ownedCount - ctx.hall.w * ctx.hall.h - stats.area,
      },
      changed: false,
    };

  const improvedState = oxState(ctx, work);
  const improvedStats = {
    ...sashPairStats(improvedState, pair),
    unused:
      ctx.ownedCount -
      ctx.hall.w * ctx.hall.h -
      sashPairStats(improvedState, pair).area,
  };
  return { state: improvedState, stats: improvedStats, changed: true };
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

function sashGreedyPairForHall(
  ctx,
  hall,
  residentialDef,
  supportDef,
  residentialTarget,
  supportTarget,
  seed,
) {
  const residentialPlacements = oxPlacements(
    ctx,
    residentialDef,
    hall,
    new Set(),
  );
  const supportPlacements = oxPlacements(
    ctx,
    supportDef,
    hall,
    new Set(),
  );

  // Try several deterministic scan orders plus hashed orders. This is not the
  // proof search. Its job is to produce a valid full-footprint baseline fast,
  // so expanded SASH colonies never depend on a starting-land preset.
  for (let attempt = 0; attempt < 28; attempt++) {
    const order = attempt < 6 ? attempt : 6 + attempt;
    const attemptSeed = seed + attempt * 104729;
    const residentialOrder = oxSort(
      residentialPlacements,
      order,
      attemptSeed + 17,
    );
    const supportOrder = oxSort(
      supportPlacements,
      order,
      attemptSeed + 53,
    );

    let blocked = hall.mask;
    let residentialLeft = residentialTarget;
    let supportLeft = supportTarget;
    const placements = [];

    while (residentialLeft > 0 || supportLeft > 0) {
      const availableResidential =
        residentialLeft > 0
          ? residentialOrder.filter((p) => (p.mask & blocked) === 0n)
          : [];
      const availableSupport =
        supportLeft > 0
          ? supportOrder.filter((p) => (p.mask & blocked) === 0n)
          : [];

      if (
        (residentialLeft > 0 &&
          availableResidential.length < residentialLeft) ||
        (supportLeft > 0 && availableSupport.length < supportLeft)
      )
        break;

      let useSupport = false;
      if (supportLeft > 0 && residentialLeft <= 0) useSupport = true;
      else if (residentialLeft > 0 && supportLeft <= 0) useSupport = false;
      else {
        // Place whichever type is currently more constrained. Alternating the
        // tie breaker prevents the same large rectangles from always claiming
        // the useful corners first.
        const residentialSlack =
          availableResidential.length / Math.max(1, residentialLeft);
        const supportSlack =
          availableSupport.length / Math.max(1, supportLeft);
        useSupport =
          supportSlack < residentialSlack ||
          (supportSlack === residentialSlack && attempt % 2 === 0);
      }

      const placement = useSupport
        ? availableSupport[0]
        : availableResidential[0];
      if (!placement) break;

      placements.push(placement);
      blocked |= placement.mask;
      if (useSupport) supportLeft--;
      else residentialLeft--;
    }

    if (residentialLeft === 0 && supportLeft === 0)
      return { hall, roads: new Set(), placements };
  }

  return null;
}

function sashGreedyExpandedBaseline(
  ctx,
  pair,
  residentialDef,
  supportDef,
  hubs,
  theoreticalMax,
) {
  let best = null;
  const hallArea = ctx.hall.w * ctx.hall.h;
  const residentialArea = residentialDef.w * residentialDef.h;
  const supportArea = supportDef.w * supportDef.h;

  // Usually the top feasible count packs immediately. Looking a few counts
  // lower handles awkward edges around the 5x5 Town Hall without turning this
  // fast baseline into another exhaustive search.
  const minTarget = Math.max(0, theoreticalMax - 12);
  const hallLimit = Math.min(hubs.length, 36);

  for (
    let residentialTarget = theoreticalMax;
    residentialTarget >= minTarget;
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

    let foundAtThisCount = false;

    for (let hi = 0; hi < hallLimit; hi++) {
      const hall = oxHall(ctx, hubs[hi]);
      if (!hall) continue;

      const sol = sashGreedyPairForHall(
        ctx,
        hall,
        residentialDef,
        supportDef,
        residentialTarget,
        supportTarget,
        7919 + hi * 65537 + residentialTarget * 313,
      );
      if (!sol) continue;

      ctx.tested++;
      const baseState = oxState(ctx, sol);
      const filled = sashFillPreviousBuildings(ctx, baseState, pair);
      const state = filled.state;
      const stats = filled.stats;

      if (
        oxValid(ctx, state) &&
        sashGreenStateUsesPair(state, pair) &&
        stats.green
      ) {
        foundAtThisCount = true;
        if (!best || sashGreenBetter(stats, best.stats))
          best = { state, stats };
      }
    }

    // More selected residential buildings are never worse for the selected
    // SASH pair once we also compare total credits, so stop after the first
    // target count that yields valid layouts.
    if (foundAtThisCount) break;
  }

  return best;
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
    hub: SASH_OFFICER_PIZZA_PRESET_HUB,
    residential: SASH_OFFICER_PIZZA_PRESET_BUILDINGS,
    support: SASH_OFFICER_PIZZA_PRESET_LIFE_SUPPORT,
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
  if (best) {
    const filled = sashFillPreviousBuildings(ctx, best.state, pair);
    if (filled.stats.green && sashGreenBetter(filled.stats, best.stats)) {
      best = {
        state: filled.state,
        stats: filled.stats,
      };
    }
  }

  const current = currentColonyState();
  const currentStats = sashPairStats(current, pair);
  if (
    sashGreenStateUsesPair(current, pair) &&
    currentStats.green &&
    oxValid(ctx, current)
  ) {
    // This matters especially after buying expansions. The old SASH search
    // treated the existing layout as a comparison baseline but never tried to
    // grow it into the newly unlocked land, so a starting-land layout could be
    // reported as "not improvable" on a much larger footprint.
    const grown = sashFillPreviousBuildings(
      ctx,
      cloneState(current),
      pair,
    );
    const candidate =
      grown.stats.green &&
      sashGreenStateUsesPair(grown.state, pair) &&
      oxValid(ctx, grown.state)
        ? {
            state: grown.state,
            stats: grown.stats,
          }
        : {
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

  // Starting-layout seeds are only hints. The unlocked footprint is always
  // authoritative, so build a fresh baseline that can use every owned tile.
  const expandedBaseline = sashGreedyExpandedBaseline(
    ctx,
    pair,
    residentialDef,
    supportDef,
    hubs,
    theoreticalMax,
  );
  if (
    expandedBaseline &&
    (!best || sashGreenBetter(expandedBaseline.stats, best.stats))
  )
    best = expandedBaseline;

  if (best) {
    ctx.bestState = best.state;
    ctx.bestScore = oxScore(
      ctx,
      best.state,
      pair.residentialKey,
    );
  }

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
        const baseState = oxState(ctx, attempt.solution);
        const filled = sashFillPreviousBuildings(ctx, baseState, pair);
        const state = filled.state;
        const stats = filled.stats;

        if (
          oxValid(ctx, state) &&
          sashGreenStateUsesPair(state, pair) &&
          stats.green &&
          sashGreenBetter(stats, best?.stats)
        ) {
          best = { state, stats };
          ctx.bestState = state;
          ctx.bestScore = oxScore(
            ctx,
            state,
            pair.residentialKey,
          );
          oxProgress(ctx, "Improved");
        }

        // Do not return the first valid selected-pair count. SASH is a
        // max-credits problem, so a slightly lower count of the selected large
        // building can still win after earlier buildings fill awkward gaps.
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
      "No valid layout was found for this building combination on your unlocked land while keeping Life Support at 125% or higher.",
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
