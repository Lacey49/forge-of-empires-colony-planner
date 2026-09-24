import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repo = path.resolve(".");
const read = (relative) => fs.readFileSync(path.join(repo, relative), "utf8");
const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function extractConst(source, name) {
  const marker =
    source.match(new RegExp(`const ${name}\\s*=\\s*`))?.[0] || `const ${name}=`;
  const start = source.indexOf(marker);
  check(start >= 0, `Missing ${name}`);
  if (start < 0) return null;

  const cursor = start + marker.length;
  const opening = source[cursor];
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : null;
  check(Boolean(closing), `${name} does not begin with an object or array`);
  if (!closing) return null;

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = cursor; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === opening) depth++;
    else if (char === closing) {
      depth--;
      if (depth === 0) return source.slice(cursor, i + 1);
    }
  }
  failures.push(`Could not find the end of ${name}`);
  return null;
}

const html = read("index.html");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [
  ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
];
check(
  duplicateIds.length === 0,
  `Duplicate HTML ids: ${duplicateIds.join(", ")}`,
);
notes.push(`${ids.length} HTML ids checked`);

const references = [
  ...html.matchAll(/(?:src|href)="(\.\/[^"?#$]+)[^"]*"/g),
].map((match) => match[1]);
const missingReferences = [...new Set(references)].filter(
  (reference) => !fs.existsSync(path.resolve(repo, reference)),
);
check(
  missingReferences.length === 0,
  `index.html has missing static references: ${missingReferences.join(", ")}`,
);
notes.push(`${new Set(references).size} static references checked`);

const eraLiteral = extractConst(read("data/buildings.js"), "ERA_DATA");
let parsedEras = null;
if (eraLiteral) {
  const eras = vm.runInNewContext(`(${eraLiteral})`);
  parsedEras = eras;
  let definitionCount = 0;
  for (const [era, data] of Object.entries(eras)) {
    const keys = new Set();
    const definitions = [
      data.townHall,
      ...data.residential,
      ...data.goods,
      ...data.lifeSupport,
    ];
    for (const definition of definitions) {
      definitionCount++;
      check(
        Number.isInteger(definition.w) && definition.w > 0,
        `${era}/${definition.name}: invalid width`,
      );
      check(
        Number.isInteger(definition.h) && definition.h > 0,
        `${era}/${definition.name}: invalid height`,
      );
      check(
        definition.sizeText === `${definition.w}×${definition.h}`,
        `${era}/${definition.name}: sizeText does not match width and height`,
      );
      if (definition.key) {
        check(
          !keys.has(definition.key),
          `${era}: duplicate building key ${definition.key}`,
        );
        keys.add(definition.key);
      }
      if (definition.sprite) {
        check(
          fs.existsSync(path.resolve(repo, definition.sprite)),
          `${era}/${definition.name}: missing sprite ${definition.sprite}`,
        );
      }
    }
    if (data.path.sprite) {
      check(
        fs.existsSync(path.resolve(repo, data.path.sprite)),
        `${era}/${data.path.name}: missing path sprite ${data.path.sprite}`,
      );
    }
  }
  notes.push(
    `${Object.keys(eras).length} eras and ${definitionCount} building definitions checked`,
  );
}

const scriptDirs = ["optimizer", "presets", "app", "data"];
const scripts = scriptDirs.flatMap((dir) =>
  fs
    .readdirSync(path.join(repo, dir))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `${dir}/${name}`),
);

for (const script of scripts) {
  try {
    new vm.Script(read(script), { filename: script });
  } catch (error) {
    failures.push(`${script}: ${error.message}`);
  }
}
notes.push(`${scripts.length} JavaScript files parsed`);

