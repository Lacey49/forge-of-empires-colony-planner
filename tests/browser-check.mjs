import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(
    path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, "playwright"),
  ));
}
const root = path.resolve(".");
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  const file = path.resolve(
    root,
    "." + (pathname === "/" ? "/index.html" : pathname),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".webp": "image/webp",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE_PATH
    ? {
        executablePath: process.env.BROWSER_EXECUTABLE_PATH,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : {}),
});
const failures = [];
const notes = [];
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
page.on("pageerror", (e) => failures.push(e.message));
page.on("console", (message) => {
  if (message.type() === "error")
    console.error("Browser console:", message.text());
});
page.on("response", (r) => {
  if (r.url().startsWith(base) && r.status() >= 400)
    failures.push(`${r.status()} ${r.url()}`);
});
try {
  await page.goto(base);
  await page.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  assert.equal(await page.evaluate(() => grid.length), 28);
  // Check every real preset, including roads and building records, in all six eras.
  const presets = await page.evaluate(async () => {
    const errors = [];
    let count = 0;
    for (const era of Object.keys(ERA_DATA)) {
      showEditableColonyUi(era);
      if (!colonyStateMatchesGeometry(currentColonyState(), era))
        errors.push(`${era}: invalid blank colony`);
      for (const item of getPresetCatalog()) {
        count++;
        if (!colonyStateMatchesGeometry(item.state, era))
          errors.push(`${era}/${item.name}: invalid geometry`);
        const oldEnabled = enabledExpansions;
        enabledExpansions = new Set(item.state.enabled);
        if (!oxValid(oxCtx(era), item.state))
          errors.push(`${era}/${item.name}: invalid connections`);
        enabledExpansions = oldEnabled;
      }
    }
    return { count, errors };
  });
  assert.deepEqual(presets.errors, []);
  notes.push(`${presets.count} presets checked across all six eras`);

  const exactSashPresets = await page.evaluate(() => {
    showEditableColonyUi("SASH");
    const catalog = getPresetCatalog();
    const first = catalog.find((item) => item.id === "builtin:sash-simple-crew");
    const second = catalog.find(
      (item) => item.id === "builtin:sash-simple-crew-cosmic",
    );
    const countTypes = (state) => {
      const counts = {};
      for (const building of state?.buildings || [])
        counts[building.type] = (counts[building.type] || 0) + 1;
      return counts;
    };
    return {
      firstTitle: first?.name,
      secondTitle: second?.name,
      firstCounts: countTypes(first?.state),
      secondCounts: countTypes(second?.state),
      secondHub: second?.state?.hubTop,
    };
  });
  assert.equal(
    exactSashPresets.firstTitle,
    "Simple Crew Quarters (23) + FloraShip Express (12)",
  );
  assert.equal(
    exactSashPresets.secondTitle,
    "Simple Crew Quarters (26) + CosmicClean Express (7)",
  );
  assert.deepEqual(exactSashPresets.firstCounts, {
    simpleCrewQuarters: 23,
    floraShipExpress: 12,
  });
  assert.deepEqual(exactSashPresets.secondCounts, {
    simpleCrewQuarters: 26,
    floraShipExpress: 2,
    cosmicCleanExpress: 7,
  });
  assert.deepEqual(exactSashPresets.secondHub, [6, 4]);
  notes.push("Exact SASH preset names and mixed Life Support counts checked");

  const lifeSupportSummary = await page.evaluate(async () => {
    const eraChecks = {};
    for (const [era, data] of Object.entries(ERA_DATA)) {
      const residential = data.residential[0];
      const support = data.lifeSupport[0];
      const supportCount = Math.ceil(
        (Number(residential.colonists) * 5) /
          (Number(support.lifeSupport) * 4),
      );
      const sample = [
        { type: residential.key },
        ...Array.from({ length: supportCount }, () => ({ type: support.key })),
      ];
      const stats = colonyLifeSupportStats(era, sample);
      eraChecks[era] = {
        green: stats.green,
        percent: stats.percent,
        text: formatLifeSupportPercent(stats.percent),
      };
    }

    showEditableColonyUi("SASH");
    const first = getPresetCatalog().find(
      (item) => item.id === "builtin:sash-simple-crew",
    );
    await loadPresetItem(first);
    updateStats();
    const sashStats = colonyLifeSupportStats();

    return {
      eraChecks,
      sashText: $("lifeSupportPercent")?.textContent,
      sashExpectedText: formatLifeSupportPercent(sashStats.percent),
      sashTierClass: [...$("lifeSupportPercent")?.classList || []].find(
        (name) => name.startsWith("life-support-"),
      ),
      sashColor: getComputedStyle($("lifeSupportPercent")).color,
      tierSamples: {
        red: lifeSupportTier(99.9),
        orangeStart: lifeSupportTier(100),
        orangeEnd: lifeSupportTier(124.9),
        green: lifeSupportTier(125),
      },
      tierColors: (() => {
        const el = $("lifeSupportPercent");
        const colors = {};
        for (const tier of ["red", "orange", "green"]) {
          el.className = `life-support-${tier}`;
          colors[tier] = getComputedStyle(el).color;
        }
        el.className = "life-support-green";
        return colors;
      })(),
      sashPercent: sashStats.percent,
    };
  });
  assert.deepEqual(Object.keys(lifeSupportSummary.eraChecks).sort(), [
    "SAAB",
    "SAJM",
    "SAM",
    "SASH",
    "SAT",
    "SAV",
  ]);
  for (const [era, check] of Object.entries(lifeSupportSummary.eraChecks)) {
    assert.equal(check.green, true, `${era} should reach green Life Support`);
    assert.ok(
      check.percent >= 125,
      `${era} green Life Support should be at least 125%`,
    );
    assert.match(check.text, /%$/);
  }
  assert.equal(
    lifeSupportSummary.sashText,
    lifeSupportSummary.sashExpectedText,
  );
  assert.ok(lifeSupportSummary.sashPercent >= 125);
  assert.equal(lifeSupportSummary.sashTierClass, "life-support-green");
  assert.deepEqual(lifeSupportSummary.tierSamples, {
    red: "red",
    orangeStart: "orange",
    orangeEnd: "orange",
    green: "green",
  });
  assert.notEqual(
    lifeSupportSummary.tierColors.red,
    lifeSupportSummary.tierColors.orange,
  );
  assert.notEqual(
    lifeSupportSummary.tierColors.orange,
    lifeSupportSummary.tierColors.green,
  );
  assert.notEqual(
    lifeSupportSummary.tierColors.red,
    lifeSupportSummary.tierColors.green,
  );
  assert.equal(
    lifeSupportSummary.sashColor,
    lifeSupportSummary.tierColors.green,
  );
  notes.push(
    "Life Support red, orange, and green tiers checked, including live 125%+ styling",
  );

  const summaryLayout = await page.evaluate(() => {
    const footer = document.querySelector(".compact-summary-footer");
    const stats = [...footer.querySelectorAll(".summary-footer-stat")];
    const emptyStyle = getComputedStyle(stats[0]);
    const lifeStyle = getComputedStyle(
      document.querySelector(".life-support-footer"),
    );
    return {
      statCount: stats.length,
      labels: stats.map((stat) => stat.querySelector("span")?.textContent),
      trackCount: getComputedStyle(footer).gridTemplateColumns
        .split(" ")
        .filter(Boolean).length,
      emptyFlexDirection: emptyStyle.flexDirection,
      lifeFlexDirection: lifeStyle.flexDirection,
      emptyFontSize: emptyStyle.fontSize,
      lifeFontSize: lifeStyle.fontSize,
    };
  });
  assert.deepEqual(summaryLayout, {
    statCount: 4,
    labels: ["Empty tiles:", "Colonists:", "Life Support:", "Credit output (4h):"],
    trackCount: 4,
    emptyFlexDirection: "column",
    lifeFlexDirection: "column",
    emptyFontSize: "10px",
    lifeFontSize: "10px",
  });
  notes.push("Summary footer keeps Credit output on the far right");

  const placementPreviewCoverage = await page.evaluate(() => {
    showEditableColonyUi("SAM");
    activateFreeBuild();
    loadBlank();
    setMode("build:dropPod");

    const board = $("board");
    const wrap = document.querySelector(".map-wrap");
    const boardRect = board.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();

    const outCell = [...board.querySelectorAll(".cell.out")][0];
    const outR = Number(outCell.dataset.r);
    const outC = Number(outCell.dataset.c);
    const outX = boardRect.left + ((outC + 0.5) * boardRect.width) / 28;
    const outY = boardRect.top + ((outR + 0.5) * boardRect.height) / 28;
    wrap.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: outX,
        clientY: outY,
      }),
    );

    const floatingOnGrid = $("floatingPlacementPreview");
    const outShowsInvalid =
      floatingOnGrid?.style.display === "block" &&
      floatingOnGrid.classList.contains("invalid-preview");
    const gridPreviewHidden = $("placementPreview").style.display === "none";

    const outsideX =
      boardRect.left - wrapRect.left > 2
        ? wrapRect.left + 1
        : wrapRect.right - 1;
    const outsideY =
      boardRect.top - wrapRect.top > 2
        ? wrapRect.top + 1
        : wrapRect.bottom - 1;
    wrap.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: outsideX,
        clientY: outsideY,
      }),
    );

    const floating = $("floatingPlacementPreview");
    const floatingShows =
      floating?.style.display === "block" &&
      floating.classList.contains("invalid-preview");

    const cellWidth = boardRect.width / 28;
    const cellHeight = boardRect.height / 28;
    const expectedC = Math.floor((outsideX - boardRect.left) / cellWidth);
    const expectedR = Math.floor((outsideY - boardRect.top) / cellHeight);
    const expectedX =
      boardRect.left - wrapRect.left + expectedC * cellWidth;
    const expectedY =
      boardRect.top - wrapRect.top + expectedR * cellHeight;
    const actualX = parseFloat(
      floating.style.getPropertyValue("--floating-preview-x"),
    );
    const actualY = parseFloat(
      floating.style.getPropertyValue("--floating-preview-y"),
    );
    const outsideSnapsToGrid =
      Math.abs(actualX - expectedX) < 0.01 &&
      Math.abs(actualY - expectedY) < 0.01;

    wrap.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));

    return {
      outShowsInvalid,
      gridPreviewHidden,
      floatingShows,
      outsideSnapsToGrid,
      hiddenAfterLeave:
        $("placementPreview").style.display === "none" &&
        $("floatingPlacementPreview")?.style.display === "none",
    };
  });
  assert.deepEqual(placementPreviewCoverage, {
    outShowsInvalid: true,
    gridPreviewHidden: true,
    floatingShows: true,
    outsideSnapsToGrid: true,
    hiddenAfterLeave: true,
  });
  notes.push(
    "Selected-building hologram stays in the top map overlay and snaps to the grid everywhere",
  );

  const optimizerAvailability = await page.evaluate(() => {
    showEditableColonyUi("SAT");
    const satVisible = getComputedStyle($("optimizeBtn")).display !== "none";
    openOptimizerDialog();
    const satGoalLabel = $("optimizerGoal").selectedOptions[0]?.textContent;
    closeOptimizerDialog();

    showEditableColonyUi("SASH");
    const sashVisible = getComputedStyle($("optimizeBtn")).display !== "none";
    openOptimizerDialog();
    const sashDialogOpen = $("optimizerDialog").open;
    const buildingRowHidden = $("optimizerPrimaryRow").hidden;
    const buildingRowLabel =
      $("optimizerPrimaryRow").querySelector("span")?.textContent;
    const sashGoalLabel = $("optimizerGoal").selectedOptions[0]?.textContent;
    const sashPairs = [...$("optimizerPrimary").options].map((option) => ({
      value: option.value,
      label: option.textContent,
    }));
    closeOptimizerDialog();

    showEditableColonyUi("SAT");
    return {
      satVisible,
      sashVisible,
      sashDialogOpen,
      buildingRowHidden,
      buildingRowLabel,
      satGoalLabel,
      sashGoalLabel,
      sashPairs,
    };
  });
  assert.deepEqual(optimizerAvailability, {
    satVisible: true,
    sashVisible: true,
    sashDialogOpen: true,
    buildingRowHidden: false,
    buildingRowLabel: "Buildings",
    satGoalLabel: "Max credits",
    sashGoalLabel: "Max credits + Life Support",
    sashPairs: [
      {
        value: "scq-fse",
        label: "Simple Crew Quarters + FloraShip Express",
      },
      {
        value: "scq-cce",
        label: "Simple Crew Quarters + CosmicClean Express",
      },
      {
        value: "oq-cce",
        label: "Officers Quarters + CosmicClean Express",
      },
      {
        value: "oq-sesp",
        label: "Officers Quarters + Sit'n'Eat SpacePizza",
      },
    ],
  });
  notes.push("SASH optimizer exposes all four residential + Life Support pairs");

  const sashPairMath = await page.evaluate(() => {
    showEditableColonyUi("SASH");
    const preset = getPresetById("builtin:sash-simple-crew-cosmic");
    const presetStats = sashPairStats(preset.state, "scq-cce");
    return {
      scqFse23: sashMinSupportForResidential("scq-fse", 23),
      scqCce26: sashMinSupportForResidential("scq-cce", 26),
      oqCce8: sashMinSupportForResidential("oq-cce", 8),
      oqSesp9: sashMinSupportForResidential("oq-sesp", 9),
      cosmicPreset: {
        residentialCount: presetStats.residentialCount,
        supportCount: presetStats.supportCount,
        green: presetStats.green,
      },
    };
  });
  assert.deepEqual(sashPairMath, {
    scqFse23: 12,
    scqCce26: 9,
    oqCce8: 8,
    oqSesp9: 5,
    cosmicPreset: {
      residentialCount: 26,
      supportCount: 7,
      green: true,
    },
  });
  notes.push("SASH pair math and the 26 + 7 CosmicClean preset checked");

  const sashExpandedBaselines = await page.evaluate(() => {
    showEditableColonyUi("SASH");
    activateFreeBuild();
    loadBlank();
    setExpansionCount(activeExpansions().length);

    return SASH_OPTIMIZER_PAIRS.map((pair) => {
      const ctx = oxCtx("SASH");
      const residentialDef = eraBoardBuildingByKey(
        "SASH",
        pair.residentialKey,
      );
      const supportDef = eraBoardBuildingByKey("SASH", pair.supportKey);
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
      )
        theoreticalMax--;

      const hubs = oxHubs(ctx, [hubTop, ctx.cfg.defaultHub, [0, 4]]);
      const baseline = sashGreedyExpandedBaseline(
        ctx,
        pair,
        residentialDef,
        supportDef,
        hubs,
        theoreticalMax,
      );
      const stats = baseline ? sashPairStats(baseline.state, pair) : null;
      return {
        id: pair.id,
        valid:
          !!baseline &&
          baseline.state.enabled.length === activeExpansions().length &&
          colonyStateMatchesGeometry(baseline.state, "SASH") &&
          oxValid(ctx, baseline.state) &&
          sashGreenStateUsesPair(baseline.state, pair) &&
          stats.green &&
          stats.credits4h > 0,
        enabled: baseline?.state.enabled.length ?? -1,
        credits4h: stats?.credits4h ?? 0,
      };
    });
  });
  assert.equal(
    sashExpandedBaselines.every((item) => item.valid),
    true,
    `Expanded SASH baseline failed: ${JSON.stringify(sashExpandedBaselines)}`,
  );
  notes.push("All four SASH optimizer choices use all 23 unlocked expansions");

  const sashExpansionGrowth = await page.evaluate(async () => {
    showEditableColonyUi("SASH");
    activateFreeBuild();
    loadBlank();
    const preset = getPresetById("builtin:sash-simple-crew");
    await loadPresetItem(preset);
    activateFreeBuild();
    applyColonyState(preset.state, { preserveCamera: true });

    const before = sashPairStats(currentColonyState(), "scq-fse");
    setExpansionCount(activeExpansions().length);
    const ctx = oxCtx("SASH");
    const grown = sashFillPreviousBuildings(
      ctx,
      currentColonyState(),
      "scq-fse",
    );
    const after = sashPairStats(grown.state, "scq-fse");

    return {
      enabled: grown.state.enabled.length,
      beforeCredits: before.credits4h,
      afterCredits: after.credits4h,
      valid:
        grown.state.enabled.length === activeExpansions().length &&
        after.green &&
        oxValid(ctx, grown.state),
    };
  });
  assert.equal(sashExpansionGrowth.valid, true);
  assert.equal(sashExpansionGrowth.enabled, 23);
  assert.ok(
    sashExpansionGrowth.afterCredits > sashExpansionGrowth.beforeCredits,
    "Unlocking SASH expansions should let the optimizer grow the layout",
  );
  notes.push("SASH layouts grow into newly unlocked expansion land");

  const sashPizzaBlankSearch = await page.evaluate(async () => {
    showEditableColonyUi("SASH");
    activateFreeBuild();
    loadBlank();
    setExpansionCount(activeExpansions().length);

    const ctx = oxCtx("SASH");
    ctx.goal = "maxCredits";
    ctx.primaryKey = "oq-sesp";
    ctx.started = performance.now();
    ctx.lastYield = ctx.started;
    ctx.deadline = ctx.started + 750;
    optimizerCancelRequested = false;

    try {
      const result = await optimizeSashGreen(ctx, "oq-sesp");
      return {
        valid:
          !!result?.state &&
          result.sashGreen?.green &&
          result.state.enabled.length === activeExpansions().length &&
          oxValid(ctx, result.state),
        error: null,
      };
    } catch (error) {
      return { valid: false, error: error?.message || String(error) };
    }
  });
  assert.equal(
    sashPizzaBlankSearch.valid,
    true,
    `Blank expanded OQ + Pizza search failed: ${sashPizzaBlankSearch.error}`,
  );
  notes.push("Blank all-expansion Officers + SpacePizza search returns a valid result");

  const sashEarlierFillers = await page.evaluate(() => {
    showEditableColonyUi("SASH");
    activateFreeBuild();
    loadBlank();

    const ctx = oxCtx("SASH");
    const pair = sashPairFromId("oq-cce");
    const seed = sashKnownStartingFallback(ctx, pair);
    if (!seed) return { valid: false, reason: "missing OQ + Cosmic seed" };

    const before = sashPairStats(seed.state, pair);
    const filled = sashFillPreviousBuildings(ctx, seed.state, pair);
    const after = filled.stats;
    return {
      valid:
        filled.changed &&
        after.green &&
        sashGreenStateUsesPair(filled.state, pair) &&
        oxValid(ctx, filled.state),
      beforeCredits: before.credits4h,
      afterCredits: after.credits4h,
      simpleCrew: after.counts.simpleCrewQuarters || 0,
      flora: after.counts.floraShipExpress || 0,
      officers: after.counts.officersQuarters || 0,
      cosmic: after.counts.cosmicCleanExpress || 0,
    };
  });
  assert.equal(sashEarlierFillers.valid, true);
  assert.ok(sashEarlierFillers.afterCredits > sashEarlierFillers.beforeCredits);
  assert.ok(
    sashEarlierFillers.simpleCrew > 0,
    "OQ + Cosmic optimization should use Simple Crew Quarters as earlier filler",
  );
  assert.ok(
    sashEarlierFillers.flora > 0,
    "OQ + Cosmic optimization should use FloraShip Express as earlier filler",
  );
  notes.push(
    "SASH OQ + Cosmic search reuses earlier Simple Crew and FloraShip fillers",
  );

  const sashSearch = await page.evaluate(async () => {
    showEditableColonyUi("SASH");
    activateFreeBuild();
    loadBlank();
    openOptimizerDialog();
    await runOptimizerDialog();

    const state = optimizerPendingResult?.state || null;
    const stats = state ? sashPairStats(state, "scq-fse") : null;
    const score = state ? oxScore(oxCtx("SASH"), state, "simpleCrewQuarters") : null;
    const text = $("optimizerProgress").textContent;
    const valid =
      !!state &&
      colonyStateMatchesGeometry(state, "SASH") &&
      oxValid(oxCtx("SASH"), state) &&
      sashGreenStateUsesPair(state, "scq-fse");

    closeOptimizerDialog();
    return {
      valid,
      crew: stats?.residentialCount,
      flora: stats?.supportCount,
      colonists: stats?.colonists,
      lifeSupport: stats?.lifeSupport,
      credits4h: stats?.credits4h,
      green: stats?.green,
      unused: score?.unused,
      text,
    };
  });
  assert.equal(
    sashSearch.valid,
    true,
    `SASH optimizer did not produce a usable result: ${sashSearch.text}`,
  );
  assert.deepEqual(
    {
      valid: sashSearch.valid,
      crew: sashSearch.crew,
      flora: sashSearch.flora,
      colonists: sashSearch.colonists,
      lifeSupport: sashSearch.lifeSupport,
      credits4h: sashSearch.credits4h,
      green: sashSearch.green,
      unused: sashSearch.unused,
    },
    {
      valid: true,
      crew: 23,
      flora: 12,
      colonists: 3151,
      lifeSupport: 4032,
      credits4h: 50140,
      green: true,
      unused: 17,
    },
  );
  assert.match(sashSearch.text, /127\.96% Life Support/);
  notes.push("Starting SASH search returns 23 Crew + 12 Flora at green Life Support");

  await page.evaluate(() => {
    showEditableColonyUi("SASH");
    setMode(null);
  });
  const firstSashCell = page.locator("#board .cell:not(.out)").first();
  await firstSashCell.evaluate((cell) => {
    cell.focus();
    cell.click();
  });
  await page.keyboard.press("m");
  const shortcutFocus = await page.evaluate(() => ({
    keyboardNavigation: $("board").classList.contains("keyboard-navigation"),
    focusedCell: document.activeElement?.classList?.contains("cell") || false,
    outlineStyle: document.activeElement?.classList?.contains("cell")
      ? getComputedStyle(document.activeElement).outlineStyle
      : "none",
  }));
  assert.equal(shortcutFocus.keyboardNavigation, false);
  assert.equal(shortcutFocus.outlineStyle, "none");

  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() => $("board").classList.contains("keyboard-navigation")),
    true,
  );
  notes.push("Move shortcut does not expose a stray grid focus box");

  const undo = await page.evaluate(async () => {
    showEditableColonyUi("SAM");
    loadBlank();
    snapshot();
    showEditableColonyUi("SAT");
    const acrossEra = history.length;
    await loadPresetItem(getPresetCatalog()[0]);
    const acrossPreset = history.length;
    activateFreeBuild();
    const acrossFree = history.length;
    snapshot();
    clearPlacedObjects();
    restore(history.pop());
    return {
      acrossEra,
      acrossPreset,
      acrossFree,
      valid: colonyStateMatchesGeometry(currentColonyState(), "SAT"),
    };
  });
  assert.deepEqual(undo, {
    acrossEra: 0,
    acrossPreset: 0,
    acrossFree: 0,
    valid: true,
  });
  notes.push("Undo stays within the active era and layout");
  const expansions = await page.evaluate(async () => {
    const errors = [];
    for (const era of Object.keys(ERA_DATA)) {
      showEditableColonyUi(era);
      activateFreeBuild();
      loadBlank();
      setExpansionCount(activeExpansions().length);
      const expanded = getPresetCatalog().find(
        (p) => p.state.enabled.length === activeExpansions().length,
      );
      if (expanded) await loadPresetItem(expanded);
      setExpansionCount(0);
      if (!colonyStateMatchesGeometry(currentColonyState(), era))
        errors.push(era);
    }
    return errors;
  });
  assert.deepEqual(expansions, []);
  notes.push("Removing expansions leaves valid colonies in all eras");
  // Use a deterministic result to isolate the dialog comparison from the search algorithm.
  const comparison = await page.evaluate(async () => {
    showEditableColonyUi("SAT");
    activateFreeBuild();
    loadBlank();
    addKnownBuilding("screenedDomicile", 0, 8);
    render();
    const original = optimizeColonyV2;
    const low = { ...currentColonyState(), buildings: [], grid: baseGrid() };
    for (const [r, c] of hubCells(...hubTop)) low.grid[r][c] = "hub";
    optimizeColonyV2 = async () => ({
      state: low,
      cancelled: false,
      tested: 1,
    });
    openOptimizerDialog();
    $("optimizerPrimary").value = "igloo";
    await runOptimizerDialog();
    const pending = optimizerPendingResult;
    closeOptimizerDialog();
    optimizeColonyV2 = original;
    return { pending, text: $("optimizerProgress").textContent };
  });
  assert.equal(comparison.pending, null);
  assert.match(comparison.text, /No higher-credit/);
  notes.push(
    "Lower-credit results rejected even when the existing building is outside the search selection",
  );
  const editedPreset = await page.evaluate(async () => {
    showEditableColonyUi("SAT");
    await loadPresetItem(getPresetCatalog()[0]);
    const first = buildings[0];
    eraseAt(first.r, first.c);
    persistColonyState();
    const before = buildings.length;
    showEditableColonyUi("SAM");
    showEditableColonyUi("SAT");
    return {
      before,
      after: buildings.length,
      valid: colonyStateMatchesGeometry(currentColonyState(), "SAT"),
    };
  });
  assert.equal(editedPreset.before, editedPreset.after);
  assert.equal(editedPreset.valid, true);
  notes.push("Edits to built-in presets survive switching eras");
  // Full real search on a pathless colony, then apply and undo.
  await page.evaluate(() => {
    activateFreeBuild();
    loadBlank();
    openOptimizerDialog();
    $("optimizerPrimary").value = "igloo";
  });
  await page.click("#optimizerRunBtn");
  await page.waitForFunction(() => !optimizerRunning, {}, { timeout: 70000 });
  assert.equal(await page.evaluate(() => !!optimizerPendingResult), true);
  await page.click("#optimizerRunBtn");
  assert.equal(
    await page.evaluate(() =>
      colonyStateMatchesGeometry(currentColonyState(), selectedEra),
    ),
    true,
  );
  await page.evaluate(() => restore(history.pop()));
  assert.equal(await page.evaluate(() => buildings.length), 0);
  notes.push("Real Titan search, apply, and Undo passed");
  // Native Escape must cancel the task too.
  await page.evaluate(() => openOptimizerDialog());
  await page.click("#optimizerRunBtn");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !optimizerRunning, {}, { timeout: 15000 });
  assert.equal(await page.evaluate(() => optimizerPendingResult), null);
  await page.evaluate(() => closeOptimizerDialog());
  notes.push("Escape cancels a running search");
  // Import a distinguishable Mars save. The pagehide save must not overwrite it.
  const backup = await page.evaluate(() => {
    showEditableColonyUi("SAM");
    loadBlank();
    addKnownBuilding("dropPod", 4, 10);
    render();
    persistColonyState();
    return JSON.stringify({
      format: "foe-colony-planner-backup",
      workspace: cloneState(workspace),
    });
  });
  await page.evaluate(() => {
    clearPlacedObjects();
    persistColonyState();
    setAppPage("settings");
  });
  await page
    .locator("#plannerBackupFile")
    .setInputFiles({
      name: "test-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
  await page.locator("#appDialogConfirm").click();
  await page.waitForFunction(
    () =>
      !document.body.hasAttribute("aria-busy") &&
      buildings.some((b) => b.type === "dropPod"),
  );
  assert.equal(
    await page.evaluate(
      () => buildings.filter((b) => b.type === "dropPod").length,
    ),
    1,
  );
  notes.push("Imported backup survives reload and pagehide");
  const roadResult = await page.evaluate(async () => {
    showEditableColonyUi("SAM");
    activateFreeBuild();
    loadBlank();
    openOptimizerDialog();
    $("optimizerPrimary").value = "simpleShelter";
    await runOptimizerDialog();
    const state = optimizerPendingResult?.state;
    const valid =
      !!state &&
      colonyStateMatchesGeometry(state, "SAM") &&
      oxValid(oxCtx("SAM"), state);
    closeOptimizerDialog();
    return valid;
  });
  assert.equal(roadResult, true);
  notes.push("Real Mars search returns a layout with connected paths");
  // Corrupted JSON is kept intact so a failed load cannot destroy the original save.
  const broken = await browser.newPage();
  await broken.addInitScript(() =>
    localStorage.setItem("foe-colony-optimizer-workspace-v2", "{broken"),
  );
  await broken.goto(base);
  await broken.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  assert.equal(
    await broken.evaluate(() => localStorage.getItem(STORAGE_KEY)),
    "{broken",
  );
  assert.equal(await broken.locator("#storageFailureBanner").count(), 1);
  await broken.close();
  notes.push("Unreadable saves are preserved and show a recovery message");
  // Inspect desktop and narrow layouts and keyboard placement.
  await page.locator('.era-btn[data-era="SAM"]').click();
  await page.screenshot({
    path: process.env.PLANNER_SCREENSHOT_DIR
      ? path.join(process.env.PLANNER_SCREENSHOT_DIR, "planner-desktop.png")
      : "/tmp/planner-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#optimizeBtn");
  assert.equal(
    await page
      .locator("#optimizerDialog")
      .evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth),
    true,
  );
  await page.screenshot({
    path: process.env.PLANNER_SCREENSHOT_DIR
      ? path.join(process.env.PLANNER_SCREENSHOT_DIR, "planner-mobile.png")
      : "/tmp/planner-mobile.png",
  });
  notes.push("Desktop and narrow dialog layouts checked");
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok: true, notes }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
