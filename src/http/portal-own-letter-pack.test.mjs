// What You Own — the Capital Blueprint's letter pack on the funding path.
// The page's own code, RUN, not read.
//
// WHY THIS FILE EXISTS. Live look 2026-09-17, hole 2. Client 029964c5 bought the
// Capital Blueprint. Her What You Own list said "Metro 2 Dispute Letter Pack —
// Not ready yet", and it would have said that forever: the row waited for a
// document with subtype metro2_dispute_letter_pack, and no code path ever saves
// one for a funding-path buyer. HARD RULE 1 in src/workflows/ds-02-diy-letters.mjs
// and test F41 in src/sales/closer-deck.test.mjs both say so, on purpose.
//
// What the Blueprint promises is a "Dispute Letter Pack" (UWIQ_DELIVERABLES_CONTENTS,
// src/config/offers.mjs). On the funding path that pack IS the funding letters
// the deliverables package saves — inquiry removal and personal info
// (src/sales/closer-deck.mjs education branch → persistFundingLetterFiles). She
// had six of them, each already downloadable further down the same list.
//
// So the row is judged here by what a person sees, for four real shapes of
// client, and the three that are not a funding-path Blueprint buyer must come
// out exactly as they did before.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { UWIQ_DELIVERABLES_CONTENTS } from "../config/offers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_FILE = path.resolve(HERE, "../../public/app/client-portal.html");

/** The What You Own block, cut out of the page rather than copied. */
function ownSource() {
  const html = fs.readFileSync(PORTAL_FILE, "utf8");
  const start = html.indexOf("var OWN_CODES = [");
  const end = html.indexOf("var PACKET_KINDS = ");
  assert.ok(start > 0 && end > start, "could not find the What You Own block in client-portal.html");
  return html.slice(start, end);
}

const OWN_SOURCE = ownSource();

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Run the page's own ownRows + paintOwn for one client and read the list back. */
function whatYouOwn({ codes, docs }) {
  const list = { innerHTML: "" };
  const classes = new Set();
  const ctx = vm.createContext({
    esc,
    localStorage: { getItem: () => "" },
    document: {
      getElementById: (id) => (id === "own-list" ? list : null),
      body: {
        classList: {
          toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
        }
      }
    }
  });
  vm.runInContext(OWN_SOURCE, ctx);
  ctx.docsOnFile = docs;
  const names = {
    "credit-optimization-roadmap": "Credit Optimization Roadmap",
    "metro2-letter-pack": "Metro 2 Dispute Letter Pack",
    "funding-snapshot": "Funding Snapshot"
  };
  const active = {};
  for (const code of codes) {
    active[code] = { entitlement_code: code, entitlement_name: names[code], active: true };
  }
  // Rows are built inside the vm's own realm; a JSON round trip hands them back
  // as plain objects this file's deepEqual can compare.
  const rows = JSON.parse(JSON.stringify(ctx.ownRows(active)));
  ctx.paintOwn(active);
  return { rows, html: list.innerHTML, hidden: classes.has("no-own") };
}

function doc(id, subtype, title, url = `https://fundhub.test/api/documents/${id}`) {
  return { id, kind: "deliverable", subtype, title, download: url ? { url } : null };
}

// Client 029964c5 (#11) as the live portal-summary returned her, newest first.
const ELEVEN_DOCS = [
  { id: "c1", kind: "contract", subtype: "funding_agreement", title: "Funding Agreement (signed)", download: { url: "u" } },
  doc("pi-eq", "funding_personal_info", "Personal info — EQ"),
  doc("pi-tu", "funding_personal_info", "Personal info — TU"),
  doc("pi-ex", "funding_personal_info", "Personal info — EX"),
  doc("ir-eq", "funding_inquiry_removal", "Inquiry removal — EQ"),
  doc("ir-tu", "funding_inquiry_removal", "Inquiry removal — TU"),
  doc("ir-ex", "funding_inquiry_removal", "Inquiry removal — EX"),
  doc("crs", "funding_summary", "Capital Readiness Summary"),
  doc("road", "credit_optimization_roadmap", "Credit Optimization Roadmap"),
  doc("bank", "bank_lender_match_list", "Bank and Lender Match List"),
  doc("snap", "funding_snapshot", "Funding Snapshot"),
  doc("car", "credit_analysis_report", "Credit Analysis Report")
];
const LETTER_IDS = ["pi-eq", "pi-tu", "pi-ex", "ir-eq", "ir-tu", "ir-ex"];

