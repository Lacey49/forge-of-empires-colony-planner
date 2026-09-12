/* Prefer the selected residential building over earlier filler buildings when
   the selected building can reclaim filler + empty space for more credits. */
(() => {
  if (
    typeof optimizeColonyV2 !== "function" ||
    typeof oxFillFreedGaps !== "function"
  )
    return;

  const previousOptimizeColonyV2 = optimizeColonyV2;
  const previousFillFreedGaps = oxFillFreedGaps;

  function clonePlacement(p) {
    return { ...p, ids: [...p.ids] };
  }

  function placementTouchesRoad(ctx, def, ids, roads) {
    if (!ctx.rules.paths || def?.requiresPath === false) return true;
    return ids.some((id) => optNeighborIds(id).some((n) => roads.has(n)));
  }

  function promoteOnce(ctx, sol, primary, fillers) {
    const fillerKeys = new Set(fillers.map((d) => d.key));
    const primaryCredits = oxCredits(primary);
    if (!primaryCredits) return { sol, changed: false };

    const placements = sol.placements.map(clonePlacement);
    const cellOwner = new Map();
    for (let i = 0; i < placements.length; i++) {
      for (const id of placements[i].ids) cellOwner.set(id, i);
    }

    let best = null;
    for (let r = 0; r <= 28 - primary.h; r++) {
      for (let c = 0; c <= 28 - primary.w; c++) {
        const ids = oxRect(r, c, primary.h, primary.w);
        const mask = oxMask(ids);
        if ((mask & ~ctx.ownedMask) !== 0n || (mask & sol.hall.mask) !== 0n)
          continue;
        if (ids.some((id) => sol.roads.has(id))) continue;
        if (!placementTouchesRoad(ctx, primary, ids, sol.roads)) continue;

        const overlapIndexes = new Set();
        let blocked = false;
        for (const id of ids) {
          const index = cellOwner.get(id);
          if (index == null) continue;
          const p = placements[index];
          if (p.type === primary.key || !fillerKeys.has(p.type)) {
            blocked = true;
            break;
          }
          overlapIndexes.add(index);
        }
        if (blocked) continue;

        let removedCredits = 0;
        for (const index of overlapIndexes) {
          const def = eraBoardBuildingByKey(ctx.era, placements[index].type);
          removedCredits += oxCredits(def);
        }
        const gain = primaryCredits - removedCredits;
        if (gain <= 0) continue;

        const candidate = {
          r,
          c,
          ids,
          mask,
          overlapIndexes: [...overlapIndexes],
          gain,
          removedCount: overlapIndexes.size,
        };
        if (
          !best ||
          candidate.gain > best.gain ||
          (candidate.gain === best.gain &&
            candidate.removedCount < best.removedCount) ||
          (candidate.gain === best.gain &&
            candidate.removedCount === best.removedCount &&
            (candidate.r < best.r ||
              (candidate.r === best.r && candidate.c < best.c)))
        )
          best = candidate;
      }
    }

    if (!best) return { sol, changed: false };

    const remove = new Set(best.overlapIndexes);
    const nextPlacements = placements.filter((_, i) => !remove.has(i));
    nextPlacements.push({
      type: primary.key,
      r: best.r,
      c: best.c,
      ids: best.ids,
      mask: best.mask,
      touch: 0,
    });

    return {
      sol: {
        hall: sol.hall,
        roads: new Set(sol.roads),
        placements: nextPlacements,
      },
      changed: true,
    };
  }

  function promoteFillers(ctx, sol, primary, fillers) {
    if (!sol || !primary || !fillers?.length) return sol;
    let work = {
      hall: sol.hall,
      roads: new Set(sol.roads),
      placements: sol.placements.map(clonePlacement),
    };
    let changedAny = false;

    // Re-evaluate after every swap because removing one filler can open a new
    // primary placement next to it. Cap the pass well above practical colony
    // sizes so it can finish without risking a runaway loop.
    for (let round = 0; round < 160; round++) {
      const step = promoteOnce(ctx, work, primary, fillers);
      if (!step.changed) break;
      work = step.sol;
      changedAny = true;
    }

    if (!changedAny) return sol;
    ctx.tested++;
    return oxPrune(ctx, work);
  }

  // Improve normal candidate packing before it is scored by later search stages.
  oxFillFreedGaps = function (ctx, sol, primary, fillers) {
    let work = previousFillFreedGaps(ctx, sol, primary, fillers);
    for (let round = 0; round < 4; round++) {
      const promoted = promoteFillers(ctx, work, primary, fillers);
      if (promoted === work) break;
      work = previousFillFreedGaps(ctx, promoted, primary, fillers);
    }
    return work;
  };

  // Some deep-search helpers use their own private gap filler. Run the same
  // promotion once more on the final result so those candidates cannot leave
  // an obvious filler row blocking a better primary building.
  optimizeColonyV2 = async function (era, goal, primaryKey, mode) {
    const result = await previousOptimizeColonyV2(era, goal, primaryKey, mode);
    if (!result || result.cancelled || goal !== "maxCredits") return result;

    const ctx = oxCtx(era);
    ctx.goal = goal;
    ctx.primaryKey = primaryKey;
    ctx.tested = result.tested || 0;
    const primary = eraBoardBuildingByKey(era, primaryKey);
    const fillers = oxAllowedResidentialDefs(era, primaryKey).filter(
      (d) => d.key !== primaryKey,
    );
    if (!primary || !fillers.length) return result;

    const sol = oxSolFromState(ctx, result.state);
    if (!sol) return result;
    let promoted = promoteFillers(ctx, sol, primary, fillers);
    if (promoted === sol) return result;
    promoted = previousFillFreedGaps(ctx, promoted, primary, fillers);

    const state = oxState(ctx, promoted);
    const oldScore = oxScore(ctx, result.state, primaryKey);
    const newScore = oxScore(ctx, state, primaryKey);
    const allowedKeys = oxAllowedResidentialKeys(era, primaryKey);
    if (
      !oxValid(ctx, state) ||
      !oxUsesOnlyAllowedResidential(state, allowedKeys) ||
      newScore.credits8h <= oldScore.credits8h
    )
      return result;

    return {
      ...result,
      state,
      score: newScore,
      tested: ctx.tested,
    };
  };
})();
