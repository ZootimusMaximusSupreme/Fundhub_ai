#!/usr/bin/env node
// Hole 24 round 2 review (read-only). Runs the journey generator from two
// extracted trees (git archive of 934b0c3a^1 and 934b0c3a) and diffs, for every
// route: the gate the generator reads, and reach for every journey. Also diffs
// every rendered page. Writes nothing into either tree.
//
//   node r24b-gate-diff.mjs <beforeRoot> <afterRoot>

import path from "node:path";
import { pathToFileURL } from "node:url";

const [beforeRoot, afterRoot] = process.argv.slice(2);
if (!beforeRoot || !afterRoot) { console.error("usage: r24b-gate-diff.mjs <before> <after>"); process.exit(2); }

async function load(root) {
  const ex = await import(pathToFileURL(path.join(root, "scripts/journeys/extract.mjs")).href);
  const rn = await import(pathToFileURL(path.join(root, "scripts/journeys/render.mjs")).href);
  const data = ex.extractAll();
  const files = rn.renderAll(data);
  const byKey = new Map(data.endpoints.map((e) => [e.key, e]));
  const reach = {};
  for (const j of data.journeys) {
    reach[j.name] = new Map(data.endpoints.map((e) => [e.key, ex.reaches(j, e.gate).reachable]));
  }
  return { ex, data, files, byKey, reach };
}

const B = await load(path.resolve(beforeRoot));
const A = await load(path.resolve(afterRoot));

console.log("routes before:", B.data.endpoints.length, "after:", A.data.endpoints.length);
console.log("counts before:", JSON.stringify(B.data.counts));
console.log("counts after: ", JSON.stringify(A.data.counts));

const keys = new Set([...B.byKey.keys(), ...A.byKey.keys()]);
const gateChanged = [];
for (const k of [...keys].sort()) {
  const b = B.byKey.get(k), a = A.byKey.get(k);
  if (!b || !a) { gateChanged.push({ k, why: !b ? "only after" : "only before" }); continue; }
  const sb = JSON.stringify(b.gate), sa = JSON.stringify(a.gate);
  if (sb !== sa) gateChanged.push({ k, before: b.gate, after: a.gate });
}
console.log("\nroutes whose read gate changed:", gateChanged.length);
for (const g of gateChanged) console.log(JSON.stringify(g, null, 1));

console.log("\nreach changes per journey:");
for (const j of Object.keys(A.reach)) {
  const flips = [];
  let nb = 0, na = 0;
  for (const k of keys) {
    const rb = B.reach[j]?.get(k), ra = A.reach[j].get(k);
    if (rb) nb++; if (ra) na++;
    if (rb !== ra) flips.push(`${k}: ${rb} -> ${ra}`);
  }
  console.log(`  ${j}: ${nb} -> ${na}${flips.length ? "  " + flips.join("; ") : ""}`);
}

console.log("\nrendered page diffs (line-level, before-generator vs after-generator):");
const names = new Set([...Object.keys(B.files), ...Object.keys(A.files)]);
for (const n of [...names].sort()) {
  const b = (B.files[n] ?? "").split("\n"), a = (A.files[n] ?? "").split("\n");
  const bs = new Set(b), as = new Set(a);
  const removed = b.filter((l) => !as.has(l)), added = a.filter((l) => !bs.has(l));
  if (removed.length || added.length) {
    console.log(`  ${n}: -${removed.length} +${added.length}`);
    for (const l of removed) console.log(`     - ${l}`);
    for (const l of added) console.log(`     + ${l}`);
  }
}
