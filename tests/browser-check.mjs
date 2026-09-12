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
