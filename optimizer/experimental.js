/* Experimental deep-search extensions used while optimizer quality is being tuned. */
(() => {
  if (typeof optimizeColonyV2 !== 'function') return;

  const coreOptimizeColonyV2 = optimizeColonyV2;
  const TEST_DEEP_MS = 90000;

  function lateCandidatePositions(ctx, hall, def, referenceSol) {
    const currentBuildingCells = new Set();
    for (const p of referenceSol.placements) for (const id of p.ids) currentBuildingCells.add(id);
    const hallCenterR = hall.hub[0] + ctx.hall.h / 2;
    const hallCenterC = hall.hub[1] + ctx.hall.w / 2;
    const out = [];

    for (let r = 0; r <= 28 - def.h; r++) {
      for (let c = 0; c <= 28 - def.w; c++) {
        const ids = oxRect(r, c, def.h, def.w);
        const mask = oxMask(ids);
        if ((mask & ~ctx.ownedMask) !== 0n || (mask & hall.mask) !== 0n) continue;
        let roadHits = 0, buildingHits = 0;
        for (const id of ids) {
          if (referenceSol.roads.has(id)) roadHits++;
          if (currentBuildingCells.has(id)) buildingHits++;
        }
        const centerR = r + def.h / 2, centerC = c + def.w / 2;
        const hallDistance = Math.abs(centerR - hallCenterR) + Math.abs(centerC - hallCenterC);
        out.push({type:def.key,r,c,ids,mask,touch:0,repairPriority:2,roadHits,buildingHits,hallDistance});
      }
    }

    out.sort((a,b) =>
      a.buildingHits - b.buildingHits ||
      a.roadHits - b.roadHits ||
      a.hallDistance - b.hallDistance ||
      a.r - b.r || a.c - b.c
    );
    return out;
  }

  function normalizeRoadMutation(ctx, hall, roads) {
    if (!roads?.size) return null;
    let connected = oxConnected(roads, hall.set);
    if (connected.size === roads.size) return new Set(roads);
    const repaired = oxConnectPattern(ctx, hall, roads);
    if (repaired?.size) return repaired;
    return connected.size ? connected : null;
  }

  function forcedPack(ctx, hall, roads, primary, goal, seed, forced) {
    const allowed = oxAllowedResidentialDefs(ctx.era, primary.key);
    const fillers = allowed
      .filter(d => d.key !== primary.key)
      .sort((a,b) => oxCredits(b)/(b.w*b.h) - oxCredits(a)/(a.w*a.h));
    const primaryPlacements = oxPlacements(ctx, primary, hall, roads);
    const starts = 10;
    let best = null, bestScore = null;

    for (let s = 0; s < starts; s++) {
      const order = s < 6 ? s : 6 + s;
      let blocked = hall.mask | oxMask(roads) | forced.mask;
      const placed = [forced];

      for (const p of oxSort(primaryPlacements, order, seed + s * 7919)) {
        if ((p.mask & blocked) !== 0n) continue;
        placed.push(p);
        blocked |= p.mask;
      }
      for (const d of fillers) {
        for (const p of oxSort(oxPlacements(ctx, d, hall, roads), order, seed + s * 104729 + d.key.length)) {
          if ((p.mask & blocked) !== 0n) continue;
          placed.push(p);
          blocked |= p.mask;
        }
      }

      let sol = {hall, roads:new Set(roads), placements:placed};
      if (!oxAccess(ctx, sol.placements, sol.roads) || oxConnected(sol.roads, hall.set).size !== sol.roads.size) {
        sol = oxRepairRoadNetwork(ctx, sol);
      } else {
        sol = oxPrune(ctx, sol);
      }
      if (!sol) continue;

      sol = oxFillFreedGaps(ctx, sol, primary, fillers);
      const state = oxState(ctx, sol), score = oxScore(ctx, state, ctx.primaryKey);
      ctx.tested++;
      if (oxValid(ctx, state) && (!best || oxBetter(score, bestScore, goal))) {
        best = sol;
        bestScore = score;
      }
    }
    return best;
  }

  function roadShiftVariants(ctx, sol) {
    const rows = new Map(), cols = new Map();
    for (const id of sol.roads) {
      const [r,c] = optRC(id);
      rows.set(r, (rows.get(r) || 0) + 1);
      cols.set(c, (cols.get(c) || 0) + 1);
    }
    const strongRows = [...rows].filter(([,n]) => n >= 4).sort((a,b) => b[1]-a[1]).slice(0,10).map(x=>x[0]);
    const strongCols = [...cols].filter(([,n]) => n >= 4).sort((a,b) => b[1]-a[1]).slice(0,10).map(x=>x[0]);
    const variants = [];

    const mutateRow = (row, delta) => {
      const roads = new Set(sol.roads);
      for (const id of [...roads]) if (optRC(id)[0] === row) roads.delete(id);
      const nr = row + delta;
      if (nr >= 0 && nr < 28) for (let c=0;c<28;c++) {
        const id=optId(nr,c); if (ctx.owned.has(id) && !sol.hall.set.has(id)) roads.add(id);
      }
      variants.push(roads);
    };
    const mutateCol = (col, delta) => {
      const roads = new Set(sol.roads);
      for (const id of [...roads]) if (optRC(id)[1] === col) roads.delete(id);
      const nc = col + delta;
      if (nc >= 0 && nc < 28) for (let r=0;r<28;r++) {
        const id=optId(r,nc); if (ctx.owned.has(id) && !sol.hall.set.has(id)) roads.add(id);
      }
      variants.push(roads);
    };

    for (const r of strongRows) { mutateRow(r,-1); mutateRow(r,1); }
    for (const c of strongCols) { mutateCol(c,-1); mutateCol(c,1); }
    return variants;
  }

  async function lateRepack(era, goal, primaryKey, initialResult, overallStart, deadline) {
    if (goal !== 'maxCredits' || optimizerCancelRequested || performance.now() >= deadline) return initialResult;

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
    if (!primary) return initialResult;

    const accept = sol => {
      if (!sol) return false;
      const state = oxState(ctx, sol), score = oxScore(ctx, state, primaryKey);
      if (!oxValid(ctx, state) || !oxUsesOnlyAllowedResidential(state, allowedKeys) || !oxBetter(score, ctx.bestScore, goal)) return false;
      ctx.bestState = state;
      ctx.bestScore = score;
      oxProgress(ctx, 'Repacking gaps');
      return true;
    };

    let round = 0;
    while (!optimizerCancelRequested && performance.now() < deadline - 100 && round < 6) {
      round++;
      const reference = oxSolFromState(ctx, ctx.bestState);
      if (!reference) break;
      const hall = reference.hall;
      let improvedThisRound = false;

      const candidates = lateCandidatePositions(ctx, hall, primary, reference);
      for (let i=0;i<candidates.length && performance.now()<deadline-100;i++) {
        if (optimizerCancelRequested) break;
        const forced = candidates[i];
        const roads = new Set(reference.roads);
        for (const id of forced.ids) roads.delete(id);
        const network = normalizeRoadMutation(ctx, hall, roads);
        if (!network) continue;
        const sol = forcedPack(ctx, hall, network, primary, goal, oxHash((round+1)*1000003+i*8191+ctx.tested), forced);
        if (accept(sol)) improvedThisRound = true;
        if (i % 4 === 0) {
          await new Promise(resolve => setTimeout(resolve,0));
          if (performance.now() - ctx.lastProgress > 120) oxProgress(ctx, 'Repacking gaps');
        }
      }

      if (performance.now() >= deadline - 100 || optimizerCancelRequested) break;

      const refreshed = oxSolFromState(ctx, ctx.bestState) || reference;
      const variants = roadShiftVariants(ctx, refreshed);
      for (let i=0;i<variants.length && performance.now()<deadline-100;i++) {
        const network = normalizeRoadMutation(ctx, refreshed.hall, variants[i]);
        if (!network) continue;
        const sol = oxPack(ctx, refreshed.hall, network, primary, goal, 'normal', oxHash((round+7)*65537+i*104729+ctx.tested));
        if (accept(sol)) improvedThisRound = true;
        if (i % 3 === 0) await new Promise(resolve => setTimeout(resolve,0));
      }

      if (!improvedThisRound && round >= 2 && performance.now() < deadline - 100) {
        const shuffled = candidates.slice().sort((a,b) => oxHash(optId(a.r,a.c)+ctx.tested) - oxHash(optId(b.r,b.c)+ctx.tested));
        for (let i=0;i<shuffled.length && performance.now()<deadline-100;i++) {
          if (optimizerCancelRequested) break;
          const forced=shuffled[i], roads=new Set(refreshed.roads);
          for (const id of forced.ids) roads.delete(id);
          const network=normalizeRoadMutation(ctx,refreshed.hall,roads);
          if (!network) continue;
          accept(forcedPack(ctx,refreshed.hall,network,primary,goal,oxHash(Date.now()+i+ctx.tested),forced));
          if (i%4===0) await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
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
    const result = await coreOptimizeColonyV2(era, goal, primaryKey, mode);
    if (mode !== 'deep' || result.cancelled || optimizerCancelRequested) return result;
    const deadline = overallStart + TEST_DEEP_MS;
    if (performance.now() >= deadline - 100) return result;
    return lateRepack(era, goal, primaryKey, result, overallStart, deadline);
  };
})();
