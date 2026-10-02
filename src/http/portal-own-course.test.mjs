// What You Own — the course a client bought is listed, and it opens its card.
// The page's own code, RUN, not read.
//
// WHY THIS FILE EXISTS. Live look 2026-09-18, hole 11. Client #12 (f01cc0e0)
// bought Capital Academy. That product grants exactly one code,
// funding-mastery-course (db/migrations/181_offer_prices_and_trial_product.sql),
// and the live entitlements read returned it, active, named "Funding Mastery
// course (A to Z)". Unlock More said "Included — you own this". What You Own,
// right above it, said "Nothing to download yet" — because that list was built
// only from the five document codes in OWN_CODES, and a course is not one.
//
// The course has no file to hand over. It plays inside its own Unlock More card
// (owner decision 2026-08-21, ops/workflows/archive/portal-course-surface-2026-08-21.md).
// So the row names the course, says plainly it is not a file, and its button
// points at that card. Nothing is invented: no download, no "ready" file.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_FILE = path.resolve(HERE, "../../public/app/client-portal.html");
const HTML = fs.readFileSync(PORTAL_FILE, "utf8");

/** The What You Own block, cut out of the page rather than copied. */
function ownSource() {
  const start = HTML.indexOf("var OWN_CODES = [");
  const end = HTML.indexOf("var PACKET_KINDS = ");
  assert.ok(start > 0 && end > start, "could not find the What You Own block in client-portal.html");
  return HTML.slice(start, end);
}

const OWN_SOURCE = ownSource();

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Catalog names as the live entitlements read returned them (2026-09-18).
const NAMES = {
  "funding-mastery-course": "Funding Mastery course (A to Z)",
  "credit-optimization-roadmap": "Credit Optimization Roadmap"
};

/** Run the page's own ownRows + paintOwn for one client and read the list back. */
function whatYouOwn({ codes, docs }) {
  const list = { innerHTML: "" };
  const classes = new Set(["no-own"]);
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
  const active = {};
  for (const code of codes) {
    active[code] = { entitlement_code: code, entitlement_name: NAMES[code], active: true };
  }
  const rows = JSON.parse(JSON.stringify(ctx.ownRows(active)));
  ctx.paintOwn(active);
  return { rows, html: list.innerHTML, empty: classes.has("no-own") };
}

// #12 as the live portal-summary returned it: two contracts, no deliverable.
const TWELVE_DOCS = [
  { id: "c1", kind: "contract", subtype: "funding_agreement", title: "Funding Agreement (signed)", download: { url: "u1" } },
  { id: "c2", kind: "contract", subtype: "funding_agreement", title: "Funding Agreement", download: { url: "u2" } }
];

describe("What You Own — the course a client bought (hole 11)", () => {
  test("#12: the list is not empty — it names the course she owns", () => {
    const { rows, html, empty } = whatYouOwn({ codes: ["funding-mastery-course"], docs: TWELVE_DOCS });
    assert.equal(empty, false, "What You Own must not show 'Nothing to download yet' to a course owner");
    assert.deepEqual(rows.map((r) => r.name), ["Funding Mastery course (A to Z)"]);
    assert.ok(html.includes("Funding Mastery course (A to Z)"));
  });

  test("#12: the row says it is a course, not a file, and offers no download", () => {
    const { html } = whatYouOwn({ codes: ["funding-mastery-course"], docs: TWELVE_DOCS });
    assert.match(html, /It is a course, not a file/);
    assert.ok(!/Download/.test(html), "a course has no file, so nothing offers a Download");
    assert.ok(!/href=/.test(html), "no link is invented for the course");
    assert.ok(!/not built yet|Not ready yet/.test(html), "the course is owned now, not waiting to be built");
  });

  test("#12: the row's button points at the Capital Academy card that holds the course", () => {
    const { html } = whatYouOwn({ codes: ["funding-mastery-course"], docs: TWELVE_DOCS });
    const m = html.match(/<button[^>]*data-own-course="([^"]+)"[^>]*>([^<]+)<\/button>/);
    assert.ok(m, "the row carries a button");
    assert.equal(m[2], "Open course");
    const tile = m[1];
    // The card is always on the grid (owner-set 2026-09-25: "please make sure
    // all the offers are there"), so the button this row carries always has a
    // card to open. An owned-only cut was tried earlier the same evening and
    // reversed; nothing on the page may hide an offer card again.
    assert.ok(HTML.includes(`<article class="tile locked" data-tile="${tile}">`),
      `card ${tile} exists on the page and is not hidden from anyone`);
    assert.ok(!/OWNED_ONLY/.test(HTML), "no owned-only hide list may return to this page");
    const card = HTML.slice(HTML.indexOf(`data-tile="${tile}"`), HTML.indexOf("</article>", HTML.indexOf(`data-tile="${tile}"`)));
    assert.match(card, /Capital Academy/, "the card the button opens is the one the row names");
    assert.match(card, /class="tile-course"/, "that card holds the course modules");
    const mapped = HTML.match(new RegExp(`${tile}:\\s*"([^"]+)"`));
    assert.ok(mapped && mapped[1] === "funding-mastery-course",
      "the card unlocks on the same code the row is built from, so the button never opens a locked card");
  });

  test("the page wires the button: a click opens the card", () => {
    assert.match(HTML, /e\.target\.closest\("\[data-own-course\]"\)/);
    assert.match(HTML, /setCourseOpen\(courseTile, true\)/);
  });

  test("a client without the course gets no course row — nothing is invented", () => {
    const none = whatYouOwn({ codes: [], docs: TWELVE_DOCS });
    assert.equal(none.empty, true, "no grant and no deliverable still reads as empty");
    assert.deepEqual(none.rows, []);
    const blueprint = whatYouOwn({ codes: ["credit-optimization-roadmap"], docs: [] });
    assert.deepEqual(blueprint.rows.map((r) => r.name), ["Credit Optimization Roadmap"]);
    assert.ok(!blueprint.html.includes("data-own-course"));
  });
});
