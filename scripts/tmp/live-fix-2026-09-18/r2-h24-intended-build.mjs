// Hole 24 fix run 2 — build the PROPOSED intended pages for `client` and
// `role-inquiry-remover` so their route lists match the code, route for route.
//
// Chris approved (2026-09-18) an agent editing docs/journeys/client-intended.md
// and docs/journeys/role-inquiry-remover-intended.md. The repo's own permission
// rules still stop every agent writing `docs/journeys/*-intended.md` (a deny
// rule plus a hook in .claude/settings.json), so this script NEVER writes
// there. It writes the finished pages next to the hole-24 evidence instead:
//
//   <out>/client-intended.proposed.md
//   <out>/role-inquiry-remover-intended.proposed.md
//
// Every hand-written line of the current intended page is kept. Only three
// things change: a dated owner-approval note under the warning banner, the
// CAN / CANT lines of the route picture, and the two bullet lists, which now
// name every route under its group. Groups and order are the generator's own
// (scripts/journeys/render.mjs), from the same extraction as -actual.md.
//
// Read-only on the repo. Usage:
//   node scripts/tmp/live-fix-2026-09-18/r2-h24-intended-build.mjs [outDir]
import fs from "node:fs";
import path from "node:path";
import { extractAll, reaches, REPO } from "../../journeys/extract.mjs";

const OUT = process.argv[2] ||
  "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-24/proposed";
fs.mkdirSync(OUT, { recursive: true });

// Same grouping as scripts/journeys/render.mjs (not exported there).
const AREA_LABEL = {
  read: "Reading data", dashboard: "The dashboard", campaigns: "Campaigns", creative: "Creative Factory",
  hiring: "Hiring", auth: "Signing in and out", finance: "Finance", webhooks: "Incoming webhooks",
  documents: "Documents", "top level": "Everything else"
};
const area = (k) => (k.includes("/") ? k.split("/")[0] : "top level");
const label = (a) => AREA_LABEL[a] || a;
const group = (list) => {
  const g = new Map();
  for (const e of list) { const a = area(e.key); if (!g.has(a)) g.set(a, []); g.get(a).push(e); }
  return [...g.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
};
const id = (a) => a.replace(/[^a-z0-9]/gi, "_");
const s = (n) => (n === 1 ? "" : "s");

const { endpoints, journeys } = extractAll();

for (const name of ["client", "role-inquiry-remover"]) {
  const j = journeys.find((x) => x.name === name);
  const allowed = endpoints.filter((e) => reaches(j, e.gate).reachable === true);
  const refused = endpoints.filter((e) => reaches(j, e.gate).reachable === false);
  const unverified = endpoints.filter((e) => reaches(j, e.gate).reachable === null);
  if (unverified.length) throw new Error(`${name}: unverified gates ${unverified.map((e) => e.key).join(", ")}`);

  const mermaid = [
    ...group(allowed).map(([a, l]) => `    CAN --> A_${id(a)}[${label(a)} — ${l.length} route${s(l.length)}]`),
    `    WHO -->|Yes| CANT[Should stay blocked from — ${refused.length} routes]`,
    ...group(refused).map(([a, l]) => `    CANT --> B_${id(a)}[${label(a)} — ${l.length} blocked]`)
  ];
  const bullets = (list, verb) => group(list).flatMap(([a, l]) => [
    `- **${label(a)}** (${l.length} route${s(l.length)}) — ${verb}.`,
    ...l.map((e) => `  - \`/api/${e.key}\``)
  ]);

  const src = fs.readFileSync(path.join(REPO, `docs/journeys/${name}-intended.md`), "utf8").split("\n");
  const out = [];
  let mermaidDone = false;
  for (let i = 0; i < src.length;) {
    const l = src[i];
    if (!mermaidDone && l.startsWith("    CAN --> A_")) {
      while (i < src.length && /^ {4}(CAN --> |WHO -->\|Yes\| CANT|CANT --> )/.test(src[i])) i++;
      out.push(...mermaid);
      mermaidDone = true;
      continue;
    }
    if (l.startsWith("## Should be able to reach") || l.startsWith("## Should stay blocked from")) {
      const reach = l.includes("reach");
      out.push(l, "");
      i++;
      while (i < src.length && !src[i].startsWith("## ")) i++;
      out.push(...(reach ? bullets(allowed, "should be reachable") : bullets(refused, "should stay blocked")), "");
      continue;
    }
    out.push(l);
    i++;
  }
  if (!mermaidDone) throw new Error(`${name}: no CAN block found in the route picture`);

  let text = out.join("\n");
  const anchor = "> purpose — that is the point of having two files at all.\n";
  if (text.split(anchor).length !== 2) throw new Error(`${name}: warning banner not found exactly once`);
  const actual = `${name}-actual.md`;
  text = text.replace(anchor, anchor +
    "\n> **Route lists brought up to date on 2026-09-18 — owner-approved.** Chris approved an\n" +
    "> agent editing this page so its route lists match what the code allows today (live hole\n" +
    "> 24, fix run 2). Every route is now named under its group, and the lists match\n" +
    `> [\`${actual}\`](./${actual}) route for route as of that date. The warning above\n` +
    "> still holds: this page mirrors the code; it is not an independent spec.\n");

  const file = path.join(OUT, `${name}-intended.proposed.md`);
  fs.writeFileSync(file, text);
  console.log(`${name}: reach ${allowed.length}, blocked ${refused.length} -> ${file}`);
}
