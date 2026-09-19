// HOLE N12 (attempt b) — READ ONLY sweep. Runs the page's own sampleDecision()
// and isSampleReport() (loaded from this branch's client-control-panel.html)
// over every client's stored credit reports on live, and counts who would get
// a "sample" line on Prequal / Tier / Card Use / income. The point: a file
// whose newest report is a real pull must get none. Prints counts and the
// names of Sim/test files only; a real client is counted, never named.
// BEGIN READ ONLY ... COMMIT. No SET.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n12b-sweep.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { pool, close } from "../../../src/db.mjs";
import { utilisation, incomeEstimates } from "../../../src/http/client-detail.mjs";

const html = readFileSync(new URL("../../../public/app/client-control-panel.html", import.meta.url), "utf8");
const a = html.indexOf("/* FH-CCP-BEGIN");
const b = html.indexOf("/* FH-CCP-END */");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(html.slice(a, b), sandbox);
const P = sandbox.window.FHClientPanel;

const c = await pool().connect();
let rows = [];
try {
  await c.query("BEGIN READ ONLY");
  rows = (await c.query(
    `SELECT cl.id, cl.first_name, cl.last_name, cl.outcome_tier, cl.custom_fields,
            COALESCE(json_agg(json_build_object('id', r.id, 'outcome_tier', r.outcome_tier, 'result', r.result, 'created_at', r.created_at)
                     ORDER BY r.created_at DESC) FILTER (WHERE r.id IS NOT NULL), '[]') AS crs
       FROM clients cl JOIN crs_results r ON r.client_id = cl.id AND r.org_id = cl.org_id
      GROUP BY cl.id`)).rows;
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.log("error", e.message);
} finally {
  c.release();
  await close();
}

const isTest = (r) => /^(sim|walk|e2e|test|demo)/i.test(String(r.first_name || "")) || /sim|walk|thirteen|twelve|eleven|ten-|nine|eight/i.test(String(r.last_name || ""));
const tally = { files: rows.length, newestReal: 0, newestSample: 0, realLabelled: [], sampleLabelled: [] };
for (const r of rows) {
  const crs = r.crs.map((x) => ({ ...x, created_at: new Date(x.created_at).toISOString() }));
  const newestSample = P.isSampleReport([crs[0]], crs[0].created_at);
  const cf = r.custom_fields || {};
  const prequal = cf.analyzer_prequal_amount || cf.total_funding_estimate;
  const sd = P.sampleDecision(crs);
  const tierSample = !!sd && sd.tier !== null && !!r.outcome_tier && String(r.outcome_tier) === sd.tier;
  const prequalSample = !!sd && sd.prequal !== null && P.tileMoney(prequal) !== "—" && Number(prequal) === sd.prequal;
  const u = utilisation(crs, r);
  const inc = incomeEstimates(crs);
  const cardSample = P.isSampleReport(crs, u.asOf);
  const incSample = P.isSampleReport(crs, inc.asOf);
  const any = tierSample || prequalSample || cardSample || incSample;
  const what = { tier: tierSample, prequal: prequalSample, cardUse: cardSample, income: incSample };
  if (newestSample) tally.newestSample++; else tally.newestReal++;
  if (!newestSample && (tierSample || prequalSample)) {
    tally.realLabelled.push(isTest(r) ? { name: `${r.first_name} ${r.last_name}`, ...what } : { name: "(real client, not named)", ...what });
  }
  if (newestSample && any) tally.sampleLabelled.push({ name: isTest(r) ? `${r.first_name} ${r.last_name}` : "(not a Sim name)", ...what, prequalShown: P.tileMoney(prequal), samplePreapproval: sd && sd.prequal, rows: crs.length });
}
console.log(JSON.stringify(tally, null, 2));
