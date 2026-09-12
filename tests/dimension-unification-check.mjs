import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const failures = [];

function extractConst(source, name) {
  const marker =
    source.match(new RegExp(`const ${name}\\s*=\\s*`))?.[0] || `const ${name}=`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name}`);
  const cursor = start + marker.length;
  const opening = source[cursor];
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : null;
  if (!closing) throw new Error(`${name} is not an object or array`);
  let depth = 0,
    quote = null,
    escaped = false;
  for (let i = cursor; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === opening) depth++;
    else if (ch === closing && --depth === 0)
      return source.slice(cursor, i + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

const ERA_DATA = vm.runInNewContext(
  fs.readFileSync("data/buildings.js", "utf8") + "; ERA_DATA",
);

function allDefs() {
  return Object.values(ERA_DATA).flatMap((era) =>
    [era.townHall, ...era.residential, ...era.goods, ...era.lifeSupport].filter(
      Boolean,
    ),
  );
}

function eraBuildingByKey(era, key) {
  const data = ERA_DATA[era];
  if (!data) return null;
  if (data.townHall?.key === key) return data.townHall;
  return (
    [...data.residential, ...data.goods, ...data.lifeSupport].find(
      (def) => def.key === key,
    ) || null
  );
}

const context = {
  window: {},
  ERA_DATA,
  eraBuildingByKey,
  boardBuildingDef: (def) => def || null,
  eraBoardBuildingByKey: (era, key) => {
    const def = eraBuildingByKey(era, key);
    return def || null;
  },
  workspace: { eras: { SAT: null } },
  selectedEra: "SAM",
  colonyConfigCellState: () => "empty",
  applyColonyState: () => true,
  renderBuildMenu: () => {},
  render: () => {},
  saveWorkspace: () => {},
};

vm.runInNewContext(
  fs.readFileSync("data/titan-save-migration.js", "utf8"),
  context,
  { filename: "data/titan-save-migration.js" },
);

const expected = new Map([
  ["heatedResidence", [4, 3]],
  ["matterCompressionReactor", [4, 6]],
  ["moleculeDrill", [6, 4]],
  ["experimentalTestSite", [5, 4]],
  ["purificationFacility", [4, 5]],
  ["chemicalCleaningPlant", [3, 6]],
  ["hotChocolateBar", [4, 3]],
]);

for (const [key, [w, h]] of expected) {
  const def = eraBuildingByKey("SAT", key);
  if (!def) {
    failures.push(`Missing SAT building ${key}`);
    continue;
  }
  if (def.w !== w || def.h !== h)
    failures.push(`${key}: ${def.w}×${def.h}, expected ${w}×${h}`);
  if (def.sizeText !== `${w}×${h}`)
    failures.push(`${key}: label ${def.sizeText}, expected ${w}×${h}`);
  if (
    Object.prototype.hasOwnProperty.call(def, "boardW") ||
    Object.prototype.hasOwnProperty.call(def, "boardH")
  ) {
    failures.push(`${key}: duplicate board dimensions were recreated`);
  }
  const boardDef = context.eraBoardBuildingByKey("SAT", key);
  if (boardDef.w !== w || boardDef.h !== h)
    failures.push(`${key}: board lookup does not use unified w/h`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: "all building definitions plus verified SAT orientations",
    },
    null,
    2,
  ),
);
