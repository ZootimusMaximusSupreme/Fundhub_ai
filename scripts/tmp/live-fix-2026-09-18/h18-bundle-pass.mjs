// Hole 18 — run ONE sweeper pass from a BUILT zip (unzipped by h18-bundle.mjs)
// against a fake database that holds no rows. Proves the pass gets past load,
// handler registration and the claim query without a missing module. No real
// database, no network, nothing processed.
//
// Run: node scripts/tmp/live-fix-2026-09-18/h18-bundle-pass.mjs <unzippedDir>
import path from "node:path";
import { pathToFileURL } from "node:url";

delete process.env.DATABASE_URL;
const dir = path.resolve(process.argv[2]);
const m = await import(pathToFileURL(path.join(dir, "netlify/functions/commas-inbox-sweeper.mjs")).href);
const calls = [];
const fakeDb = {
  query: async (sql) => {
    calls.push(String(sql).trim().split(/\s+/).slice(0, 2).join(" "));
    return { rows: [], rowCount: 0 };
  }
};
const r = await m.sweepCommasInbox(fakeDb);
console.log(JSON.stringify({ result: r, queries: calls }));
