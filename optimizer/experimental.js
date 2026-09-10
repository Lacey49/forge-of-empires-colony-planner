/* Experimental deep-search extensions used while optimizer quality is being tuned. */
(() => {
  if (typeof optimizeColonyV2 !== 'function') return;

  const coreOptimizeColonyV2 = optimizeColonyV2;
  const TEST_DEEP_MS = 90000;

  async function uiYield(ctx, label='Repacking gaps', force=false) {
    const now = performance.now();
    if (optimizerCancelRequested || now >= ctx.deadline) return false;
    if (force || now - ctx.lastYield > 20) {
      if (force || now - ctx.lastProgress > 120) oxProgress(ctx, label);
      await new Promise(resolve => setTimeout(resolve, 0));
      ctx.lastYield = performance.now();
    }
    return !optimizerCancelRequested && performance.now() < ctx.deadline;
  }

  /* Same packing rules as the core search, but avoid recomputing every filler
     placement list for every start. This makes the 60s broad-search phase less
     bursty without changing what layouts it is allowed to build. */
  oxPack = function(ctx, hall, roads, primary, goal, mode, seed) {
    const allowed = oxAllowedResidentialDefs(ctx.era, primary.key);
    const fillers = allowed
      .filter(d => d.key !== primary.key)
      .sort((a,b) => oxCredits(b)/(b.w*b.h) - oxCredits(a)/(a.w*a.h));
    const base = hall.mask | oxMask(roads);
    const primaryPlacements = oxPlacements(ctx, primary, hall, roads);
    const fillerPlacements = fillers.map(d => ({d, placements:oxPlacements(ctx,d,hall,roads)}));
    const starts = mode === 'fast' ? 6 : mode === 'deep' ? 22 : 10;
    let best = null, bestScore = null;

    for (let s=0; s<starts; s++) {
      const order = s < 6 ? s : 6+s;
      let blocked = base;
      const placed = [];
      for (const p of oxSort(primaryPlacements, order, seed+s*7919)) {
        if ((p.mask & blocked) !== 0n) continue;
        placed.push(p);
        blocked |= p.mask;
      }
      for (const item of fillerPlacements) {
        for (const p of oxSort(item.placements, order, seed+s*104729+item.d.key.length)) {
          if ((p.mask & blocked) !== 0n) continue;
          placed.push(p);
          blocked |= p.mask;
        }
      }
      const sol = {hall,roads:new Set(roads),placements:placed};
      const state = oxState(ctx,sol), score = oxScore(ctx,state,ctx.primaryKey);
      ctx.tested++;
      if (!best || oxBetter(score,bestScore,goal)) {
        best = sol;
        bestScore = score;
      }
    }
    return best ? oxFillFreedGaps(ctx,best,primary,fillers) : null;
  };

  function lateCandidatePositions(ctx, hall, def, referenceSol) {
    const currentBuildingCells = new Set();
    for (const p of referenceSol.placements) for (const id of p.ids) currentBuildingCells.add(id);
    const hallCenterR = hall.hub[0] + ctx.hall.h / 2;
    const hallCenterC = hall.hub[1] + ctx.hall.w / 2;
    const out = [];

    for (let r=0; r<=28-def.h; r++) {
      for (let c=0; c<=28-def.w; c++) {
        const ids = oxRect(r,c,def.h,def.w), mask = oxMask(ids);
        if ((mask & ~ctx.ownedMask) !== 0n || (mask & hall.mask) !== 0n) continue;
        let roadHits=0, buildingHits=0;
        for (const id of ids) {
          if (referenceSol.roads.has(id)) roadHits++;
          if (currentBuildingCells.has(id)) buildingHits++;
        }
        const centerR=r+def.h/2, centerC=c+def.w/2;
        const hallDistance=Math.abs(centerR-hallCenterR)+Math.abs(centerC-hallCenterC);
        out.push({type:def.key,r,c,ids,mask,touch:0,repairPriority:2,roadHits,buildingHits,hallDistance});
      }
    }
    out.sort((a,b) =>
      a.buildingHits-b.buildingHits || a.roadHits-b.roadHits ||
      a.hallDistance-b.hallDistance || a.r-b.r || a.c-b.c
    );
    return out;
  }

  function normalizeRoadMutation(ctx, hall, roads) {
    if (!roads?.size) return null;
    let connected = oxConnected(roads,hall.set);
    if (connected.size === roads.size) return new Set(roads);
    const repaired = oxConnectPattern(ctx,hall,roads);
    if (repaired?.size) return repaired;
    return connected.size ? connected : null;
  }

  async function pruneResponsive(ctx, sol, label='Repacking gaps') {
    if (!ctx.rules.paths) return sol;
    const roads = new Set(sol.roads);
    let changed = true;
    while (changed && !optimizerCancelRequested && performance.now() < ctx.deadline) {
      changed = false;
      for (const id of [...roads]) {
        if (!(await uiYield(ctx,label))) return {...sol,roads};
        const test = new Set(roads);
        test.delete(id);
        if (!oxAccess(ctx,sol.placements,test)) continue;
        if (test.size && oxConnected(test,sol.hall.set).size !== test.size) continue;
        roads.delete(id);
        changed = true;
      }
    }
    return {...sol,roads};
  }

  async function fillFreedGapsResponsive(ctx, sol, primary, fillers, label='Repacking gaps') {
    let work = await pruneResponsive(ctx,sol,label);
    for (let round=0; round<3 && !optimizerCancelRequested && performance.now()<ctx.deadline; round++) {
      let blocked = oxPlacementMask(work), added=0, checked=0;
      for (const d of [primary,...fillers]) {
        const placements = oxPlacements(ctx,d,work.hall,work.roads);
        for (const p of placements) {
          if ((p.mask & blocked) === 0n) {
            work.placements.push(p);
            blocked |= p.mask;
            added++;
          }
          if ((++checked & 31) === 0 && !(await uiYield(ctx,label))) return work;
        }
      }
      if (!added) break;
      ctx.tested++;
      work = await pruneResponsive(ctx,work,label);
    }
    return work;
  }

  async function repairRoadNetworkResponsive(ctx, sol, label='Repacking gaps') {
    if (!ctx.rules.paths) return sol;
    const blocked = oxBuildingCells(sol);
    const roads = new Set([...sol.roads].filter(id => ctx.owned.has(id) && !blocked.has(id)));
    const ordered = [...sol.placements].sort((a,b) => (b.repairPriority||0)-(a.repairPriority||0));

    for (const p of ordered) {
      if (!(await uiYield(ctx,label))) return null;
      const d=eraBoardBuildingByKey(ctx.era,p.type);
      if (d?.requiresPath === false) continue;
      const connected=oxConnected(roads,sol.hall.set);
      if (p.ids.some(id => optNeighborIds(id).some(n => connected.has(n)))) continue;
      const targets=oxRoadNeighborTargets(ctx,p.ids,blocked);
      const path=oxShortestRoadPath(ctx,sol.hall,roads,blocked,targets);
      if (!path) return null;
      for (const id of path) roads.add(id);
    }

    const connected=oxConnected(roads,sol.hall.set);
    const work={hall:sol.hall,roads:new Set(connected),placements:sol.placements.map(p=>({...p,repairPriority:0}))};
    if (!oxAccess(ctx,work.placements,work.roads)) return null;
    return pruneResponsive(ctx,work,label);
  }

  async function packResponsive(ctx, hall, roads, primary, goal, seed, forced=null, starts=8) {
    const allowed=oxAllowedResidentialDefs(ctx.era,primary.key);
    const fillers=allowed
      .filter(d=>d.key!==primary.key)
      .sort((a,b)=>oxCredits(b)/(b.w*b.h)-oxCredits(a)/(a.w*a.h));
    const primaryPlacements=oxPlacements(ctx,primary,hall,roads);
    const fillerPlacements=fillers.map(d=>({d,placements:oxPlacements(ctx,d,hall,roads)}));
    let best=null,bestScore=null;

    for (let s=0; s<starts && !optimizerCancelRequested && performance.now()<ctx.deadline; s++) {
      if (!(await uiYield(ctx,'Repacking gaps',true))) break;
      const order=s<6?s:6+s;
      let blocked=hall.mask|oxMask(roads)|(forced?.mask||0n);
      const placed=forced?[forced]:[];

      for (const p of oxSort(primaryPlacements,order,seed+s*7919)) {
        if ((p.mask&blocked)!==0n) continue;
        placed.push(p); blocked|=p.mask;
      }
      for (const item of fillerPlacements) {
        for (const p of oxSort(item.placements,order,seed+s*104729+item.d.key.length)) {
          if ((p.mask&blocked)!==0n) continue;
          placed.push(p); blocked|=p.mask;
        }
      }

      let sol={hall,roads:new Set(roads),placements:placed};
      if (!oxAccess(ctx,sol.placements,sol.roads) || oxConnected(sol.roads,hall.set).size!==sol.roads.size) {
        sol=await repairRoadNetworkResponsive(ctx,sol);
      }
      if (!sol) continue;

      const state=oxState(ctx,sol),score=oxScore(ctx,state,ctx.primaryKey);
      ctx.tested++;
      if (oxValid(ctx,state) && (!best || oxBetter(score,bestScore,goal))) {
        best=sol; bestScore=score;
      }
    }

    if (!best) return null;
    return fillFreedGapsResponsive(ctx,best,primary,fillers);
  }

  function roadShiftVariants(ctx, sol) {
    const rows=new Map(),cols=new Map();
    for (const id of sol.roads) {
      const [r,c]=optRC(id);
      rows.set(r,(rows.get(r)||0)+1);
      cols.set(c,(cols.get(c)||0)+1);
    }
    const strongRows=[...rows].filter(([,n])=>n>=4).sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);
    const strongCols=[...cols].filter(([,n])=>n>=4).sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);
    const variants=[];

    const mutateRow=(row,delta)=>{
      const roads=new Set(sol.roads);
      for (const id of [...roads]) if (optRC(id)[0]===row) roads.delete(id);
      const nr=row+delta;
      if (nr>=0&&nr<28) for (let c=0;c<28;c++) {
        const id=optId(nr,c); if (ctx.owned.has(id)&&!sol.hall.set.has(id)) roads.add(id);
      }
      variants.push(roads);
    };
    const mutateCol=(col,delta)=>{
      const roads=new Set(sol.roads);
      for (const id of [...roads]) if (optRC(id)[1]===col) roads.delete(id);
      const nc=col+delta;
      if (nc>=0&&nc<28) for (let r=0;r<28;r++) {
        const id=optId(r,nc); if (ctx.owned.has(id)&&!sol.hall.set.has(id)) roads.add(id);
      }
      variants.push(roads);
    };
    for (const r of strongRows) {mutateRow(r,-1);mutateRow(r,1)}
    for (const c of strongCols) {mutateCol(c,-1);mutateCol(c,1)}
    return variants;
  }

  async function lateRepack(era, goal, primaryKey, initialResult, overallStart, deadline) {
    if (goal!=='maxCredits'||optimizerCancelRequested||performance.now()>=deadline) return initialResult;

    const ctx=oxCtx(era);
    ctx.goal=goal;ctx.primaryKey=primaryKey;ctx.started=overallStart;ctx.deadline=deadline;
    ctx.lastYield=performance.now();ctx.lastProgress=performance.now();
    ctx.tested=initialResult.tested||0;ctx.bestState=cloneState(initialResult.state);
    ctx.bestScore=oxScore(ctx,ctx.bestState,primaryKey);

    const primary=eraBoardBuildingByKey(era,primaryKey);
    const allowedKeys=oxAllowedResidentialKeys(era,primaryKey);
    if (!primary) return initialResult;

    const accept=sol=>{
      if (!sol) return false;
      const state=oxState(ctx,sol),score=oxScore(ctx,state,primaryKey);
      if (!oxValid(ctx,state)||!oxUsesOnlyAllowedResidential(state,allowedKeys)||!oxBetter(score,ctx.bestScore,goal)) return false;
      ctx.bestState=state;ctx.bestScore=score;oxProgress(ctx,'Repacking gaps');
      return true;
    };

    let round=0;
    while (!optimizerCancelRequested&&performance.now()<deadline-100&&round<8) {
      round++;
      const reference=oxSolFromState(ctx,ctx.bestState);
      if (!reference) break;
      let improvedThisRound=false;
      const candidates=lateCandidatePositions(ctx,reference.hall,primary,reference);

      for (let i=0;i<candidates.length&&performance.now()<deadline-100;i++) {
        if (!(await uiYield(ctx,'Repacking gaps'))) break;
        const forced=candidates[i],roads=new Set(reference.roads);
        for (const id of forced.ids) roads.delete(id);
        const network=normalizeRoadMutation(ctx,reference.hall,roads);
        if (!network) continue;
        const sol=await packResponsive(ctx,reference.hall,network,primary,goal,oxHash((round+1)*1000003+i*8191+ctx.tested),forced,8);
        if (accept(sol)) improvedThisRound=true;
      }

      if (performance.now()>=deadline-100||optimizerCancelRequested) break;
      const refreshed=oxSolFromState(ctx,ctx.bestState)||reference;
      const variants=roadShiftVariants(ctx,refreshed);
      for (let i=0;i<variants.length&&performance.now()<deadline-100;i++) {
        if (!(await uiYield(ctx,'Repacking gaps'))) break;
        const network=normalizeRoadMutation(ctx,refreshed.hall,variants[i]);
        if (!network) continue;
        const sol=await packResponsive(ctx,refreshed.hall,network,primary,goal,oxHash((round+7)*65537+i*104729+ctx.tested),null,8);
        if (accept(sol)) improvedThisRound=true;
      }

      if (!improvedThisRound&&performance.now()<deadline-100) {
        const shuffled=candidates.slice().sort((a,b)=>oxHash(optId(a.r,a.c)+ctx.tested)-oxHash(optId(b.r,b.c)+ctx.tested));
        for (let i=0;i<shuffled.length&&performance.now()<deadline-100;i++) {
          if (!(await uiYield(ctx,'Repacking gaps'))) break;
          const forced=shuffled[i],roads=new Set(refreshed.roads);
          for (const id of forced.ids) roads.delete(id);
          const network=normalizeRoadMutation(ctx,refreshed.hall,roads);
          if (!network) continue;
          const sol=await packResponsive(ctx,refreshed.hall,network,primary,goal,oxHash((round+19)*99991+i+ctx.tested),forced,6);
          if (accept(sol)) improvedThisRound=true;
        }
      }
    }

    await uiYield(ctx,'Repacking gaps',true);
    return {state:ctx.bestState,score:ctx.bestScore,cancelled:optimizerCancelRequested,tested:ctx.tested};
  }

  optimizeColonyV2=async function(era,goal,primaryKey,mode) {
    const overallStart=performance.now();
    const result=await coreOptimizeColonyV2(era,goal,primaryKey,mode);
    if (mode!=='deep'||result.cancelled||optimizerCancelRequested) return result;
    const deadline=overallStart+TEST_DEEP_MS;
    if (performance.now()>=deadline-100) return result;
    return lateRepack(era,goal,primaryKey,result,overallStart,deadline);
  };
})();