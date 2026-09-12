/* Local neighborhood rebuild pass for Deep search.
   Runs after the main optimizer and repacker, then phase-shifts roads around
   waste pockets and repacks the full colony against those local road changes. */
(() => {
  if (typeof optimizeColonyV2 !== "function") return;

  const previousOptimizeColonyV2 = optimizeColonyV2;
  const DEEP_TOTAL_MS = 120000;

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function neighborhoodCenters(ctx, state) {
    const candidates = [];
    for (let r = 0; r < 28; r++)
      for (let c = 0; c < 28; c++) {
        if (!ctx.owned.has(optId(r, c))) continue;
        const cell = state?.grid?.[r]?.[c];
        if (cell !== "empty" && cell !== "road") continue;
        let empty = 0,
          roads = 0;
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++) {
            if (Math.abs(dr) + Math.abs(dc) > 3) continue;
            const rr = r + dr,
              cc = c + dc;
            if (rr < 0 || rr >= 28 || cc < 0 || cc >= 28) continue;
            const v = state?.grid?.[rr]?.[cc];
            if (v === "empty") empty++;
            else if (v === "road") roads++;
          }
        const score = empty * 8 + roads * 2 + (cell === "empty" ? 10 : 0);
        if (score > 0) candidates.push({ r, c, score });
      }
    candidates.sort((a, b) => b.score - a.score || a.r - b.r || a.c - b.c);
    const out = [];
    for (const p of candidates) {
      if (out.some((q) => Math.abs(q.r - p.r) + Math.abs(q.c - p.c) < 5))
        continue;
      out.push(p);
      if (out.length >= 18) break;
    }
    return out;
  }

  function addRoadIfValid(ctx, hall, roads, r, c) {
    if (r < 0 || r >= 28 || c < 0 || c >= 28) return;
    const id = optId(r, c);
    if (ctx.owned.has(id) && !hall.set.has(id)) roads.add(id);
  }

  function normalizeRoads(ctx, hall, roads) {
    if (!roads.size) return null;
    const connected = oxConnected(roads, hall.set);
    if (connected.size === roads.size) return roads;
    const repaired = oxConnectPattern(ctx, hall, roads);
    if (repaired?.size) return repaired;
    return connected.size ? connected : null;
  }

  function windowRoadVariant(ctx, sol, primary, center, size, kind, phase) {
    const half = Math.floor(size / 2),
      r0 = Math.max(0, center.r - half),
      r1 = Math.min(27, center.r + half),
      c0 = Math.max(0, center.c - half),
      c1 = Math.min(27, center.c + half);
    const roads = new Set(sol.roads);
    for (const id of [...roads]) {
      const [r, c] = optRC(id);
      if (r >= r0 && r <= r1 && c >= c0 && c <= c1) roads.delete(id);
    }

    const rs = primary.h * 2 + 1,
      cs = primary.w * 2 + 1;
    const rowPhase = mod(center.r + phase, rs),
      colPhase = mod(center.c + phase, cs);
    const addRows = () => {
      for (let r = r0; r <= r1; r++)
        if (mod(r - rowPhase, rs) === 0)
          for (let c = c0; c <= c1; c++)
            addRoadIfValid(ctx, sol.hall, roads, r, c);
    };
    const addCols = () => {
      for (let c = c0; c <= c1; c++)
        if (mod(c - colPhase, cs) === 0)
          for (let r = r0; r <= r1; r++)
            addRoadIfValid(ctx, sol.hall, roads, r, c);
    };
    const trunkCols = [c0, c1, Math.max(c0, Math.min(c1, center.c))];
    const trunkRows = [r0, r1, Math.max(r0, Math.min(r1, center.r))];

    if (kind === "h") {
      addRows();
      const tc = trunkCols[phase % trunkCols.length];
      for (let r = r0; r <= r1; r++)
        addRoadIfValid(ctx, sol.hall, roads, r, tc);
    } else if (kind === "v") {
      addCols();
      const tr = trunkRows[phase % trunkRows.length];
      for (let c = c0; c <= c1; c++)
        addRoadIfValid(ctx, sol.hall, roads, tr, c);
    } else if (kind === "grid") {
      addRows();
      addCols();
    } else if (kind === "frame") {
      for (let c = c0; c <= c1; c++) {
        addRoadIfValid(ctx, sol.hall, roads, r0, c);
        addRoadIfValid(ctx, sol.hall, roads, r1, c);
      }
      for (let r = r0; r <= r1; r++) {
        addRoadIfValid(ctx, sol.hall, roads, r, c0);
        addRoadIfValid(ctx, sol.hall, roads, r, c1);
      }
    }
    return normalizeRoads(ctx, sol.hall, roads);
  }

  async function rebuildNeighborhoods(
    era,
    goal,
    primaryKey,
    initialResult,
    overallStart,
    deadline,
  ) {
    if (
      goal !== "maxCredits" ||
      optimizerCancelRequested ||
      performance.now() >= deadline
    )
      return initialResult;
    const ctx = oxCtx(era);
    ctx.goal = goal;
    ctx.primaryKey = primaryKey;
    ctx.started = overallStart;
    ctx.deadline = deadline;
    ctx.tested = initialResult.tested || 0;
    ctx.bestState = cloneState(initialResult.state);
    ctx.bestScore = oxScore(ctx, ctx.bestState, primaryKey);
    const primary = eraBoardBuildingByKey(era, primaryKey),
      allowedKeys = oxAllowedResidentialKeys(era, primaryKey);
    if (!primary) return initialResult;

    const accept = (sol) => {
      if (!sol) return false;
      const state = oxState(ctx, sol),
        score = oxScore(ctx, state, primaryKey);
      if (
        !oxValid(ctx, state) ||
        !oxUsesOnlyAllowedResidential(state, allowedKeys) ||
        !oxBetter(score, ctx.bestScore, goal)
      )
        return false;
      ctx.bestState = state;
      ctx.bestScore = score;
      oxProgress(ctx, "Rebuilding tight spots");
      return true;
    };

    let round = 0;
    while (
      !optimizerCancelRequested &&
      performance.now() < deadline - 100 &&
      round < 4
    ) {
      round++;
      const reference = oxSolFromState(ctx, ctx.bestState);
      if (!reference) break;
      const centers = neighborhoodCenters(ctx, ctx.bestState);
      if (!centers.length) break;
      let improved = false;
      const sizes = primary.w <= 2 && primary.h <= 2 ? [7, 9, 11] : [9, 11];
      const kinds = ["h", "v", "grid", "frame"];
      let job = 0;
      for (const center of centers) {
        for (const size of sizes) {
          for (const kind of kinds) {
            const phaseLimit = kind === "grid" ? 2 : 3;
            for (let phase = 0; phase < phaseLimit; phase++) {
              if (
                optimizerCancelRequested ||
                performance.now() >= deadline - 100
              )
                break;
              const network = windowRoadVariant(
                ctx,
                reference,
                primary,
                center,
                size,
                kind,
                phase,
              );
              if (network) {
                const sol = oxPack(
                  ctx,
                  reference.hall,
                  network,
                  primary,
                  goal,
                  "normal",
                  oxHash((round + 1) * 1000003 + job * 8191 + ctx.tested),
                );
                if (accept(sol)) improved = true;
              }
              job++;
              await new Promise((resolve) => setTimeout(resolve, 0));
              if (performance.now() - ctx.lastProgress > 120)
                oxProgress(ctx, "Rebuilding tight spots");
            }
            if (optimizerCancelRequested || performance.now() >= deadline - 100)
              break;
          }
          if (optimizerCancelRequested || performance.now() >= deadline - 100)
            break;
        }
        if (optimizerCancelRequested || performance.now() >= deadline - 100)
          break;
      }
      if (!improved && round >= 2) break;
    }

    return {
      state: ctx.bestState,
      score: ctx.bestScore,
      cancelled: optimizerCancelRequested,
      tested: ctx.tested,
    };
  }

  optimizeColonyV2 = async function (era, goal, primaryKey, mode) {
    const overallStart = performance.now();
    const result = await previousOptimizeColonyV2(era, goal, primaryKey, mode);
    if (mode !== "deep" || result.cancelled || optimizerCancelRequested)
      return result;
    const deadline = overallStart + DEEP_TOTAL_MS;
    if (performance.now() >= deadline - 100) return result;
    return rebuildNeighborhoods(
      era,
      goal,
      primaryKey,
      result,
      overallStart,
      deadline,
    );
  };

  const previousSyncLabels =
    typeof optimizerSyncSearchLabels === "function"
      ? optimizerSyncSearchLabels
      : null;
  if (previousSyncLabels) {
    optimizerSyncSearchLabels = function () {
      previousSyncLabels();
      const select = document.getElementById("optimizerSearch");
      if (!select) return;
      for (const option of select.options)
        if (option.value === "deep") option.textContent = "Deep · ~120s";
    };
  }
})();
