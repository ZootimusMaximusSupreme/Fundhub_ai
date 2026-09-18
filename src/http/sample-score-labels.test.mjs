// SAMPLE SCORES SAY THEY ARE A SAMPLE, ON EVERY SCREEN THAT SHOWS THEM.
//
// Live hole 23, 2026-09-18. A walkthrough can load a SAMPLE credit report onto
// a file nobody pulled (scripts/sim/push-credit.mjs, src/demo/simulate-client.mjs).
// It is stamped environment "simulated" (push-credit also sets simulated:true)
// so every screen can tell it was never a bureau pull. The Client Control Panel
// said so (its own test is in client-panel-screen.test.mjs). Five other screens
// painted #13 Sim Thirteen's EX 771 / EQ 778 / TU 766 as a real pull: the
// client portal, the progress page ("Pulled 17 September 2026"), the pipeline
// side drawer ("Scores pulled"), the closer call screen and the closer deck's
// "Your results" slide.
//
// Owner rule: a sample report reads "Sample scores. Not a real credit pull.",
// its date says the sample was loaded, not pulled, and a real pull is unchanged
// (control: Colin Schmidt, environment "production").

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { triMerge } from "./client-detail.mjs";
import { portalCreditScores } from "./portal-prequal.mjs";
import { personalPanels } from "../progress/scores.mjs";
import { buildCockpit } from "../sales/cockpit.mjs";
import { buildCloserDeck } from "../sales/closer-deck.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NOTE = "Sample scores. Not a real credit pull.";

/* #13 Sim Thirteen's stored report, as the live row carries it. */
const SAMPLE_ROW = {
  id: "fe92316e-ee62-49ff-9990-88f818abe074",
  outcome_tier: "PREMIUM_STACK",
  created_at: "2026-09-18T08:54:06.344Z",
  result: { scores: { ex: 771, eq: 778, tu: 766 }, simulated: true, environment: "simulated" }
};
/* Colin Schmidt's real pull — the control. */
const REAL_ROW = {
  id: "b1e6f15c-c968-4e8d-b2f6-139eaace38c5",
  outcome_tier: "PREMIUM_STACK",
  created_at: "2026-08-24T23:46:42.515Z",
  result: { scores: { ex: 811, eq: null, tu: null }, environment: "production" }
};

/* One named function's source, cut out of a page by brace count. */
function fnSource(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start !== -1, name + "() is gone");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(name + "() never closes");
}

describe("the server says which scores came off a sample report", () => {
  test("isSampleResult reads both stamps, and a JSON string, and never throws", async () => {
    const { isSampleResult } = await import("./client-detail.mjs");
    assert.equal(isSampleResult(SAMPLE_ROW.result), true);
    assert.equal(isSampleResult({ environment: "SIMULATED" }), true);
    assert.equal(isSampleResult({ simulated: true }), true);
    assert.equal(isSampleResult(JSON.stringify(SAMPLE_ROW.result)), true);
    assert.equal(isSampleResult(REAL_ROW.result), false);
    assert.equal(isSampleResult(null), false);
    assert.equal(isSampleResult("not json"), false);
    assert.equal(isSampleResult({ simulated: "yes" }), false);
  });

  test("triMerge carries sample: true for #13 and false for a real pull", () => {
    const s = triMerge([SAMPLE_ROW]);
    assert.deepEqual([s.experian, s.equifax, s.transunion], [771, 778, 766]);
    assert.equal(s.sample, true);
    assert.equal(triMerge([REAL_ROW]).sample, false);
    assert.equal(triMerge([]).sample, false);
  });

  test("the portal's scores say sample for #13, not for a real pull", () => {
    assert.equal(portalCreditScores({ crsResults: [SAMPLE_ROW] }).sample, true);
    assert.equal(portalCreditScores({ crsResults: [REAL_ROW] }).sample, false);
  });

  test("the progress panels say sample per bureau for #13, not for a real pull", () => {
    const sample = personalPanels([SAMPLE_ROW]);
    assert.deepEqual(sample.map((p) => p.sample), [true, true, true]);
    const real = personalPanels([REAL_ROW]);
    assert.deepEqual(real.map((p) => p.sample), [false, false, false]);
  });

  function cockpitDb(crsRows) {
    return {
      async query(sql) {
        const flat = String(sql).replace(/\s+/g, " ");
        if (/FROM clients c\b/.test(flat) && /WHERE c\.id/.test(flat)) {
          return { rows: [{ id: "c1", first_name: "Sim", last_name: "Thirteen", email: null,
            custom_fields: {}, tags: [], business_name: null, age_months: null }] };
        }
        if (/FROM staff\b/.test(flat)) return { rows: [{ name: "A Closer" }] };
        if (/FROM call_outcomes\b/.test(flat)) return { rows: [{}] };
        if (/FROM crs_results\b/.test(flat)) return { rows: crsRows };
        return { rows: [] };
      }
    };
  }
  const IDS = { orgId: "11111111-1111-1111-1111-111111111111",
                staffId: "22222222-2222-2222-2222-222222222222",
                clientId: "33333333-3333-3333-3333-333333333333" };

  test("the closer call's credit block says sample for #13, not for a real pull", async () => {
    const sample = await buildCockpit(cockpitDb([SAMPLE_ROW]), IDS);
    assert.equal(sample.credit.sample, true);
    const real = await buildCockpit(cockpitDb([REAL_ROW]), IDS);
    assert.equal(real.credit.sample, false);
  });

  function deckDb(crs) {
    return {
      async query(sql) {
        const s = String(sql);
        if (/FROM clients c/i.test(s)) {
          return { rows: [{ id: IDS.clientId, first_name: "Sim", last_name: "Thirteen", email: null,
            phone: null, outcome_tier: "PREMIUM_STACK", custom_fields: {}, business_name: null }] };
        }
        if (/FROM crs_results/i.test(s)) return { rows: [crs] };
        if (/FROM businesses|FROM tradelines|FROM card_liabilities|FROM payment_links|FROM soft_pull_requests|FROM client_consents/i.test(s)) {
          return { rows: [] };
        }
        throw new Error("unexpected sql: " + s.slice(0, 80));
      }
    };
  }

  test("the closer deck's engine says sample for #13, not for a real pull", async () => {
    const sample = await buildCloserDeck(deckDb(SAMPLE_ROW), { orgId: IDS.orgId, clientId: IDS.clientId });
    assert.equal(sample.engine.fico.ex, 771);
    assert.equal(sample.engine.sample, true);
    const real = await buildCloserDeck(deckDb(REAL_ROW), { orgId: IDS.orgId, clientId: IDS.clientId });
    assert.equal(real.engine.sample, false);
  });
});

