// r2-n25 — VERIFY on live: is Inngest's registered job list out of date after the last ship?
// One PUT to https://fundhub.ai/api/inngest (the same re-register the main session ran at
// 17:02 and 18:47 UTC). `modified: true` means Inngest's list did not match the live build.
// Also reads the live deploy list so the answer can be tied to the last ship. Prints no secret.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N25";
const label = process.argv[2] || "verify";

const deploys = spawnSync("netlify", ["api", "listSiteDeploys", "--data", JSON.stringify({ site_id: JSON.parse(fs.readFileSync("/Users/chrisstanbridge/Developer/fundhub-platform/.netlify/state.json", "utf8")).siteId, per_page: 5 })], { encoding: "utf8" });
let lastDeploys = [];
try {
  lastDeploys = JSON.parse(deploys.stdout).map((d) => ({ id: d.id, state: d.state, context: d.context, published_at: d.published_at, title: d.title }));
} catch {
  lastDeploys = [{ error: (deploys.stderr || deploys.stdout || "").slice(0, 300) }];
}

const at = new Date().toISOString();
const res = await fetch("https://fundhub.ai/api/inngest", { method: "PUT", signal: AbortSignal.timeout(30000) });
const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
const record = { label, at, status: res.status, syncKind: res.headers.get("x-inngest-sync-kind"), body, lastDeploys };
console.log(JSON.stringify(record, null, 2));
fs.writeFileSync(`${OUT}/${label}-${at.replace(/[:.]/g, "-")}.json`, JSON.stringify(record, null, 2));
