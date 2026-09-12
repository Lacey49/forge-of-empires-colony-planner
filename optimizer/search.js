/* Colony Optimizer — heuristic colony layout search. */
const OPT_RULES = {
  SAM: { paths: true },
  SAAB: { paths: true },
  SAV: { paths: true },
  SAJM: { paths: true },
  SAT: { paths: false },
  SASH: { paths: false },
};
const OPT_BUDGET = { fast: 600, normal: 3000, deep: 90000 };
let optimizerRunning = false,
  optimizerCancelRequested = false,
  optimizerPendingResult = null;

function oxIdBit(id) {
  return 1n << BigInt(id);
}
function oxMask(ids) {
  let m = 0n;
  for (const id of ids) m |= oxIdBit(id);
  return m;
}
function oxRect(r, c, h, w) {
  const a = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) a.push(optId(r + y, c + x));
  return a;
}
function oxKey(values) {
  return [...(values || [])].map(String).sort().join("|");
}
function oxCtx(era) {
  const cfg = COLONY_CONFIGS[era],
    enabled = new Set(enabledExpansions),
    owned = new Set(),
    expChunks = new Set();
  for (const [br, bc] of cfg.baseChunks)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) owned.add(optId(br * 4 + y, bc * 4 + x));
  for (const e of cfg.expansions) {
    expChunks.add(e.br + "," + e.bc);
    if (enabled.has(e.id))
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          owned.add(optId(e.br * 4 + y, e.bc * 4 + x));
  }
  return {
    era,
    cfg,
    enabled,
    enabledKey: oxKey(enabled),
    owned,
    ownedMask: oxMask(owned),
    ownedCount: owned.size,
    expChunks,
    hall: ERA_DATA[era].townHall,
    rules: OPT_RULES[era] || { paths: true },
    deadline: 0,
    lastYield: 0,
    lastProgress: 0,
    started: 0,
    tested: 0,
    bestState: null,
    bestScore: null,
    goal: "maxPrimary",
    primaryKey: null,
  };
}
function oxBlank(ctx) {
  return Array.from({ length: 28 }, (_, r) =>
    Array.from({ length: 28 }, (_, c) =>
      ctx.owned.has(optId(r, c))
        ? "empty"
        : ctx.expChunks.has(Math.floor(r / 4) + "," + Math.floor(c / 4))
          ? "future"
          : "out",
    ),
  );
}
function oxHall(ctx, hub) {
  if (
    !Array.isArray(hub) ||
    hub.length !== 2 ||
    !hub.every(Number.isInteger) ||
    hub[0] < 0 ||
    hub[1] < 0 ||
    hub[0] + ctx.hall.h > 28 ||
    hub[1] + ctx.hall.w > 28
  )
    return null;
  const ids = oxRect(hub[0], hub[1], ctx.hall.h, ctx.hall.w);
  if (ids.some((id) => !ctx.owned.has(id))) return null;
  return { hub: [...hub], ids, set: new Set(ids), mask: oxMask(ids) };
}
function oxRoads(state) {
  const s = new Set();
  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++)
      if (state?.grid?.[r]?.[c] === "road") s.add(optId(r, c));
  return s;
}
function oxConnected(roads, hallSet) {
  const seen = new Set(),
    q = [];
  for (const id of roads)
    if (optNeighborIds(id).some((n) => hallSet.has(n))) {
      seen.add(id);
      q.push(id);
    }
  for (let i = 0; i < q.length; i++)
    for (const n of optNeighborIds(q[i]))
      if (roads.has(n) && !seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
  return seen;
}
function oxOwnedAt(ctx, r, c) {
  return r >= 0 && r < 28 && c >= 0 && c < 28 && ctx.owned.has(optId(r, c));
}
function oxHallRank(ctx, hub) {
  const [r, c] = hub,
    h = ctx.hall.h,
    w = ctx.hall.w;
  let boundary = 0,
    open = 0;
  for (let x = 0; x < w; x++) {
    if (oxOwnedAt(ctx, r - 1, c + x)) open++;
    else boundary++;
    if (oxOwnedAt(ctx, r + h, c + x)) open++;
    else boundary++;
  }
  for (let y = 0; y < h; y++) {
    if (oxOwnedAt(ctx, r + y, c - 1)) open++;
    else boundary++;
    if (oxOwnedAt(ctx, r + y, c + w)) open++;
    else boundary++;
  }
  const centerR = r + (h - 1) / 2,
    centerC = c + (w - 1) / 2,
    spread = Math.abs(centerR - 13.5) + Math.abs(centerC - 13.5);
  return boundary * 100 - open * 2 + spread;
}
function oxHubs(ctx, seeds) {
  const seedOut = [],
    seen = new Set(),
    addSeed = (h) => {
      if (!h) return;
      const k = h.join(",");
      if (!seen.has(k) && oxHall(ctx, h)) {
        seen.add(k);
        seedOut.push([...h]);
      }
    };
  seeds.forEach(addSeed);
  const buckets = Array.from({ length: 9 }, () => []);
  for (let r = 0; r <= 28 - ctx.hall.h; r++)
    for (let c = 0; c <= 28 - ctx.hall.w; c++) {
      const h = [r, c],
        k = h.join(",");
      if (seen.has(k) || !oxHall(ctx, h)) continue;
      const cr = r + ctx.hall.h / 2,
        cc = c + ctx.hall.w / 2,
        br = Math.min(2, Math.floor(cr / 9.34)),
        bc = Math.min(2, Math.floor(cc / 9.34));
      buckets[br * 3 + bc].push({ h, rank: oxHallRank(ctx, h) });
    }
  for (const b of buckets)
    b.sort((a, z) => z.rank - a.rank || a.h[0] - z.h[0] || a.h[1] - z.h[1]);
  const rest = [];
  let more = true;
  while (more) {
    more = false;
    for (const b of buckets)
      if (b.length) {
        rest.push(b.shift().h);
        more = true;
      }
  }
  const mixed = [],
    max = Math.max(seedOut.length, rest.length);
  for (let i = 0; i < max; i++) {
    if (i < seedOut.length) mixed.push(seedOut[i]);
    if (i < rest.length) mixed.push(rest[i]);
  }
  return mixed;
}
function oxRoadTree(ctx, hall) {
  if (hall.roadTree) return hall.roadTree;
  const parent = new Map(),
    dist = new Map(),
    q = [];
  for (const id of hall.ids)
    for (const n of optNeighborIds(id))
      if (ctx.owned.has(n) && !hall.set.has(n) && !dist.has(n)) {
        dist.set(n, 1);
        parent.set(n, null);
        q.push(n);
      }
  for (let i = 0; i < q.length; i++) {
    const id = q[i],
      d = dist.get(id);
    for (const n of optNeighborIds(id))
      if (ctx.owned.has(n) && !hall.set.has(n) && !dist.has(n)) {
        dist.set(n, d + 1);
        parent.set(n, id);
        q.push(n);
      }
  }
  hall.roadTree = { parent, dist };
  return hall.roadTree;
}
function oxRoadComponents(roads) {
  const left = new Set(roads),
    out = [];
  while (left.size) {
    const first = left.values().next().value,
      comp = new Set([first]),
      q = [first];
    left.delete(first);
    for (let i = 0; i < q.length; i++)
      for (const n of optNeighborIds(q[i]))
        if (left.has(n)) {
          left.delete(n);
          comp.add(n);
          q.push(n);
        }
    out.push(comp);
  }
  return out;
}
function oxConnectPattern(ctx, hall, roads) {
  if (!roads?.size) return null;
  const out = new Set(roads),
    tree = oxRoadTree(ctx, hall),
    components = oxRoadComponents(out)
      .map((comp) => {
        let pick = null,
          best = Infinity;
        for (const id of comp) {
          const d = tree.dist.get(id);
          if (d !== undefined && d < best) {
            best = d;
            pick = id;
          }
        }
        return { comp, pick, best };
      })
      .sort((a, b) => a.best - b.best);
  let connected = oxConnected(out, hall.set);
  for (const item of components) {
    if ([...item.comp].some((id) => connected.has(id))) continue;
    if (item.pick == null) continue;
    let id = item.pick,
      guard = 0;
    while (id != null && guard++ < 784) {
      out.add(id);
      if (connected.has(id)) break;
      id = tree.parent.get(id) ?? null;
    }
    connected = oxConnected(out, hall.set);
  }
  connected = oxConnected(out, hall.set);
  return connected.size === out.size ? out : connected.size ? connected : null;
}
function oxPattern(ctx, hall, orientation, spacing, offset, trunk, family) {
  const roads = new Set(),
    add = (r, c) => {
      const id = optId(r, c);
      if (
        r >= 0 &&
        r < 28 &&
        c >= 0 &&
        c < 28 &&
        ctx.owned.has(id) &&
        !hall.set.has(id)
      )
        roads.add(id);
    };
  if (orientation === "h") {
    for (let r = offset; r < 28; r += spacing)
      for (let c = 0; c < 28; c++) {
        if (family === "left" && c > trunk) continue;
        if (family === "right" && c < trunk) continue;
        add(r, c);
      }
    for (let r = 0; r < 28; r++) add(r, trunk);
  } else {
    for (let c = offset; c < 28; c += spacing)
      for (let r = 0; r < 28; r++) {
        if (family === "left" && r > trunk) continue;
        if (family === "right" && r < trunk) continue;
        add(r, c);
      }
    for (let c = 0; c < 28; c++) add(trunk, c);
  }
  return roads.size ? roads : null;
}
function oxBlockPattern(
  ctx,
  hall,
  rowSpacing,
  rowOffset,
  colSpacing,
  colOffset,
) {
  const roads = new Set(),
    add = (r, c) => {
      const id = optId(r, c);
      if (
        r >= 0 &&
        r < 28 &&
        c >= 0 &&
        c < 28 &&
        ctx.owned.has(id) &&
        !hall.set.has(id)
      )
        roads.add(id);
    };
  for (let r = rowOffset; r < 28; r += rowSpacing)
    for (let c = 0; c < 28; c++) add(r, c);
  for (let c = colOffset; c < 28; c += colSpacing)
    for (let r = 0; r < 28; r++) add(r, c);
  return roads.size ? roads : null;
}
function oxHallSplitPattern(ctx, hall, rowSpacing, colSpacing, kind = "grid") {
  const roads = new Set(),
    add = (r, c) => {
      const id = optId(r, c);
      if (oxOwnedAt(ctx, r, c) && !hall.set.has(id)) roads.add(id);
    };
  const [hr, hc] = hall.hub,
    hh = ctx.hall.h,
    hw = ctx.hall.w;
  const addRow = (r) => {
      for (let c = 0; c < 28; c++) add(r, c);
    },
    addCol = (c) => {
      for (let r = 0; r < 28; r++) add(r, c);
    };
  const rows = () => {
    for (let r = hr - 1; r >= 0; r -= rowSpacing) addRow(r);
    for (let r = hr + hh; r < 28; r += rowSpacing) addRow(r);
  };
  const cols = () => {
    for (let c = hc - 1; c >= 0; c -= colSpacing) addCol(c);
    for (let c = hc + hw; c < 28; c += colSpacing) addCol(c);
  };
  if (kind === "grid") {
    rows();
    cols();
  } else if (kind === "h-left") {
    rows();
    addCol(hc - 1);
  } else if (kind === "h-right") {
    rows();
    addCol(hc + hw);
  } else if (kind === "v-top") {
    cols();
    addRow(hr - 1);
  } else if (kind === "v-bottom") {
    cols();
    addRow(hr + hh);
  }
  return roads.size ? roads : null;
}
function oxSpacingOptions(size) {
  const out = [size * 2 + 1, size + 1];
  return [...new Set(out.filter((n) => n > 1))];
}
function oxOffsetOrder(spacing, anchor) {
  const out = [],
    seen = new Set();
  const add = (n) => {
    n = ((n % spacing) + spacing) % spacing;
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  add(anchor - 1);
  add(anchor);
  add(anchor + 1);
  for (let i = 0; i < spacing; i++) add(i);
  return out;
}
function oxPatterns(ctx, hall, def, baseline, mode) {
  if (!ctx.rules.paths) return [new Set()];
  const out = [],
    seen = new Set(),
    keep = (c) => {
      if (!c?.size) return;
      const k = [...c].sort((a, b) => a - b).join(",");
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
    },
    add = (r) => {
      if (!r?.size) return;
      const root = oxConnected(r, hall.set);
      keep(root);
      if (mode !== "fast" && root.size < r.size)
        keep(oxConnectPattern(ctx, hall, r));
    };
  if (
    baseline &&
    baseline.hubTop?.[0] === hall.hub[0] &&
    baseline.hubTop?.[1] === hall.hub[1]
  )
    add(oxRoads(baseline));

  // Buildings only need to touch one path. Two building rows can therefore share
  // the same pair of road lines. Hall-split patterns also restart those bands on
  // each side of the Town Hall instead of wasting a strip because the Hall broke
  // the global road rhythm.
  const rowSpacings = oxSpacingOptions(def.h),
    colSpacings = oxSpacingOptions(def.w);
  const wideRow = rowSpacings[0],
    wideCol = colSpacings[0];
  for (const kind of ["grid", "h-left", "h-right", "v-top", "v-bottom"])
    add(oxHallSplitPattern(ctx, hall, wideRow, wideCol, kind));

  const rowOffsets = oxOffsetOrder(wideRow, hall.hub[0]),
    colOffsets = oxOffsetOrder(wideCol, hall.hub[1]);
  const gridLimit = mode === "fast" ? 2 : mode === "normal" ? 3 : 5;
  for (const ro of rowOffsets.slice(0, gridLimit))
    for (const co of colOffsets.slice(0, gridLimit))
      add(oxBlockPattern(ctx, hall, wideRow, ro, wideCol, co));

  for (const o of ["h", "v"]) {
    const spacings = o === "h" ? rowSpacings : colSpacings,
      axis = o === "h" ? hall.hub[1] : hall.hub[0],
      span = o === "h" ? ctx.hall.w : ctx.hall.h,
      tr = [];
    for (const t of [axis - 1, axis + span, axis, axis + span - 1])
      if (t >= 0 && t < 28 && !tr.includes(t)) tr.push(t);
    for (let t = 0; t < 28; t++) if (!tr.includes(t)) tr.push(t);
    const trunkLimit = mode === "fast" ? 6 : mode === "normal" ? 10 : 28;
    for (const spacing of spacings) {
      const anchor = o === "h" ? hall.hub[0] : hall.hub[1],
        offsets = oxOffsetOrder(spacing, anchor),
        offsetLimit = mode === "fast" ? Math.min(3, spacing) : spacing;
      for (const off of offsets.slice(0, offsetLimit))
        for (const t of tr.slice(0, trunkLimit)) {
          add(oxPattern(ctx, hall, o, spacing, off, t, "full"));
          if (mode !== "fast") {
            add(oxPattern(ctx, hall, o, spacing, off, t, "left"));
            add(oxPattern(ctx, hall, o, spacing, off, t, "right"));
          }
        }
    }
  }
  return out;
}
function oxPlacements(ctx, def, hall, roads) {
  const blocked = hall.mask | oxMask(roads),
    out = [];
  for (let r = 0; r <= 28 - def.h; r++)
    for (let c = 0; c <= 28 - def.w; c++) {
      const ids = oxRect(r, c, def.h, def.w),
        mask = oxMask(ids);
      if ((mask & ~ctx.ownedMask) !== 0n || (mask & blocked) !== 0n) continue;
      let touch = 0;
      if (ctx.rules.paths && def.requiresPath !== false) {
        for (const id of ids)
          if (optNeighborIds(id).some((n) => roads.has(n))) touch++;
        if (!touch) continue;
      }
      out.push({ type: def.key, r, c, ids, mask, touch });
    }
  return out;
}
function oxHash(x) {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
function oxSort(a, order, seed) {
  const x = [...a],
    m = 13.5;
  if (order === 0) x.sort((p, q) => p.r - q.r || p.c - q.c);
  else if (order === 1) x.sort((p, q) => p.c - q.c || p.r - q.r);
  else if (order === 2) x.sort((p, q) => q.r - p.r || p.c - q.c);
  else if (order === 3) x.sort((p, q) => p.r - q.r || q.c - p.c);
  else if (order === 4)
    x.sort(
      (p, q) =>
        Math.abs(p.r - m) +
        Math.abs(p.c - m) -
        (Math.abs(q.r - m) + Math.abs(q.c - m)),
    );
  else if (order === 5) x.sort((p, q) => p.touch - q.touch || p.r - q.r);
  else
    x.sort(
      (p, q) => oxHash(optId(p.r, p.c) ^ seed) - oxHash(optId(q.r, q.c) ^ seed),
    );
  return x;
}
function oxCredits(def) {
  return def?.creditAmount && def?.creditHours
    ? Number(def.creditAmount) * (8 / Number(def.creditHours))
    : 0;
}
function oxAllowedResidentialDefs(era, primaryKey) {
  const defs = (ERA_DATA[era]?.residential || []).map(boardBuildingDef);
  const index = defs.findIndex((d) => d.key === primaryKey);
  return index < 0 ? [] : defs.slice(0, index + 1);
}
function oxAllowedResidentialKeys(era, primaryKey) {
  return new Set(oxAllowedResidentialDefs(era, primaryKey).map((d) => d.key));
}
function oxUsesOnlyAllowedResidential(state, allowedKeys) {
  return (
    !!state &&
    Array.isArray(state.buildings) &&
    state.buildings.every((b) => allowedKeys.has(b.type))
  );
}
function oxState(ctx, sol) {
  const g = oxBlank(ctx),
    bs = [];
  for (const id of sol.hall.ids) {
    const [r, c] = optRC(id);
    g[r][c] = "hub";
  }
  for (const id of sol.roads) {
    const [r, c] = optRC(id);
    g[r][c] = "road";
  }
  for (const p of sol.placements) {
    const cells = [];
    for (const id of p.ids) {
      const [r, c] = optRC(id);
      g[r][c] = p.type;
      cells.push([r, c]);
    }
    bs.push({ type: p.type, r: p.r, c: p.c, cells });
  }
  return {
    grid: g,
    buildings: bs,
    hubTop: [...sol.hall.hub],
    enabled: [...ctx.enabled],
    panX,
    panY,
    viewZoom,
  };
}
function oxScore(ctx, state, primary) {
  let primaryCount = 0,
    totalResidential = 0,
    credits8h = 0,
    fillerCredits8h = 0,
    roads = 0,
    area = 0;
  for (let r = 0; r < 28; r++)
    for (let c = 0; c < 28; c++) if (state.grid[r][c] === "road") roads++;
  for (const b of state.buildings) {
    const d = eraBoardBuildingByKey(ctx.era, b.type);
    if (!d) continue;
    area += d.w * d.h;
    if (d.category === "residential") {
      totalResidential++;
      const cr = oxCredits(d);
      credits8h += cr;
      if (b.type === primary) primaryCount++;
      else fillerCredits8h += cr;
    }
  }
  return {
    primaryCount,
    totalResidential,
    credits8h,
    fillerCredits8h,
    roads,
    unused: ctx.ownedCount - ctx.hall.w * ctx.hall.h - roads - area,
  };
}
function oxBetter(a, b, goal) {
  if (!b) return true;
  if (goal === "maxPrimary") {
    if (a.primaryCount !== b.primaryCount)
      return a.primaryCount > b.primaryCount;
    if (a.credits8h !== b.credits8h) return a.credits8h > b.credits8h;
    if (a.fillerCredits8h !== b.fillerCredits8h)
      return a.fillerCredits8h > b.fillerCredits8h;
    if (a.roads !== b.roads) return a.roads < b.roads;
    return a.unused < b.unused;
  }
  if (a.credits8h !== b.credits8h) return a.credits8h > b.credits8h;
  if (a.roads !== b.roads) return a.roads < b.roads;
  return a.totalResidential > b.totalResidential;
}
function oxAccess(ctx, placements, roads) {
  if (!ctx.rules.paths) return true;
  for (const p of placements) {
    const d = eraBoardBuildingByKey(ctx.era, p.type);
    if (
      d?.requiresPath !== false &&
      !p.ids.some((id) => optNeighborIds(id).some((n) => roads.has(n)))
    )
      return false;
  }
  return true;
}
function oxPrune(ctx, sol) {
  if (!ctx.rules.paths) return sol;
  const roads = new Set(sol.roads);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...roads]) {
      const test = new Set(roads);
      test.delete(id);
      if (!oxAccess(ctx, sol.placements, test)) continue;
      if (test.size && oxConnected(test, sol.hall.set).size !== test.size)
        continue;
      roads.delete(id);
      changed = true;
    }
  }
  return { ...sol, roads };
}
function oxPlacementMask(sol) {
  let blocked = sol.hall.mask | oxMask(sol.roads);
  for (const p of sol.placements) blocked |= p.mask;
  return blocked;
}
function oxFillFreedGaps(ctx, sol, primary, fillers) {
  let work = oxPrune(ctx, sol),
    changed = false;
  for (let round = 0; round < 3; round++) {
    let blocked = oxPlacementMask(work),
      added = 0;
    for (const d of [primary, ...fillers])
      for (const p of oxPlacements(ctx, d, work.hall, work.roads))
        if ((p.mask & blocked) === 0n) {
          work.placements.push(p);
          blocked |= p.mask;
          added++;
          changed = true;
        }
    if (!added) break;
    work = oxPrune(ctx, work);
  }
  if (changed) ctx.tested++;
  return work;
}
function oxSolFromState(ctx, state) {
  const hall = oxHall(ctx, state?.hubTop);
  if (!hall) return null;
  const placements = [];
  for (const b of state.buildings || []) {
    const d = eraBoardBuildingByKey(ctx.era, b.type);
    if (!d) return null;
    const ids = oxRect(b.r, b.c, d.h, d.w);
    placements.push({
      type: b.type,
      r: b.r,
      c: b.c,
      ids,
      mask: oxMask(ids),
      touch: 0,
    });
  }
  return { hall, roads: oxRoads(state), placements };
}
function oxBuildingCells(sol) {
  const blocked = new Set(sol.hall.ids);
  for (const p of sol.placements) for (const id of p.ids) blocked.add(id);
  return blocked;
}
function oxRoadNeighborTargets(ctx, ids, blocked) {
  const out = new Set();
  for (const id of ids)
    for (const n of optNeighborIds(id))
      if (ctx.owned.has(n) && !blocked.has(n)) out.add(n);
  return out;
}
function oxShortestRoadPath(ctx, hall, roads, blocked, targets) {
  if (!targets?.size) return null;
  const q = [],
    seen = new Set(),
    parent = new Map(),
    addStart = (id) => {
      if (!ctx.owned.has(id) || blocked.has(id) || seen.has(id)) return;
      seen.add(id);
      parent.set(id, null);
      q.push(id);
    };
  for (const id of oxConnected(roads, hall.set)) addStart(id);
  for (const id of hall.ids) for (const n of optNeighborIds(id)) addStart(n);
  for (let i = 0; i < q.length; i++) {
    const id = q[i];
    if (targets.has(id)) {
      const path = [];
      let cur = id;
      while (cur != null) {
        path.push(cur);
        cur = parent.get(cur) ?? null;
      }
      return path;
    }
    for (const n of optNeighborIds(id))
      if (ctx.owned.has(n) && !blocked.has(n) && !seen.has(n)) {
        seen.add(n);
        parent.set(n, id);
        q.push(n);
      }
  }
  return null;
}
function oxRepairRoadNetwork(ctx, sol) {
  if (!ctx.rules.paths) return sol;
  const blocked = oxBuildingCells(sol),
    roads = new Set(
      [...sol.roads].filter((id) => ctx.owned.has(id) && !blocked.has(id)),
    );
  const ordered = [...sol.placements].sort(
    (a, b) => (b.repairPriority || 0) - (a.repairPriority || 0),
  );
  for (const p of ordered) {
    const d = eraBoardBuildingByKey(ctx.era, p.type);
    if (d?.requiresPath === false) continue;
    const connected = oxConnected(roads, sol.hall.set);
    if (p.ids.some((id) => optNeighborIds(id).some((n) => connected.has(n))))
      continue;
    const targets = oxRoadNeighborTargets(ctx, p.ids, blocked),
      path = oxShortestRoadPath(ctx, sol.hall, roads, blocked, targets);
    if (!path) return null;
    for (const id of path) roads.add(id);
  }
  const connected = oxConnected(roads, sol.hall.set),
    work = {
      hall: sol.hall,
      roads: new Set(connected),
      placements: sol.placements.map((p) => ({ ...p, repairPriority: 0 })),
    };
  if (!oxAccess(ctx, work.placements, work.roads)) return null;
  return oxPrune(ctx, work);
}
function oxRepairPlacementCandidates(ctx, sol, def) {
  let buildings = sol.hall.mask;
  for (const p of sol.placements) buildings |= p.mask;
  const out = [];
  for (let r = 0; r <= 28 - def.h; r++)
    for (let c = 0; c <= 28 - def.w; c++) {
      const ids = oxRect(r, c, def.h, def.w),
        mask = oxMask(ids);
      if ((mask & ~ctx.ownedMask) !== 0n || (mask & buildings) !== 0n) continue;
      let roadHits = 0;
      for (const id of ids) if (sol.roads.has(id)) roadHits++;
      out.push({
        type: def.key,
        r,
        c,
        ids,
        mask,
        touch: 0,
        repairPriority: 1,
        roadHits,
      });
    }
  out.sort((a, b) => a.roadHits - b.roadHits || a.r - b.r || a.c - b.c);
  return out;
}
async function oxRepairBestState(ctx, primary, goal, until) {
  if (!ctx.rules.paths || goal !== "maxCredits") return;
  const defs = oxAllowedResidentialDefs(ctx.era, primary.key).sort(
    (a, b) => oxCredits(b) / (b.w * b.h) - oxCredits(a) / (a.w * a.h),
  );
  let work = oxSolFromState(ctx, ctx.bestState);
  if (!work) return;
  for (let round = 0; round < 10 && performance.now() < until; round++) {
    let roundBest = null,
      roundScore = null,
      checks = 0;
    for (const d of defs) {
      for (const candidate of oxRepairPlacementCandidates(ctx, work, d)) {
        if (performance.now() >= until || optimizerCancelRequested) break;
        const trial = {
            hall: work.hall,
            roads: new Set(work.roads),
            placements: [candidate, ...work.placements],
          },
          repaired = oxRepairRoadNetwork(ctx, trial);
        ctx.tested++;
        checks++;
        if (repaired) {
          const st = oxState(ctx, repaired),
            sc = oxScore(ctx, st, ctx.primaryKey);
          if (oxValid(ctx, st) && oxBetter(sc, roundScore, goal)) {
            roundBest = repaired;
            roundScore = sc;
          }
        }
        if (checks % 8 === 0 && !(await oxYield(ctx))) return;
      }
      if (performance.now() >= until || optimizerCancelRequested) break;
    }
    if (!roundBest || !oxBetter(roundScore, ctx.bestScore, goal)) break;
    work = oxFillFreedGaps(
      ctx,
      roundBest,
      primary,
      defs.filter((d) => d.key !== primary.key),
    );
    const st = oxState(ctx, work),
      sc = oxScore(ctx, st, ctx.primaryKey);
    if (!oxValid(ctx, st) || !oxBetter(sc, ctx.bestScore, goal)) break;
    ctx.bestState = st;
    ctx.bestScore = sc;
    oxProgress(ctx, "Repairing gaps");
  }
}
function oxPack(ctx, hall, roads, primary, goal, mode, seed) {
  const allowed = oxAllowedResidentialDefs(ctx.era, primary.key);
  const fillers = allowed
    .filter((d) => d.key !== primary.key)
    .sort((a, b) => oxCredits(b) / (b.w * b.h) - oxCredits(a) / (a.w * a.h));
  const base = hall.mask | oxMask(roads),
    pc = oxPlacements(ctx, primary, hall, roads),
    starts = mode === "fast" ? 6 : mode === "deep" ? 22 : 10;
  let best = null,
    score = null;
  for (let s = 0; s < starts; s++) {
    const order = s < 6 ? s : 6 + s;
    let blocked = base,
      placed = [];
    for (const p of oxSort(pc, order, seed + s * 7919))
      if ((p.mask & blocked) === 0n) {
        placed.push(p);
        blocked |= p.mask;
      }
    for (const d of fillers)
      for (const p of oxSort(
        oxPlacements(ctx, d, hall, roads),
        order,
        seed + s * 104729 + d.key.length,
      ))
        if ((p.mask & blocked) === 0n) {
          placed.push(p);
          blocked |= p.mask;
        }
    const sol = { hall, roads: new Set(roads), placements: placed },
      st = oxState(ctx, sol),
      sc = oxScore(ctx, st, ctx.primaryKey);
    ctx.tested++;
    if (!best || oxBetter(sc, score, goal)) {
      best = sol;
      score = sc;
    }
  }
  return best ? oxFillFreedGaps(ctx, best, primary, fillers) : null;
}
function oxValid(ctx, state) {
  if (!state || oxKey(state.enabled) !== ctx.enabledKey) return false;
  const hall = oxHall(ctx, state.hubTop);
  if (!hall) return false;
  const used = new Set(hall.ids),
    roads = oxRoads(state);
  if (!ctx.rules.paths && roads.size) return false;
  for (const id of roads) {
    if (!ctx.owned.has(id) || used.has(id)) return false;
    used.add(id);
  }
  const ps = [];
  for (const b of state.buildings || []) {
    const d = eraBoardBuildingByKey(ctx.era, b.type);
    if (
      !d ||
      !Number.isInteger(b.r) ||
      !Number.isInteger(b.c) ||
      b.r < 0 ||
      b.c < 0 ||
      b.r + d.h > 28 ||
      b.c + d.w > 28
    )
      return false;
    const ids = oxRect(b.r, b.c, d.h, d.w);
    if (ids.some((id) => !ctx.owned.has(id) || used.has(id))) return false;
    ids.forEach((id) => used.add(id));
    ps.push({ type: b.type, ids });
  }
  if (
    ctx.rules.paths &&
    (oxConnected(roads, hall.set).size !== roads.size ||
      !oxAccess(ctx, ps, roads))
  )
    return false;
  return true;
}
function oxBaseline(ctx, primary, goal) {
  const allowedKeys = oxAllowedResidentialKeys(ctx.era, primary),
    states = [currentColonyState()];
  try {
    for (const p of getPresetCatalog())
      if (p?.state && oxKey(p.state.enabled) === ctx.enabledKey)
        states.push(p.state);
  } catch {}
  let best = null,
    score = null;
  for (const s of states)
    if (oxValid(ctx, s) && oxUsesOnlyAllowedResidential(s, allowedKeys)) {
      const sc = oxScore(ctx, s, primary);
      if (!best || oxBetter(sc, score, goal)) {
        best = cloneState(s);
        score = sc;
      }
    }
  if (!best) {
    const h = oxHubs(ctx, [hubTop, ctx.cfg.defaultHub])[0],
      sol = { hall: oxHall(ctx, h), roads: new Set(), placements: [] };
    best = oxState(ctx, sol);
    score = oxScore(ctx, best, primary);
  }
  return { state: best, score };
}
function oxProgress(ctx, label) {
  const el = $("optimizerProgress"),
    s = ctx.bestScore,
    d = eraBoardBuildingByKey(ctx.era, ctx.primaryKey),
    now = performance.now(),
    sec = ((now - ctx.started) / 1000).toFixed(1);
  if (!el) return;
  const txt =
      ctx.goal === "maxPrimary"
        ? s.primaryCount +
          " " +
          (d?.name || "building") +
          (s.primaryCount === 1 ? "" : "s")
        : Math.round(s.credits8h / 2).toLocaleString() + " credits / 4h",
    strong = el.querySelector("strong"),
    spans = el.querySelectorAll("span"),
    title = label || "Searching",
    line1 =
      "Best found: " +
      txt +
      " · " +
      s.roads +
      " paths · " +
      s.unused +
      " unused",
    line2 = "Tested " + ctx.tested.toLocaleString() + " layouts · " + sec + "s";
  if (strong && spans.length >= 2) {
    strong.textContent = title;
    spans[0].textContent = line1;
    spans[1].textContent = line2;
  } else
    el.innerHTML =
      "<strong>" +
      title +
      "</strong><span>" +
      line1 +
      "</span><span>" +
      line2 +
      "</span>";
  ctx.lastProgress = now;
}
async function oxYield(ctx, force) {
  if (optimizerCancelRequested || performance.now() >= ctx.deadline)
    return false;
  const now = performance.now();
  if (force || now - ctx.lastYield > 12) {
    if (force || now - ctx.lastProgress > 100) oxProgress(ctx, "Searching");
    await new Promise((r) => setTimeout(r, 0));
    ctx.lastYield = performance.now();
  }
  return !optimizerCancelRequested && performance.now() < ctx.deadline;
}
function oxRememberHallLeader(list, hub, score, goal) {
  const key = hub.join(","),
    old = list.find((x) => x.key === key);
  if (old) {
    if (oxBetter(score, old.score, goal)) old.score = score;
    return;
  }
  list.push({ key, hub: [...hub], score });
}
function oxSortHallLeaders(list, goal) {
  return [...list].sort((a, b) =>
    oxBetter(a.score, b.score, goal)
      ? -1
      : oxBetter(b.score, a.score, goal)
        ? 1
        : 0,
  );
}
async function optimizeColonyV2(era, goal, primaryKey, mode) {
  const ctx = oxCtx(era);
  ctx.goal = goal;
  ctx.primaryKey = primaryKey;
  ctx.started = performance.now();
  ctx.lastYield = ctx.started;
  ctx.deadline = ctx.started + (OPT_BUDGET[mode] || 3000);
  const primary = eraBoardBuildingByKey(era, primaryKey);
  if (!primary) throw new Error("Unknown optimizer building");
  const allowedKeys = oxAllowedResidentialKeys(era, primaryKey),
    base = oxBaseline(ctx, primaryKey, goal);
  ctx.bestState = base.state;
  ctx.bestScore = base.score;
  const hubs = oxHubs(ctx, [base.state.hubTop, hubTop, ctx.cfg.defaultHub]),
    leaders = [];

  const trySolution = (sol, hub) => {
    if (!sol) return;
    const st = oxState(ctx, sol),
      sc = oxScore(ctx, st, primaryKey);
    if (!oxValid(ctx, st) || !oxUsesOnlyAllowedResidential(st, allowedKeys))
      return;
    oxRememberHallLeader(leaders, hub, sc, goal);
    if (oxBetter(sc, ctx.bestScore, goal)) {
      ctx.bestState = st;
      ctx.bestScore = sc;
      oxProgress(ctx, "Improved");
    }
  };

  if (mode === "fast") {
    for (let hi = 0; hi < hubs.length; hi++) {
      if (!(await oxYield(ctx))) break;
      const hall = oxHall(ctx, hubs[hi]),
        patterns = oxPatterns(ctx, hall, primary, base.state, "fast");
      for (const roads of patterns) {
        if (!(await oxYield(ctx))) break;
        trySolution(
          oxPack(
            ctx,
            hall,
            roads,
            primary,
            goal,
            "fast",
            oxHash((hi + 1) * 65537 + ctx.tested),
          ),
          hubs[hi],
        );
      }
    }
  } else {
    const scoutUntil = Math.min(
      ctx.deadline - 1000,
      ctx.started + (mode === "deep" ? 12000 : 900),
    );
    const scoutMax = mode === "deep" ? 180 : 32,
      patternsPerHall = mode === "deep" ? 8 : 3;
    for (
      let hi = 0;
      hi < hubs.length && hi < scoutMax && performance.now() < scoutUntil;
      hi++
    ) {
      if (!(await oxYield(ctx))) break;
      const hall = oxHall(ctx, hubs[hi]),
        patterns = oxPatterns(ctx, hall, primary, base.state, "fast").slice(
          0,
          patternsPerHall,
        );
      for (
        let pi = 0;
        pi < patterns.length && performance.now() < scoutUntil;
        pi++
      ) {
        if (!(await oxYield(ctx))) break;
        trySolution(
          oxPack(
            ctx,
            hall,
            patterns[pi],
            primary,
            goal,
            "fast",
            oxHash((hi + 1) * 65537 + pi * 8191 + ctx.tested),
          ),
          hubs[hi],
        );
      }
    }

    const ranked = oxSortHallLeaders(leaders, goal),
      refine = [],
      seen = new Set(),
      addHub = (h) => {
        if (!h) return;
        const k = h.join(",");
        if (!seen.has(k) && oxHall(ctx, h)) {
          seen.add(k);
          refine.push([...h]);
        }
      };
    addHub(ctx.bestState?.hubTop);
    for (const x of ranked.slice(0, mode === "deep" ? 20 : 6)) addHub(x.hub);
    addHub(base.state.hubTop);
    addHub(hubTop);
    addHub(ctx.cfg.defaultHub);
    const jobs = refine.map((h, i) => {
        const hall = oxHall(ctx, h);
        return {
          h,
          hall,
          patterns: oxPatterns(ctx, hall, primary, base.state, mode),
          i: 0,
          seed: i + 1,
        };
      }),
      refineUntil =
        mode === "deep"
          ? Math.min(ctx.deadline - 1000, ctx.started + 60000)
          : ctx.deadline;
    let active = true;
    while (active && performance.now() < refineUntil && (await oxYield(ctx))) {
      active = false;
      for (const job of jobs) {
        if (job.i >= job.patterns.length) continue;
        active = true;
        if (!(await oxYield(ctx))) break;
        const roads = job.patterns[job.i++],
          packMode = mode === "deep" ? "deep" : "normal";
        trySolution(
          oxPack(
            ctx,
            job.hall,
            roads,
            primary,
            goal,
            packMode,
            oxHash(job.seed * 104729 + job.i * 8191 + ctx.tested),
          ),
          job.h,
        );
      }
    }
  }
  if (
    mode === "deep" &&
    goal === "maxCredits" &&
    !optimizerCancelRequested &&
    performance.now() < ctx.deadline
  )
    await oxRepairBestState(ctx, primary, goal, ctx.deadline - 250);
  await oxYield(ctx, true);
  return {
    state: ctx.bestState,
    score: ctx.bestScore,
    cancelled: optimizerCancelRequested,
    tested: ctx.tested,
  };
}

