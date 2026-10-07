// Nothing in Yesdoor transmits (spec §0.3, CLAUDE.md §12).
//
// boundary.imports.test.mjs already proves it for every file under src/yesdoor.
// This covers the two places that file does not reach: the HTTP shell under
// api/yesdoor, and the four src/workflows/yd-*.mjs files that register the crons.
// Real outbound belongs in src/messaging/providers/ and nowhere else.
//
// PURE UNIT TEST. No database. Runs in every CI pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".mjs") && !e.name.endsWith(".test.mjs")) out.push(full);
  }
  return out;
}

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

const OUTBOUND = [
  [/\bfetch\s*\(/, "fetch("],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/node:(?:https?|http2|net|tls|dgram|dns)\b/, "a node: network module"],
  [/\bchild_process\b/, "child_process"],
  [/\b(?:axios|node-fetch|undici|superagent)\b/, "an HTTP client package"]
];

export const transmitsIn = (src) => {
  const code = strip(src);
  return OUTBOUND.filter(([re]) => re.test(code)).map(([, label]) => label);
};

test("api/yesdoor and the yd-* workflow shells cannot reach the network", () => {
  const files = [
    ...walk(path.join(ROOT, "api", "yesdoor")),
    ...fs.readdirSync(path.join(ROOT, "src", "workflows"))
      .filter((f) => /^yd-.*\.mjs$/.test(f) && !f.endsWith(".test.mjs"))
      .map((f) => path.join(ROOT, "src", "workflows", f))
  ];
  assert.ok(files.some((f) => f.endsWith("prescreen.mjs")), "the scan did not see the pre-screen handler");
  assert.ok(files.some((f) => f.endsWith("yd-recheck.mjs")), "the scan did not see the yd-recheck workflow");
  const problems = [];
  for (const f of files) {
    const hits = transmitsIn(fs.readFileSync(f, "utf8"));
    if (hits.length) problems.push(`${path.relative(ROOT, f)}: ${hits.join(", ")}`);
  }
  assert.deepEqual(problems, [],
    "Yesdoor sends nothing. A real provider goes in src/messaging/providers/ (CLAUDE.md §12):\n  " + problems.join("\n  "));
});

test("the scanner catches each way of reaching out (so a green run means something)", () => {
  assert.deepEqual(transmitsIn(`const r = await fetch("https://x.test");`), ["fetch("]);
  assert.ok(transmitsIn(`const s = new WebSocket("wss://x");`).length);
  assert.ok(transmitsIn(`const x = new XMLHttpRequest();`).length);
  assert.ok(transmitsIn(`const h = "node:https";`).length);
  assert.ok(transmitsIn(`const h = "node:net";`).length);
  assert.ok(transmitsIn(`const c = "child_process";`).length);
  // not a transmit: a comment, a similar word, built-ins that do not reach out
  assert.deepEqual(transmitsIn(`// fetch("https://x.test")\n/* node:https */`), []);
  assert.deepEqual(transmitsIn(`const prefetchedRows = 1; refetch(); const m = "node:fs"; const c = "node:crypto";`), []);
});
