/* Performance helpers for the colony optimizer. Keeps the same pruning rules,
   but avoids rescanning every building's road access for every road tile. */
(() => {
  if (typeof oxPrune !== "function") return;

  oxPrune = function (ctx, sol) {
    if (!ctx.rules.paths) return sol;

    const roads = new Set(sol.roads);
    const accessCounts = [];
    const roadUsers = new Map();

    for (let i = 0; i < sol.placements.length; i++) {
      const p = sol.placements[i];
      const d = eraBoardBuildingByKey(ctx.era, p.type);
      if (d?.requiresPath === false) {
        accessCounts[i] = Infinity;
        continue;
      }

      const adjacent = new Set();
      for (const cell of p.ids) {
        for (const n of optNeighborIds(cell)) if (roads.has(n)) adjacent.add(n);
      }
      accessCounts[i] = adjacent.size;
      for (const id of adjacent) {
        if (!roadUsers.has(id)) roadUsers.set(id, []);
        roadUsers.get(id).push(i);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...roads]) {
        const users = roadUsers.get(id) || [];
        let neededForAccess = false;
        for (const index of users) {
          if (accessCounts[index] <= 1) {
            neededForAccess = true;
            break;
          }
        }
        if (neededForAccess) continue;

        const test = new Set(roads);
        test.delete(id);

        if (test.size) {
          const neighbors = optNeighborIds(id);
          let roadDegree = 0;
          let touchesHall = false;
          for (const n of neighbors) {
            if (roads.has(n)) roadDegree++;
            if (sol.hall.set.has(n)) touchesHall = true;
          }

          // Removing a non-Hall leaf cannot disconnect the remaining road graph.
          // Everything else keeps the exact connectivity check used before.
          const connectivityIsObviouslySafe =
            roadDegree === 0 || (roadDegree === 1 && !touchesHall);
          if (
            !connectivityIsObviouslySafe &&
            oxConnected(test, sol.hall.set).size !== test.size
          )
            continue;
        }

        roads.delete(id);
        for (const index of users) accessCounts[index]--;
        changed = true;
      }
    }

    return { ...sol, roads };
  };
})();
