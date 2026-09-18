/* A Netlify function that loads the letter generator must carry fontkit itself.
 *
 * MEASURED ON LIVE, 2026-09-17 → 09-18 (hole 18). Every pass of
 * netlify/functions/commas-inbox-sweeper.mjs died at load with
 *   Cannot find module '@pdf-lib/fontkit'
 * The sweeper imports src/register-all.mjs, which reaches
 * vendor/underwriteiq-full/api/lite/letter-generator.js, and that file
 * require()s @pdf-lib/fontkit when it loads. The bundler keeps that package
 * external, and it only lands in a function's zip when the function's own
 * entry names it — which is why api.mjs has carried `import "@pdf-lib/fontkit"`
 * since 2026-08-15 and the sweeper did not. With the sweeper dead, nothing
 * drained the payment queue: a $3,000 deposit receipt sat pending with 0
 * tries and never reached the money chain.
 *
 * So: walk each function's static import graph inside this repo. If it reaches
 * a file that loads @pdf-lib/fontkit, the function's entry file must import it
 * too. Reading source only — nothing is built, nothing is run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FUNCTIONS = path.join(ROOT, "netlify/functions");
const PKG = "@pdf-lib/fontkit";

/* import … from "x" · import "x" · export … from "x" · import("x") · require("x") */
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const LOADS_PKG = new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)["']${PKG}["']`);
const ENTRY_IMPORTS_PKG = new RegExp(`^\\s*import\\s+["']${PKG}["'];?\\s*$`, "m");

function resolveLocal(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const p of [base, `${base}.mjs`, `${base}.js`, `${base}.cjs`, path.join(base, "index.mjs"), path.join(base, "index.js")]) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/* Every repo file the entry reaches, and which of them load the package. */
function reach(entry) {
  const seen = new Set();
  const loaders = [];
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (file !== entry && LOADS_PKG.test(src)) loaders.push(path.relative(ROOT, file));
    for (const m of src.matchAll(SPEC)) {
      const next = resolveLocal(file, m[1]);
      if (next && !seen.has(next)) stack.push(next);
    }
  }
  return { count: seen.size, loaders };
}

const entries = readdirSync(FUNCTIONS)
  .filter((f) => /\.(mjs|js|cjs)$/.test(f) && !/\.test\./.test(f))
  .map((f) => path.join(FUNCTIONS, f));

test("the payment sweeper reaches the letter generator — the case that broke live", () => {
  const { loaders } = reach(path.join(FUNCTIONS, "commas-inbox-sweeper.mjs"));
  assert.ok(
    loaders.some((f) => f.endsWith("letter-generator.js")),
    "the walk no longer finds the letter generator from the sweeper. If that is " +
    "real, this guard is still right; if the walk broke, it is now blind. Found: " +
    JSON.stringify(loaders)
  );
});

for (const entry of entries) {
  const name = path.relative(ROOT, entry);
  test(`${name} carries ${PKG} in its own zip when anything it loads needs it`, () => {
    const { loaders } = reach(entry);
    if (loaders.length === 0) return;
    assert.match(
      readFileSync(entry, "utf8"), ENTRY_IMPORTS_PKG,
      `${name} reaches ${loaders.join(", ")}, which load ${PKG}, but ${name} ` +
      `does not \`import "${PKG}";\` itself. The deployed zip will not contain ` +
      `the package and every run dies at load with "Cannot find module '${PKG}'".`
    );
  });
}
