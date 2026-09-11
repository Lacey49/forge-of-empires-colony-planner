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
if (eraLiteral) {
  const eras = JSON.parse(eraLiteral);
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
const moduleReferences = [...loader.matchAll(/'(.+?\.js\?v=\d+)'/g)].map(match => match[1]);
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

check(!fs.existsSync(path.join(repo, 'download.html')), 'Obsolete standalone download page still exists');
const standaloneFiles = fs.readdirSync(repo).filter(name => /^forge-of-empires-colony-planner-v.*\.html$/i.test(name));
check(standaloneFiles.length === 0, `Obsolete standalone planner files remain: ${standaloneFiles.join(', ')}`);
notes.push('Standalone download files checked');

console.log(JSON.stringify({ok: failures.length === 0, notes, failures}, null, 2));
process.exitCode = failures.length ? 1 : 0;