const inlineScripts = [
  ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .filter(
    (match) => !/type\s*=\s*["']application\/ld\+json["']/i.test(match[1]),
  )
  .map((match) => match[2])
  .filter((source) => source.trim());
for (let i = 0; i < inlineScripts.length; i++) {
  try {
    new vm.Script(inlineScripts[i], {
      filename: `index.html inline script ${i + 1}`,
    });
  } catch (error) {
    failures.push(`index.html inline script ${i + 1}: ${error.message}`);
  }
}
notes.push(`${inlineScripts.length} inline JavaScript blocks parsed`);

function testSatGeometryAndPresets() {
  const satConfig = { baseChunks: [], expansions: [], defaultHub: [0, 0] };
  const geometryContext = {
    window: {},
    COLONY_CONFIGS: { SAT: satConfig },
    PENDING_MAX_FOOTPRINTS: { SAT: [] },
  };

  try {
    vm.runInNewContext(read("data/titan-land.js"), geometryContext, {
      filename: "data/titan-land.js",
    });
  } catch (error) {
    failures.push(`SAT geometry runtime check failed: ${error.message}`);
    return;
  }

  check(
    satConfig.baseChunks.length === 18,
    `SAT should have 18 starting plots, found ${satConfig.baseChunks.length}`,
  );
  check(
    satConfig.expansions.length === 23,
    `SAT should have 23 expansions, found ${satConfig.expansions.length}`,
  );

  const plotKeys = new Set([
    ...satConfig.baseChunks.map(([br, bc]) => `${br},${bc}`),
    ...satConfig.expansions.map(({ br, bc }) => `${br},${bc}`),
  ]);
  check(
    plotKeys.size === 41,
    `SAT should have 41 unique plots, found ${plotKeys.size}`,
  );
  check(
    satConfig.defaultHub[0] === 8 && satConfig.defaultHub[1] === 4,
    `SAT default Town Hall should start at 8,4, found ${satConfig.defaultHub.join(",")}`,
  );

  const baseSet = new Set(
    satConfig.baseChunks.map(([br, bc]) => `${br},${bc}`),
  );
  const expansionByChunk = new Map(
    satConfig.expansions.map((exp) => [`${exp.br},${exp.bc}`, exp]),
  );
  const colonyConfigCellState = (_era, r, c, enabledSet) => {
    if (r < 0 || r >= 28 || c < 0 || c >= 28) return "out";
    const key = `${Math.floor(r / 4)},${Math.floor(c / 4)}`;
    if (baseSet.has(key)) return "empty";
    const exp = expansionByChunk.get(key);
    if (!exp) return "out";
    return enabledSet.has(exp.id) ? "empty" : "future";
  };

  const defs = {
    igloo: { key: "igloo", name: "Igloo", w: 3, h: 3 },
    screenedDomicile: {
      key: "screenedDomicile",
      name: "Screened Domicile",
      w: 4,
      h: 4,
    },
  };
  const presetContext = {
    window: {},
    selectedEra: "SAT",
    COLONY_CONFIGS: geometryContext.COLONY_CONFIGS,
    ERA_DATA: { SAT: { townHall: { w: 5, h: 5 } } },
    colonyConfigCellState,
    eraBoardBuildingByKey: (_era, key) => defs[key] || null,
    getPresetCatalog: () => [
      { id: "builtin:sat-igloos", kind: "Built-in" },
      { id: "builtin:sat-screened-domiciles", kind: "Built-in" },
      { id: "custom:test", kind: "Saved", state: {} },
    ],
  };

  try {
    vm.runInNewContext(read("presets/sat-presets.js"), presetContext, {
      filename: "presets/sat-presets.js",
    });
    const catalog = presetContext.getPresetCatalog();
    const builtins = catalog.filter((item) =>
      String(item?.id || "").startsWith("builtin:sat-"),
    );
    check(
      builtins.length === 3,
      `SAT should expose 3 corrected built-in presets, found ${builtins.length}`,
    );

    const expected = new Map([
      ["builtin:sat-igloos", { igloo: 25, screenedDomicile: 0, expansions: 0 }],
      [
        "builtin:sat-screened-domiciles",
        { igloo: 3, screenedDomicile: 14, expansions: 0 },
      ],
      [
        "builtin:sat-screened-domiciles-all",
        { igloo: 3, screenedDomicile: 37, expansions: 23 },
      ],
    ]);

    for (const preset of builtins) {
      const want = expected.get(preset.id);
      check(Boolean(want), `Unexpected SAT preset ${preset.id}`);
      if (!want) continue;
      const counts = { igloo: 0, screenedDomicile: 0 };
      for (const building of preset.state?.buildings || []) {
        if (building.type in counts) counts[building.type]++;
      }
      check(
        counts.igloo === want.igloo,
        `${preset.id}: expected ${want.igloo} Igloos, found ${counts.igloo}`,
      );
      check(
        counts.screenedDomicile === want.screenedDomicile,
        `${preset.id}: expected ${want.screenedDomicile} Screened Domiciles, found ${counts.screenedDomicile}`,
      );
      check(
        (preset.state?.enabled || []).length === want.expansions,
        `${preset.id}: expected ${want.expansions} expansions`,
      );
    }
  } catch (error) {
    failures.push(`SAT preset runtime check failed: ${error.message}`);
  }

  notes.push(
    "SAT geometry: 18 starting plots, 23 expansions, and corrected presets checked",
  );
}

function testSatBuildingOrientations() {
  if (!parsedEras?.SAT) {
    failures.push("SAT building orientation check could not load ERA_DATA");
    return;
  }

  const context = {
    window: {},
    ERA_DATA: JSON.parse(JSON.stringify(parsedEras)),
    workspace: { eras: { SAT: null } },
    selectedEra: "SAM",
    colonyConfigCellState: () => "empty",
    applyColonyState: () => true,
    renderBuildMenu: () => {},
    render: () => {},
    saveWorkspace: () => {},
  };

  try {
    vm.runInNewContext(read("data/titan-save-migration.js"), context, {
      filename: "data/titan-save-migration.js",
    });
  } catch (error) {
    failures.push(
      `SAT building orientation runtime check failed: ${error.message}`,
    );
    return;
  }

  const expected = new Map([
    ["matterCompressionReactor", [4, 6]],
    ["moleculeDrill", [6, 4]],
    ["experimentalTestSite", [5, 4]],
    ["purificationFacility", [4, 5]],
    ["chemicalCleaningPlant", [3, 6]],
  ]);

  for (const def of context.ERA_DATA.SAT.goods) {
    const want = expected.get(def.key);
    if (!want) continue;
    check(
      def.w === want[0] && def.h === want[1],
      `${def.name}: expected planner orientation ${want[0]}×${want[1]}, found ${def.w}×${def.h}`,
    );
    check(
      def.sizeText === `${want[0]}×${want[1]}`,
      `${def.name}: size label should be ${want[0]}×${want[1]}`,
    );
    check(
      def.requiresPath === false,
      `${def.name}: SAT goods must not require a path`,
    );
  }

  for (const def of context.ERA_DATA.SAT.residential) {
    check(
      def.requiresPath === false,
      `${def.name}: SAT residential buildings must not require a path`,
    );
  }

  notes.push("SAT goods orientations and no-path metadata checked");
}

function testSashGeometryAndPresets() {
  if (!parsedEras?.SASH) {
    failures.push("SASH geometry check could not load ERA_DATA");
    return;
  }

  const layouts = read("data/layouts.js");
  const baseLiteral = extractConst(layouts, "SASH_BASE_CHUNKS");
  const expansionLiteral = extractConst(layouts, "SASH_EXPANSIONS");
  const maxLiteral = extractConst(layouts, "SASH_MAX_CHUNKS");
  if (!baseLiteral || !expansionLiteral || !maxLiteral) return;

  const base = vm.runInNewContext(`(${baseLiteral})`);
  const expansions = vm.runInNewContext(`(${expansionLiteral})`);
  const max = vm.runInNewContext(`(${maxLiteral})`);

  check(
    base.length === 18,
    `SASH should have 18 starting plots, found ${base.length}`,
  );
  check(
    expansions.length === 23,
    `SASH should have 23 expansions, found ${expansions.length}`,
  );
  check(
    max.length === 41,
    `SASH should have 41 total plots, found ${max.length}`,
  );

  const actualBase = new Set(base.map(([br, bc]) => `${br},${bc}`));
  const actualExpansions = new Set(
    expansions.map(({ br, bc }) => `${br},${bc}`),
  );
  const actualMax = new Set(max.map(([br, bc]) => `${br},${bc}`));
  const expectedBase = new Set([
    "0,1", "0,2", "0,3", "0,4",
    "1,1", "1,2", "1,3", "1,4",
    "2,0", "2,1", "2,2", "2,3",
    "3,0", "3,1", "3,2",
    "4,0", "4,1", "4,2",
  ]);
  const expectedExpansions = new Set([
    "0,5", "1,5",
    "2,4", "2,5", "2,6",
    "3,3", "3,4", "3,5", "3,6",
    "4,3", "4,4", "4,5", "4,6",
    "5,1", "5,2", "5,3", "5,4", "5,5",
    "6,1", "6,2", "6,3", "6,4", "6,5",
  ]);

  check(
    [...expectedBase].every((key) => actualBase.has(key)) &&
      actualBase.size === expectedBase.size,
    "SASH starting-plot shape does not match the verified colony grid",
  );
  check(
    [...expectedExpansions].every((key) => actualExpansions.has(key)) &&
      actualExpansions.size === expectedExpansions.size,
    "SASH expansion shape does not match the verified colony grid",
  );
  check(
    actualMax.size === 41 &&
      [...actualBase, ...actualExpansions].every((key) => actualMax.has(key)),
    "SASH full footprint does not match starting plots plus expansions",
  );

  const hall = parsedEras.SASH.townHall;
  check(
    hall.w === 5 && hall.h === 5 && hall.sizeText === "5×5",
    `SASH Town Hall should be 5×5, found ${hall.w}×${hall.h}`,
  );

  const simpleCrew = parsedEras.SASH.residential.find(
    (def) => def.key === "simpleCrewQuarters",
  );
  check(Boolean(simpleCrew), "Missing SASH Simple Crew Quarters");
  if (simpleCrew) {
    check(
      simpleCrew.w === 2 &&
        simpleCrew.h === 3 &&
        simpleCrew.sizeText === "2×3",
      `Simple Crew Quarters should be 2×3, found ${simpleCrew.w}×${simpleCrew.h}`,
    );
  }

  const sashOrientations = new Map([
    ["simpleCrewQuarters", [2, 3]],
    ["enhancedCrewQuarters", [3, 4]],
    ["officersQuarters", [4, 4]],
    ["crystalCrafter", [5, 4]],
    ["photonosphereHarvester", [5, 5]],
    ["aeroFusionPlant", [5, 5]],
    ["deepSpaceDataConverter", [5, 5]],
    ["fmmManufacture", [4, 5]],
    ["floraShipExpress", [3, 3]],
    ["cosmicCleanExpress", [3, 4]],
    ["sitEatSpacePizza", [4, 4]],
  ]);
  const sashDefs = [
    ...parsedEras.SASH.residential,
    ...parsedEras.SASH.goods,
    ...parsedEras.SASH.lifeSupport,
  ];
  for (const def of sashDefs) {
    const want = sashOrientations.get(def.key);
    if (!want) continue;
    check(
      def.w === want[0] &&
        def.h === want[1] &&
        def.sizeText === `${want[0]}×${want[1]}`,
      `${def.name}: expected SASH planner orientation ${want[0]}×${want[1]}, found ${def.w}×${def.h}`,
    );
  }

  const simplePreset = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_SIMPLE_PRESET_BUILDINGS")})`,
  );
  const simpleLifeSupport = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_SIMPLE_PRESET_LIFE_SUPPORT")})`,
  );
  const simpleCosmicHub = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_SIMPLE_COSMIC_PRESET_HUB")})`,
  );
  const simpleCosmicPreset = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_SIMPLE_COSMIC_PRESET_BUILDINGS")})`,
  );
  const simpleCosmicFlora = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_SIMPLE_COSMIC_PRESET_FLORA")})`,
  );
  const simpleCosmicLifeSupport = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_SIMPLE_COSMIC_PRESET_LIFE_SUPPORT")})`,
  );
  const officerPreset = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_OFFICER_PRESET_BUILDINGS")})`,
  );
  const officerFillers = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_OFFICER_PRESET_FILLERS")})`,
  );
  const officerAll = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_OFFICER_ALL_PRESET_BUILDINGS")})`,
  );
  const officerAllFillers = vm.runInNewContext(
    `(${extractConst(layouts, "SASH_OFFICER_ALL_PRESET_FILLERS")})`,
  );

  check(
    simplePreset.length === 23 && simpleLifeSupport.length === 12,
    `SASH starting preset should contain 23 Simple Crew Quarters and 12 FloraShip Expresses, found ${simplePreset.length} + ${simpleLifeSupport.length}`,
  );

  const exactSimpleCrew = [
    [5, 16], [5, 18],
    [6, 12], [6, 14],
    [8, 0], [8, 2],
    [9, 12], [9, 14],
    [11, 0], [11, 2], [11, 4],
    [14, 0], [14, 2], [14, 4], [14, 6], [14, 8], [14, 10],
    [17, 0], [17, 2], [17, 4], [17, 6], [17, 8], [17, 10],
  ];
  const exactSimpleFlora = [
    [0, 4], [0, 7], [0, 10], [0, 13], [0, 16],
    [3, 4], [3, 7], [3, 10], [3, 13],
    [8, 9],
    [11, 6], [11, 9],
  ];
  check(
    JSON.stringify(simplePreset) === JSON.stringify(exactSimpleCrew),
    "SASH FloraShip preset Simple Crew coordinates changed from the verified screenshot",
  );
  check(
    JSON.stringify(simpleLifeSupport) === JSON.stringify(exactSimpleFlora),
    "SASH FloraShip preset Life Support coordinates changed from the verified screenshot",
  );
  check(
    simpleCosmicPreset.length === 26 &&
      simpleCosmicFlora.length === 2 &&
      simpleCosmicLifeSupport.length === 7,
    `SASH CosmicClean preset should contain 26 Simple Crew Quarters, 2 FloraShip Expresses, and 7 CosmicClean Expresses, found ${simpleCosmicPreset.length} + ${simpleCosmicFlora.length} + ${simpleCosmicLifeSupport.length}`,
  );

  const exactCosmicCrew = [
    [0, 7],
    [2, 9],
    [3, 7],
    [5, 9],
    [8, 0], [8, 2], [8, 9], [8, 11],
    [11, 0], [11, 2], [11, 4], [11, 6], [11, 8], [11, 10],
    [14, 0], [14, 2], [14, 4], [14, 6], [14, 8], [14, 10],
    [17, 0], [17, 2], [17, 4], [17, 6], [17, 8], [17, 10],
  ];
  const exactCosmicFlora = [[0, 4], [3, 4]];
  const exactCosmicClean = [
    [0, 11], [0, 14], [0, 17],
    [4, 11], [4, 14], [4, 17],
    [8, 13],
  ];
  check(
    JSON.stringify(simpleCosmicHub) === JSON.stringify([6, 4]),
    "SASH CosmicClean preset Town Hall moved from the verified screenshot",
  );
  check(
    JSON.stringify(simpleCosmicPreset) === JSON.stringify(exactCosmicCrew),
    "SASH CosmicClean preset Simple Crew coordinates changed from the verified screenshot",
  );
  check(
    JSON.stringify(simpleCosmicFlora) === JSON.stringify(exactCosmicFlora),
    "SASH CosmicClean preset FloraShip coordinates changed from the verified screenshot",
  );
  check(
    JSON.stringify(simpleCosmicLifeSupport) === JSON.stringify(exactCosmicClean),
    "SASH CosmicClean preset CosmicClean coordinates changed from the verified screenshot",
  );

  const plannerSource = read("app/planner.js");
  check(
    plannerSource.includes('name: "Simple Crew Quarters (23) + FloraShip Express (12)"'),
    "Exact first SASH preset title changed",
  );
  check(
    plannerSource.includes('name: "Simple Crew Quarters (26) + CosmicClean Express (7)"'),
    "Exact second SASH preset title changed",
  );
  check(
    officerPreset.length === 14 && officerFillers.length === 5,
    "SASH starting Officers preset should contain 14 Officers Quarters and 5 Simple Crew fillers",
  );
  check(
    officerAll.length === 37 && officerAllFillers.length === 5,
    "SASH all-expansion Officers preset should contain 37 Officers Quarters and 5 Simple Crew fillers",
  );

  check(
    !fs.existsSync(path.join(repo, "presets/sash-presets.js")),
    "Obsolete SASH preset override still exists",
  );
  check(
    !html.includes("presets/sash-presets.js"),
    "index.html still loads the obsolete SASH preset override",
  );

  notes.push(
    "SASH geometry and verified building orientations checked",
  );
}

testSatGeometryAndPresets();
testSatBuildingOrientations();
testSashGeometryAndPresets();

check(
  !fs.existsSync(path.join(repo, "download.html")),
  "Obsolete standalone download page still exists",
);
const standaloneFiles = fs
  .readdirSync(repo)
  .filter((name) => /^forge-of-empires-colony-planner-v.*\.html$/i.test(name));
check(
  standaloneFiles.length === 0,
  `Obsolete standalone planner files remain: ${standaloneFiles.join(", ")}`,
);
notes.push("Standalone download files checked");

console.log(
  JSON.stringify({ ok: failures.length === 0, notes, failures }, null, 2),
);
process.exitCode = failures.length ? 1 : 0;