function optimizerPopulatePrimary() {
  const s = $("optimizerPrimary");
  if (!s) return;
  s.innerHTML = "";
  const defs = ERA_DATA[selectedEra]?.residential || [],
    counts = new Map();
  for (const b of buildings) counts.set(b.type, (counts.get(b.type) || 0) + 1);
  let pref = defs[0]?.key,
    best = -1;
  for (const d of defs) {
    const n = counts.get(d.key) || 0;
    if (n > best) {
      best = n;
      pref = d.key;
    }
    const o = document.createElement("option");
    o.value = d.key;
    o.textContent = d.name + " (" + d.sizeText + ")";
    s.appendChild(o);
  }
  if (pref) s.value = pref;
}
function optimizerSyncGoalUi() {
  $("optimizerPrimaryRow").hidden = false;
}
function optimizerSyncSearchLabels() {
  const s = $("optimizerSearch");
  if (!s) return;
  for (const o of s.options) {
    if (o.value === "deep") o.textContent = "Deep · ~90s";
    else if (o.value === "normal") o.textContent = "Normal · ~3s";
    else if (o.value === "fast") o.textContent = "Fast · <1s";
  }
}
function openOptimizerDialog() {
  if (!isEditableColonyEra(selectedEra) || optimizerRunning) return;
  closePresetPopover();
  optimizerPendingResult = null;
  optimizerCancelRequested = false;
  optimizerPopulatePrimary();
  optimizerSyncGoalUi();
  optimizerSyncSearchLabels();
  $("optimizerProgress").innerHTML =
    "<strong>Ready</strong><span>Try rearranging your homes to earn more credits. Nothing changes until you apply a result.</span>";
  $("optimizerRunBtn").textContent = "Optimize";
  $("optimizerRunBtn").disabled = false;
  $("optimizerCancelBtn").textContent = "Cancel";
  $("optimizerDialog").showModal();
}
function closeOptimizerDialog() {
  optimizerCancelRequested = true;
  if (!optimizerRunning) $("optimizerDialog")?.close();
}
async function runOptimizerDialog() {
  if (optimizerPendingResult) {
    if (
      optimizerPendingResult.era !== selectedEra ||
      !colonyStateMatchesGeometry(optimizerPendingResult.state, selectedEra)
    ) {
      optimizerPendingResult = null;
      closeOptimizerDialog();
      return;
    }
    snapshot();
    movingItem = null;
    clearRoadChain();
    setMode(null, false);
    activeLayoutMode = "free";
    activePresetId = null;
    preset = "none";
    applyColonyState(optimizerPendingResult.state, { preserveCamera: true });
    updateLayoutModeButtons();
    persistColonyState(selectedEra);
    optimizerPendingResult = null;
    $("optimizerDialog").close();
    notifyToast(
      "Optimizer result applied",
      `Press ${appSettings.hotkeyUndo} to undo.`,
      "success",
      3600,
    );
    return;
  }
  if (optimizerRunning) return;
  const era = selectedEra,
    goal = $("optimizerGoal").value,
    primary = $("optimizerPrimary").value,
    mode = $("optimizerSearch").value;
  if (!primary) return;
  optimizerRunning = true;
  optimizerCancelRequested = false;
  $("optimizerRunBtn").disabled = true;
  $("optimizerRunBtn").textContent = "Searching…";
  $("optimizerCancelBtn").textContent = "Cancel search";
  $("optimizerDialog")
    .querySelectorAll("select")
    .forEach((x) => (x.disabled = true));
  try {
    const result = await optimizeColonyV2(era, goal, primary, mode);
    if (selectedEra !== era) return;
    const ctx = oxCtx(era);
    if (
      !result.cancelled &&
      (!colonyStateMatchesGeometry(result.state, era) ||
        !oxValid(ctx, result.state))
    ) {
      throw new Error("The search returned an invalid layout");
    }
    const current = currentColonyState(),
      // Count every existing residence, including later buildings and mixed colonies.
      cur = oxScore(ctx, current, primary),
      sc = oxScore(ctx, result.state, primary),
      better =
        !cur ||
        (goal === "maxCredits"
          ? sc.credits8h > cur.credits8h
          : oxBetter(sc, cur, goal)),
      d = eraBoardBuildingByKey(era, primary),
      best =
        goal === "maxPrimary"
          ? sc.primaryCount + " " + d.name + (sc.primaryCount === 1 ? "" : "s")
          : Math.round(sc.credits8h / 2).toLocaleString() + " credits / 4h";
    if (result.cancelled) {
      $("optimizerProgress").innerHTML =
        "<strong>Cancelled</strong><span>Your layout was left unchanged.</span>";
      $("optimizerRunBtn").textContent = "Optimize";
    } else if (better) {
      optimizerPendingResult = { state: result.state, era };
      $("optimizerProgress").innerHTML =
        "<strong>Best found: " +
        best +
        "</strong><span>" +
        sc.roads +
        " paths · " +
        sc.unused +
        " unused tiles · " +
        result.tested.toLocaleString() +
        " layouts tested</span><span>This is the best layout found in this search. There may still be a better fit.</span>";
      $("optimizerRunBtn").textContent = "Apply result";
    } else {
      $("optimizerProgress").innerHTML =
        "<strong>No higher-credit layout found</strong><span>Best found: " +
        best +
        ". Your layout was not changed.</span><span>" +
        result.tested.toLocaleString() +
        " layouts tested.</span>";
      $("optimizerRunBtn").textContent = "Run again";
    }
    $("optimizerRunBtn").disabled = false;
  } catch (err) {
    console.error("Optimizer failed", err);
    $("optimizerProgress").innerHTML =
      "<strong>Optimizer error</strong><span>Your layout was left unchanged.</span>";
    $("optimizerRunBtn").textContent = "Try again";
    $("optimizerRunBtn").disabled = false;
  } finally {
    optimizerRunning = false;
    $("optimizerCancelBtn").textContent = "Close";
    $("optimizerDialog")
      .querySelectorAll("select")
      .forEach((x) => (x.disabled = false));
  }
}

bindClick("optimizeBtn", () => openOptimizerDialog());
bindClick("optimizerRunBtn", () => runOptimizerDialog());
bindClick("optimizerCancelBtn", () => closeOptimizerDialog());
$("optimizerGoal")?.addEventListener("change", optimizerSyncGoalUi);

$("optimizerDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOptimizerDialog();
});
$("optimizerPrimary").addEventListener("change", () => {
  if (!optimizerPendingResult) return;
  optimizerPendingResult = null;
  $("optimizerRunBtn").textContent = "Optimize";
  $("optimizerProgress").innerHTML =
    "<strong>Ready</strong><span>Search again with this building.</span>";
});
