// READ ONLY, NO SEND. Post-ship proof for hole 1 (contract picker).
// Downloads the LIVE public/app/present.js from fundhub.ai (a static file, one GET,
// no sign-in) and runs its own contract picker in a sandbox for every deck state.
// Nothing is clicked, nothing is written, nothing is sent.
// Run: node scripts/tmp/live-fix-2026-09-18/h1-contracts-prove.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { offersForClient } from "../../../src/config/offers.mjs";

const URL_LIVE = "https://fundhub.ai/app/present.js";
const BEGIN = "  function offer(key) {";
const END = "  /* No contract defaults live in this file any more";

const res = await fetch(URL_LIVE, { cache: "no-store" });
const src = await res.text();
const a = src.indexOf(BEGIN);
const b = src.indexOf(END, a);
if (!res.ok || a < 0 || b < a) {
  console.error(`could not read the picker from ${URL_LIVE} (HTTP ${res.status})`);
  process.exit(2);
}
const block = src.slice(a, b);

function pick(state) {
  const sandbox = { state: { offers: offersForClient(), ...state } };
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return { offer: sandbox.selectedOfferKey(), agreement: sandbox.resolveContractTemplateKey() };
}

const rows = [];
let bad = 0;
for (const tier of ["FULL_FUNDING", "FUNDING_PLUS_REPAIR", "REPAIR_ONLY"]) {
  for (const [label, s] of [
    ["funding", { edu: false, forceRepair: false, rung: 0 }],
    ["DIY letters + course", { edu: false, forceRepair: true, rung: 2 }],
    ["Education Course 1 (Blueprint)", { edu: true, forceRepair: false, rung: 1 }]
  ]) {
    const got = pick({ tier, ...s });
    const ok = got.offer !== "UWIQ_DELIVERABLES" || got.agreement === "CAPITAL-BLUEPRINT-AGREEMENT";
    if (!ok) bad += 1;
    rows.push({ tier, path: label, ...got, ok });
  }
}
const out = { url: URL_LIVE, new_rule_live: block.includes('selectedOfferKey() === "FUNDING_DFY"'), bad, rows };
mkdirSync("/tmp/live-fix-2026-09-18/h1-contracts", { recursive: true });
writeFileSync("/tmp/live-fix-2026-09-18/h1-contracts/prove.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
console.log(bad === 0 && out.new_rule_live ? "PASS" : "FAIL");
process.exit(bad === 0 && out.new_rule_live ? 0 : 1);
