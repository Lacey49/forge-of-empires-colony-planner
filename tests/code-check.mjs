// Check the shared browser globals too. Parsing alone misses undefined names.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("acorn");
const { Linter } = require("eslint");
const files = [
  ...fs.readFileSync("index.html", "utf8").matchAll(/src="\.\/([^"?]+\.js)/g),
].map((m) => m[1]);
const globals = {};
for (const file of files) {
  const ast = parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest" });
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration") globals[node.id.name] = "writable";
    if (node.type === "VariableDeclaration")
      for (const d of node.declarations)
        if (d.id.type === "Identifier") globals[d.id.name] = "writable";
  }
}
const browser = Object.fromEntries(
  [
    "window",
    "document",
    "localStorage",
    "location",
    "console",
    "setTimeout",
    "clearTimeout",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "performance",
    "MouseEvent",
    "Blob",
    "URL",
    "Image",
    "ResizeObserver",
    "getComputedStyle",
    "navigator",
  ].map((name) => [name, "readonly"]),
);
const linter = new Linter();
const failures = [];
for (const file of files) {
  const messages = linter.verify(fs.readFileSync(file, "utf8"), [
    {
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "script",
        globals: { ...globals, ...browser },
      },
      rules: {
        "no-undef": "error",
        "no-unreachable": "error",
        "no-dupe-args": "error",
        "no-dupe-keys": "error",
      },
    },
  ]);
  failures.push(...messages.map((m) => `${file}:${m.line}: ${m.message}`));
}
console.log(
  JSON.stringify(
    { ok: !failures.length, checked: files.length, failures },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
