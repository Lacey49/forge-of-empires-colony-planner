import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repo = path.resolve('.');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8');
const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function extractConst(source, name) {
  const marker = `const ${name}=`;
  const start = source.indexOf(marker);
  check(start >= 0, `Missing ${name}`);
  if (start < 0) return null;

  const cursor = start + marker.length;
  const opening = source[cursor];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : null;
  check(Boolean(closing), `${name} does not begin with an object or array`);
  if (!closing) return null;

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = cursor; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
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

const html = read('index.html');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
check(duplicateIds.length === 0, `Duplicate HTML ids: ${duplicateIds.join(', ')}`);
notes.push(`${ids.length} HTML ids checked`);

const references = [...html.matchAll(/(?:src|href)="(\.\/[^"?#$]+)[^"]*"/g)]
  .map(match => match[1]);
const missingReferences = [...new Set(references)].filter(reference =>
  !fs.existsSync(path.resolve(repo, reference))
);
check(missingReferences.length === 0, `index.html has missing static references: ${missingReferences.join(', ')}`);
notes.push(`${new Set(references).size} static references checked`);

const eraLiteral = extractConst(html, 'ERA_DATA');
let parsedEras = null;
if (eraLiteral) {
  const eras = JSON.parse(eraLiteral);
  parsedEras = eras;
  let definitionCount = 0;
  for (const [era, data] of Object.entries(eras)) {
    const keys = new Set();
    const definitions = [data.townHall, ...data.residential, ...data.goods, ...data.lifeSupport];
    for (const definition of definitions) {
      definitionCount++;
      check(Number.isInteger(definition.w) && definition.w > 0, `${era}/${definition.name}: invalid width`);
      check(Number.isInteger(definition.h) && definition.h > 0, `${era}/${definition.name}: invalid height`);
      check(
        definition.sizeText === `${definition.w}×${definition.h}`,
        `${era}/${definition.name}: sizeText does not match width and height`
      );
      if (definition.key) {
        check(!keys.has(definition.key), `${era}: duplicate building key ${definition.key}`);
        keys.add(definition.key);
      }
      if (definition.sprite) {
        check(
          fs.existsSync(path.resolve(repo, definition.sprite)),
          `${era}/${definition.name}: missing sprite ${definition.sprite}`
        );
      }
    }
    if (data.path.sprite) {
      check(
        fs.existsSync(path.resolve(repo, data.path.sprite)),
        `${era}/${data.path.name}: missing path sprite ${data.path.sprite}`
      );
    }
  }
  notes.push(`${Object.keys(eras).length} eras and ${definitionCount} building definitions checked`);
}

const loader = read('assets/js/optimizer.js');
const moduleReferences = [...loader.matchAll(/["'](.+?\.js(?:\?v=\d+)?)["']/g)]
  .map(match => match[1])
  .filter(reference => reference.startsWith('./'));
for (const reference of moduleReferences) {
  const clean = reference.split('?')[0];
  check(fs.existsSync(path.resolve(repo, clean)), `Optimizer loader target is missing: ${clean}`);
}
notes.push(`${moduleReferences.length} optimizer loader targets checked`);

const scriptDirs = ['optimizer','presets','site'];
const scripts = [
  ...scriptDirs.flatMap(dir => fs.readdirSync(path.join(repo, dir)).map(name => `${dir}/${name}`)),
  'assets/js/optimizer.js'
].filter(name => name.endsWith('.js'));

for (const script of scripts) {
  try {
    new vm.Script(read(script), {filename: script});
  } catch (error) {
    failures.push(`${script}: ${error.message}`);
  }
}
notes.push(`${scripts.length} JavaScript files parsed`);

const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1]))
  .filter(match => !/type\s*=\s*["']application\/ld\+json["']/i.test(match[1]))
  .map(match => match[2])
  .filter(source => source.trim());
for (let i = 0; i < inlineScripts.length; i++) {
  try {
    new vm.Script(inlineScripts[i], {filename:`index.html inline script ${i + 1}`});
  } catch (error) {
    failures.push(`index.html inline script ${i + 1}: ${error.message}`);
  }
}
notes.push(`${inlineScripts.length} inline JavaScript blocks parsed`);

function testSatGeometryAndPresets() {
  const satConfig = {baseChunks:[], expansions:[], defaultHub:[0,0]};
  const geometryContext = {
    window:{},
    COLONY_CONFIGS:{SAT:satConfig},
    PENDING_MAX_FOOTPRINTS:{SAT:[]}
  };

  try {
    vm.runInNewContext(read('site/sat-geometry.js'), geometryContext, {filename:'site/sat-geometry.js'});
  } catch (error) {
    failures.push(`SAT geometry runtime check failed: ${error.message}`);
    return;
  }

  check(satConfig.baseChunks.length === 18, `SAT should have 18 starting plots, found ${satConfig.baseChunks.length}`);
  check(satConfig.expansions.length === 23, `SAT should have 23 expansions, found ${satConfig.expansions.length}`);

  const plotKeys = new Set([
    ...satConfig.baseChunks.map(([br,bc]) => `${br},${bc}`),
    ...satConfig.expansions.map(({br,bc}) => `${br},${bc}`)
  ]);
  check(plotKeys.size === 41, `SAT should have 41 unique plots, found ${plotKeys.size}`);
  check(
    satConfig.defaultHub[0] === 8 && satConfig.defaultHub[1] === 4,
    `SAT default Town Hall should start at 8,4, found ${satConfig.defaultHub.join(',')}`
  );

  const baseSet = new Set(satConfig.baseChunks.map(([br,bc]) => `${br},${bc}`));
  const expansionByChunk = new Map(satConfig.expansions.map(exp => [`${exp.br},${exp.bc}`,exp]));
  const colonyConfigCellState = (_era,r,c,enabledSet) => {
    if (r < 0 || r >= 28 || c < 0 || c >= 28) return 'out';
    const key = `${Math.floor(r/4)},${Math.floor(c/4)}`;
    if (baseSet.has(key)) return 'empty';
    const exp = expansionByChunk.get(key);
    if (!exp) return 'out';
    return enabledSet.has(exp.id) ? 'empty' : 'future';
  };

  const defs = {
    igloo:{key:'igloo',name:'Igloo',w:3,h:3},
    screenedDomicile:{key:'screenedDomicile',name:'Screened Domicile',w:4,h:4}
  };
  const presetContext = {
    window:{},
    selectedEra:'SAT',
    COLONY_CONFIGS:geometryContext.COLONY_CONFIGS,
    ERA_DATA:{SAT:{townHall:{w:5,h:5}}},
    colonyConfigCellState,
    eraBoardBuildingByKey:(_era,key) => defs[key] || null,
    getPresetCatalog:() => [
      {id:'builtin:sat-igloos',kind:'Built-in'},
      {id:'builtin:sat-screened-domiciles',kind:'Built-in'},
      {id:'custom:test',kind:'Saved',state:{}}
    ]
  };

  try {
    vm.runInNewContext(read('presets/sat-presets.js'), presetContext, {filename:'presets/sat-presets.js'});
    const catalog = presetContext.getPresetCatalog();
    const builtins = catalog.filter(item => String(item?.id || '').startsWith('builtin:sat-'));
    check(builtins.length === 3, `SAT should expose 3 corrected built-in presets, found ${builtins.length}`);

    const expected = new Map([
      ['builtin:sat-igloos',{igloo:25,screenedDomicile:0,expansions:0}],
      ['builtin:sat-screened-domiciles',{igloo:3,screenedDomicile:14,expansions:0}],
      ['builtin:sat-screened-domiciles-all',{igloo:3,screenedDomicile:37,expansions:23}]
    ]);

    for (const preset of builtins) {
      const want = expected.get(preset.id);
      check(Boolean(want), `Unexpected SAT preset ${preset.id}`);
      if (!want) continue;
      const counts = {igloo:0,screenedDomicile:0};
      for (const building of preset.state?.buildings || []) {
        if (building.type in counts) counts[building.type]++;
      }
      check(counts.igloo === want.igloo, `${preset.id}: expected ${want.igloo} Igloos, found ${counts.igloo}`);
      check(counts.screenedDomicile === want.screenedDomicile, `${preset.id}: expected ${want.screenedDomicile} Screened Domiciles, found ${counts.screenedDomicile}`);
      check((preset.state?.enabled || []).length === want.expansions, `${preset.id}: expected ${want.expansions} expansions`);
    }
  } catch (error) {
    failures.push(`SAT preset runtime check failed: ${error.message}`);
  }

  notes.push('SAT geometry: 18 starting plots, 23 expansions, and corrected presets checked');
}

function testSatBuildingOrientations() {
  if (!parsedEras?.SAT) {
    failures.push('SAT building orientation check could not load ERA_DATA');
    return;
  }

  const context = {
    window:{},
    ERA_DATA:JSON.parse(JSON.stringify(parsedEras)),
    workspace:{eras:{SAT:null}},
    selectedEra:'SAM',
    colonyConfigCellState:() => 'empty',
    applyColonyState:() => true,
    renderBuildMenu:() => {},
    render:() => {},
    saveWorkspace:() => {}
  };

  try {
    vm.runInNewContext(read('site/sat-building-dimensions.js'), context, {filename:'site/sat-building-dimensions.js'});
  } catch (error) {
    failures.push(`SAT building orientation runtime check failed: ${error.message}`);
    return;
  }

  const expected = new Map([
    ['matterCompressionReactor',[4,6]],
    ['moleculeDrill',[6,4]],
    ['experimentalTestSite',[5,4]],
    ['purificationFacility',[4,5]],
    ['chemicalCleaningPlant',[3,6]]
  ]);

  for (const def of context.ERA_DATA.SAT.goods) {
    const want = expected.get(def.key);
    if (!want) continue;
    check(def.w === want[0] && def.h === want[1], `${def.name}: expected planner orientation ${want[0]}×${want[1]}, found ${def.w}×${def.h}`);
    check(def.sizeText === `${want[0]}×${want[1]}`, `${def.name}: size label should be ${want[0]}×${want[1]}`);
    check(def.requiresPath === false, `${def.name}: SAT goods must not require a path`);
  }

  for (const def of context.ERA_DATA.SAT.residential) {
    check(def.requiresPath === false, `${def.name}: SAT residential buildings must not require a path`);
  }

  notes.push('SAT goods orientations and no-path metadata checked');
}

testSatGeometryAndPresets();
testSatBuildingOrientations();

check(!fs.existsSync(path.join(repo, 'download.html')), 'Obsolete standalone download page still exists');
const standaloneFiles = fs.readdirSync(repo).filter(name => /^forge-of-empires-colony-planner-v.*\.html$/i.test(name));
check(standaloneFiles.length === 0, `Obsolete standalone planner files remain: ${standaloneFiles.join(', ')}`);
notes.push('Standalone download files checked');

console.log(JSON.stringify({ok: failures.length === 0, notes, failures}, null, 2));
process.exitCode = failures.length ? 1 : 0;
