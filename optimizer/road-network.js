/* Deep-search path compactor.
   Rebuilds the road network for fixed residential placements, preferring fewer
   road tiles and using owned-edge roads only when they actually help. */
(() => {
  if (typeof optimizeColonyV2 !== 'function') return;

  const previousOptimizeColonyV2 = optimizeColonyV2;
  const DEEP_TOTAL_MS = 150000;

  function buildingBlockSet(sol) {
    const blocked = new Set(sol.hall.ids);
    for (const p of sol.placements) for (const id of p.ids) blocked.add(id);
    return blocked;
  }

  function accessGroups(ctx, sol, blocked) {
    const groups = [];
    for (const p of sol.placements) {
      const def = eraBoardBuildingByKey(ctx.era, p.type);
      if (def?.requiresPath === false) continue;
      const access = new Set();
      for (const id of p.ids) {
        for (const n of optNeighborIds(id)) {
          if (ctx.owned.has(n) && !blocked.has(n)) access.add(n);
        }
      }
      if (!access.size) return null;
      groups.push(access);
    }
    return groups;
  }

  function isOwnedEdge(ctx, id) {
    return optNeighborIds(id).some(n => !ctx.owned.has(n));
  }

  function bfsFromNetwork(ctx, hall, blocked, roads) {
    const dist = new Map(), parent = new Map(), q = [];
    const add = (id, d, p) => {
      if (!ctx.owned.has(id) || blocked.has(id) || dist.has(id)) return;
      dist.set(id, d); parent.set(id, p); q.push(id);
    };

    for (const id of roads) add(id, 0, null);
    for (const id of hall.ids) {
      for (const n of optNeighborIds(id)) add(n, roads.has(n) ? 0 : 1, null);
    }

    for (let i=0; i<q.length; i++) {
      const id = q[i], next = dist.get(id) + 1;
      for (const n of optNeighborIds(id)) {
        if (!ctx.owned.has(n) || blocked.has(n) || dist.has(n)) continue;
        dist.set(n, next); parent.set(n, id); q.push(n);
      }
    }
    return {dist, parent};
  }

  function targetMetric(strategy, distance, coverage, edge, id, step) {
    if (strategy === 0) return distance * 1000 - coverage * 120;
    if (strategy === 1) return distance * 700 - coverage * 220 + edge * 24;
    if (strategy === 2) return distance * 800 - coverage * 150 + edge * 70;
    if (strategy === 3) return distance * 550 - coverage * 280 + edge * 35;
    if (strategy === 4) return distance * 900 - coverage * 180 + edge * 120;
    const jitter = oxHash(id ^ ((strategy + 1) * 104729) ^ ((step + 1) * 8191)) % 170;
    return distance * 760 - coverage * 205 + edge * 55 + jitter;
  }

  function rebuildRoadNetwork(ctx, sol, strategy) {
    const blocked = buildingBlockSet(sol);
    const groups = accessGroups(ctx, sol, blocked);
    if (!groups) return null;

    const roads = new Set();
    const served = new Array(groups.length).fill(false);
    let remaining = groups.length, step = 0;

    while (remaining > 0 && step < groups.length + 8) {
      step++;
      const {dist, parent} = bfsFromNetwork(ctx, sol.hall, blocked, roads);
      const coverage = new Map();
      for (let i=0; i<groups.length; i++) {
        if (served[i]) continue;
        for (const id of groups[i]) coverage.set(id, (coverage.get(id) || 0) + 1);
      }

      let best = null, bestMetric = Infinity;
      for (const [id, cover] of coverage) {
        const d = dist.get(id);
        if (d === undefined) continue;
        const edge = isOwnedEdge(ctx, id) ? 1 : 0;
        const metric = targetMetric(strategy, d, cover, edge, id, step);
        if (metric < bestMetric || (metric === bestMetric && (best == null || id < best))) {
          bestMetric = metric; best = id;
        }
      }
      if (best == null) return null;

      let cur = best, guard = 0;
      while (cur != null && guard++ < 784) {
        roads.add(cur);
        cur = parent.get(cur) ?? null;
      }

      let newlyServed = 0;
      for (let i=0; i<groups.length; i++) {
        if (served[i]) continue;
        let hit = false;
        for (const id of groups[i]) if (roads.has(id)) { hit = true; break; }
        if (hit) { served[i] = true; remaining--; newlyServed++; }
      }
      if (!newlyServed) return null;
    }

    if (remaining) return null;
    const work = {hall:sol.hall, roads, placements:sol.placements.map(p => ({...p}))};
    if (!oxAccess(ctx, work.placements, work.roads)) return null;
    if (work.roads.size && oxConnected(work.roads, work.hall.set).size !== work.roads.size) return null;
    return oxPrune(ctx, work);
  }

  async function compactPaths(era, goal, primaryKey, initialResult, overallStart, deadline) {
    if (goal !== 'maxCredits' || optimizerCancelRequested || performance.now() >= deadline - 100) return initialResult;

    const ctx = oxCtx(era);
    ctx.goal = goal;
    ctx.primaryKey = primaryKey;
    ctx.started = overallStart;
    ctx.deadline = deadline;
    ctx.tested = initialResult.tested || 0;
    ctx.bestState = cloneState(initialResult.state);
    ctx.bestScore = oxScore(ctx, ctx.bestState, primaryKey);

    const primary = eraBoardBuildingByKey(era, primaryKey);
    const allowedKeys = oxAllowedResidentialKeys(era, primaryKey);
    const fillers = oxAllowedResidentialDefs(era, primaryKey)
      .filter(d => d.key !== primaryKey)
      .sort((a,b) => oxCredits(b)/(b.w*b.h) - oxCredits(a)/(a.w*a.h));
    if (!primary) return initialResult;

    let strategy = 0;
    while (!optimizerCancelRequested && performance.now() < deadline - 100 && strategy < 18) {
      const reference = oxSolFromState(ctx, ctx.bestState);
      if (!reference) break;

      let compacted = rebuildRoadNetwork(ctx, reference, strategy);
      ctx.tested++;
      if (compacted) {
        compacted = oxFillFreedGaps(ctx, compacted, primary, fillers);
        const state = oxState(ctx, compacted), score = oxScore(ctx, state, primaryKey);
        if (oxValid(ctx, state) && oxUsesOnlyAllowedResidential(state, allowedKeys) && oxBetter(score, ctx.bestScore, goal)) {
          ctx.bestState = state;
          ctx.bestScore = score;
        }
      }

      strategy++;
      oxProgress(ctx, 'Compressing paths');
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return {
      state: ctx.bestState,
      score: ctx.bestScore,
      cancelled: optimizerCancelRequested,
      tested: ctx.tested
    };
  }

  optimizeColonyV2 = async function(era, goal, primaryKey, mode) {
    const overallStart = performance.now();
    const result = await previousOptimizeColonyV2(era, goal, primaryKey, mode);
    if (mode !== 'deep' || result.cancelled || optimizerCancelRequested) return result;
    const deadline = overallStart + DEEP_TOTAL_MS;
    if (performance.now() >= deadline - 100) return result;
    return compactPaths(era, goal, primaryKey, result, overallStart, deadline);
  };

  const previousSyncLabels = typeof optimizerSyncSearchLabels === 'function' ? optimizerSyncSearchLabels : null;
  if (previousSyncLabels) {
    optimizerSyncSearchLabels = function() {
      previousSyncLabels();
      const select = document.getElementById('optimizerSearch');
      if (!select) return;
      for (const option of select.options) if (option.value === 'deep') option.textContent = 'Deep · ~150s';
    };
  }
})();
