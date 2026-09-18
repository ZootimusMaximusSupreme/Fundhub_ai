/* Which agreement the Present screen's "Send contract" button picks.
 *
 * WHAT IT IS FOR. Live look 2026-09-17, hole 1: a Capital Blueprint buyer must
 * get the Capital Blueprint Agreement — the one wording that matches the
 * $5,000 pay link the same screen sends. The offer catalogue already maps
 * UWIQ_DELIVERABLES to CAPITAL-BLUEPRINT-AGREEMENT (src/config/offers.mjs), but
 * resolveContractTemplateKey() checked the deck TIER first: a client whose
 * tier is FUNDING_PLUS_REPAIR got REPAIR-AND-FUNDING-AGREEMENT ($3,000 deposit,
 * $1,000 repair, 10% success fee) even after the closer moved to the education
 * path and sold the Blueprint. The pay link said one product, the contract
 * another.
 *
 * THE RULE BEING PINNED. The combined agreement belongs to the funding sale
 * only — the same line generateDeckLetters() draws in
 * src/sales/closer-deck.mjs ("fundingRoute ... offerKey === 'FUNDING_DFY'").
 * Every other offer gets its own agreement whatever the tier says.
 *
 * HOW. package.json's test glob is "src/**" and "scripts/**" (CLAUDE.md §12),
 * so the browser file is read from public/app/present.js and its picker
 * functions are run in a sandbox — the real code, not a copy typed in here.
 * The server mirror in src/config/offers.mjs is checked against it on every
 * deck state, so the two cannot drift apart.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { offersForClient, resolveContractTemplateKey } from "../config/offers.mjs";
import { selectedOfferKey as serverSelectedOfferKey } from "../sales/closer-deck.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRESENT = path.resolve(HERE, "../../public/app/present.js");
const PRESENT_JS = fs.readFileSync(PRESENT, "utf8");

const BEGIN = "  function offer(key) {";
const END = "  /* No contract defaults live in this file any more";

/* The deck's own picker, run against one deck state. */
function presentPicker(state) {
  const a = PRESENT_JS.indexOf(BEGIN);
  const b = PRESENT_JS.indexOf(END, a);
  assert.ok(a > 0 && b > a, "present.js picker block moved — update BEGIN/END in this test");
  const sandbox = { state: { offers: offersForClient(), ...state } };
  vm.createContext(sandbox);
  vm.runInContext(PRESENT_JS.slice(a, b), sandbox, { filename: PRESENT + "#picker" });
  return {
    offerKey: sandbox.selectedOfferKey(),
    templateKey: sandbox.resolveContractTemplateKey()
  };
}

const TIERS = ["FULL_FUNDING", "FUNDING_PLUS_REPAIR", "REPAIR_ONLY", null];

/* Every button path on the deck that changes the offer (present.js onAction). */
const PATHS = Object.freeze([
  { label: "funding", edu: false, forceRepair: false, rung: 0 },
  { label: "repair DFY", edu: false, forceRepair: true, rung: 0 },
  { label: "repair trial", edu: false, forceRepair: true, rung: 1 },
  { label: "DIY letters + course (Blueprint)", edu: false, forceRepair: true, rung: 2 },
  { label: "Course 2 (Capital Academy)", edu: true, forceRepair: false, rung: 0 },
  { label: "Course 1 (Capital Blueprint)", edu: true, forceRepair: false, rung: 1 }
]);

describe("Present screen: the agreement matches the offer being sold", () => {
  test("a Capital Blueprint buyer gets the Capital Blueprint Agreement on every tier", () => {
    for (const tier of TIERS) {
      for (const p of PATHS) {
        const got = presentPicker({ tier, ...p });
        if (got.offerKey !== "UWIQ_DELIVERABLES") continue;
        assert.equal(got.templateKey, "CAPITAL-BLUEPRINT-AGREEMENT",
          `tier ${tier}, ${p.label}: Blueprint pay link but ${got.templateKey}`);
      }
    }
    // The exact reported path: education, Course 1, on a funding-plus-repair deck.
    assert.equal(
      presentPicker({ tier: "FUNDING_PLUS_REPAIR", edu: true, forceRepair: false, rung: 1 }).templateKey,
      "CAPITAL-BLUEPRINT-AGREEMENT"
    );
  });

  test("the combined agreement is still picked for the funding sale on a funding-plus-repair deck", () => {
    const got = presentPicker({ tier: "FUNDING_PLUS_REPAIR", edu: false, forceRepair: false, rung: 0 });
    assert.equal(got.offerKey, "FUNDING_DFY");
    assert.equal(got.templateKey, "REPAIR-AND-FUNDING-AGREEMENT");
  });

  test("screen and server pick the same agreement for every deck state", () => {
    for (const tier of TIERS) {
      for (const p of PATHS) {
        const screen = presentPicker({ tier, ...p });
        const offerKey = serverSelectedOfferKey({ tier, ...p });
        assert.equal(screen.offerKey, offerKey, `tier ${tier}, ${p.label}: offer drift`);
        assert.equal(
          screen.templateKey,
          resolveContractTemplateKey({ offerKey, tier }),
          `tier ${tier}, ${p.label}: screen and server disagree`
        );
      }
    }
  });
});