describe("each screen prints the sample line, and only for a sample", () => {
  test("client portal: the scores card shows the line only when scores.sample is true", () => {
    const html = read("public/app/client-portal.html");
    assert.match(html, /<div class="support-note" id="sb-scores-sample" hidden><\/div>/);
    const els = {};
    const el = (id) => (els[id] = els[id] || { id, hidden: true, textContent: "" });
    const box = {
      document: { getElementById: el },
      setText: (id, t) => { el(id).textContent = t; },
      scoreText: (n) => (n == null ? "—" : String(n))
    };
    vm.createContext(box);
    vm.runInContext(fnSource(html, "paintPortalScores"), box);
    box.paintPortalScores({ experian: 771, equifax: 778, transunion: 766, sample: true });
    assert.equal(els["sb-scores-sample"].hidden, false);
    assert.equal(els["sb-scores-sample"].textContent, NOTE);
    box.paintPortalScores({ experian: 811, sample: false });
    assert.equal(els["sb-scores-sample"].hidden, true);
    assert.equal(els["sb-scores-sample"].textContent, "");
  });

  test("progress page: a sample score's date says loaded, a real one still says Pulled", () => {
    const html = read("public/progress.html");
    const box = {
      esc: (s) => String(s),
      longDate: () => "18 September 2026"
    };
    vm.createContext(box);
    vm.runInContext(fnSource(html, "scoreCell"), box);
    const sample = box.scoreCell(771, "2026-09-18T08:54:06.344Z", true).html;
    assert.match(sample, /Sample report loaded 18 September 2026/);
    assert.doesNotMatch(sample, /Pulled/);
    const real = box.scoreCell(811, "2026-08-24T23:46:42.515Z", false).html;
    assert.match(real, /Pulled 18 September 2026/);
    const paint = fnSource(html, "paintScores");
    assert.ok(paint.includes("p.sample === true"), "paintScores reads the panel's own sample flag");
    assert.ok(paint.includes('<div class="note">' + NOTE + "</div>"), "the sample line is printed under the panels");
  });

  test("pipeline side drawer: a sample says loaded and prints the line; a real pull keeps Scores pulled", () => {
    const drawer = fnSource(read("public/app/pipeline.html"), "paintDrawer");
    assert.match(drawer, /if \(tm\.sample === true\) \{\s*creditMore\.appendChild\(rowAlways\("Sample report loaded", fmtWhen\(tm\.asOf\)\)\);\s*creditMore\.appendChild\(rowAlways\("Scores", "Sample scores\. Not a real credit pull\."\)\);\s*\} else \{\s*creditMore\.appendChild\(rowAlways\("Scores pulled", fmtWhen\(tm\.asOf\)\)\);/);
  });

  test("closer call screen: a sample prints the line and its date says loaded", () => {
    const js = read("public/app/closer-call.js");
    assert.ok(js.includes("if (credit.sample === true) {\n              rows += \"<tr><td>Sample</td><td>" + NOTE + "</td></tr>\";"));
    assert.ok(js.includes("(credit.sample === true ? \"Sample report loaded\" : \"Pulled\")"));
  });

  test("closer deck: both Your results slides print the line for a sample, nothing for a real pull", () => {
    const js = read("public/app/present.js");
    const box = { fine: (t) => '<p class="fine">' + t + "</p>" };
    vm.createContext(box);
    vm.runInContext(fnSource(js, "sampleLine"), box);
    assert.equal(box.sampleLine({ sample: true }), '<p class="fine">' + NOTE + "</p>");
    assert.equal(box.sampleLine({ sample: false }), "");
    assert.equal(box.sampleLine({}), "");
    assert.ok(js.includes("scores(d.fico) + sampleLine(d)"), "the funding slide");
    assert.ok(js.includes("scoreBars(d.fico) + sampleLine(d)"), "the repair slide");
  });
});