describe("What You Own — the Blueprint letter pack on the funding path", () => {
  test("#11: no paid item says 'Not ready yet' — the pack row is ready and names the offer's own item", () => {
    const { rows, html } = whatYouOwn({
      codes: ["credit-optimization-roadmap", "metro2-letter-pack"],
      docs: ELEVEN_DOCS
    });
    assert.ok(!html.includes("Not ready yet"), "a paid item must not read 'Not ready yet' when its letters are on file");
    assert.ok(!html.includes("not built yet"), "the letters exist, so nothing here is 'not built yet'");
    assert.ok(!rows.some((r) => r.name === "Metro 2 Dispute Letter Pack"),
      "funding letters are not Metro 2 letters, so the row must not say Metro 2");
    const pack = rows.find((r) => r.name === "Dispute Letter Pack");
    assert.ok(pack, "the pack row must be there, under the Blueprint's own name for it");
    assert.equal(pack.letters, 6, "the pack counts the six funding letters on her file");
    assert.ok(UWIQ_DELIVERABLES_CONTENTS.includes(pack.name),
      "the row name must be the Blueprint contents list's own words (src/config/offers.mjs)");
    assert.match(html, /Ready\. Your 6 letters are listed just below\./);
  });

  test("#11: each letter is listed once, right under the pack, still with its own Download", () => {
    const { rows, html } = whatYouOwn({
      codes: ["credit-optimization-roadmap", "metro2-letter-pack"],
      docs: ELEVEN_DOCS
    });
    const at = rows.findIndex((r) => r.name === "Dispute Letter Pack");
    const next = rows.slice(at + 1, at + 7).map((r) => r.doc && r.doc.id);
    assert.deepEqual(next, LETTER_IDS, "the six letters sit directly under the pack row, newest first");
    for (const id of LETTER_IDS) {
      assert.equal(rows.filter((r) => r.doc && r.doc.id === id).length, 1, `letter ${id} must appear exactly once`);
      assert.ok(html.includes(`/api/documents/${id}"`), `letter ${id} keeps its own Download link`);
    }
    // Nothing else she owns went missing: 1 roadmap + 1 pack + 6 letters + 4 other deliverables.
    assert.equal(rows.length, 12);
  });

  test("#9 shape (repair only, no Blueprint, nothing built yet): the Metro 2 row is exactly as before", () => {
    const { rows, html } = whatYouOwn({ codes: ["metro2-letter-pack"], docs: [] });
    assert.deepEqual(rows.map((r) => r.name), ["Metro 2 Dispute Letter Pack"]);
    assert.equal(rows[0].doc, null);
    assert.ok(html.includes("Not ready yet"), "a repair client whose letters are not built still sees 'Not ready yet'");
  });

  test("a Blueprint buyer on the repair path with a real Metro 2 pack keeps the Metro 2 row and its file", () => {
    const { rows, html } = whatYouOwn({
      codes: ["credit-optimization-roadmap", "metro2-letter-pack"],
      docs: [doc("m2", "metro2_dispute_letter_pack", "Metro 2 Dispute Letter Pack"),
        doc("road", "credit_optimization_roadmap", "Credit Optimization Roadmap")]
    });
    const row = rows.find((r) => r.name === "Metro 2 Dispute Letter Pack");
    assert.ok(row && row.doc && row.doc.id === "m2", "a real Metro 2 file always wins");
    assert.ok(!rows.some((r) => r.name === "Dispute Letter Pack"));
    assert.ok(html.includes('/api/documents/m2"'));
  });

  test("a funding-tier client who bought repair (no Blueprint) keeps the Metro 2 row — funding letters stay their own rows", () => {
    const { rows } = whatYouOwn({
      codes: ["metro2-letter-pack"],
      docs: [doc("pi-eq", "funding_personal_info", "Personal info — EQ"),
        doc("ir-eq", "funding_inquiry_removal", "Inquiry removal — EQ")]
    });
    assert.deepEqual(rows.map((r) => r.name),
      ["Metro 2 Dispute Letter Pack", "Personal info — EQ", "Inquiry removal — EQ"]);
    assert.equal(rows[0].doc, null, "their Metro 2 letters are a different thing and are not built yet");
  });
});
