// src/ads/funnel-proof-scripts.test.mjs — the /watch proof block and the
// /thank-you Sorting Hat script, proved against the files fundhub.ai serves.
//
// Both ClickFunnels pages are builder pages: their body cannot be replaced by
// API, so the new sections ride in on footer scripts (public/funnel/*.js). This
// test holds those scripts to the proof-card law
// (.claude/rules/proof-cards-from-source.md) and to the booking check (T14-01)
// they now carry.
//
// WHAT THIS CANNOT TEST: layout, image loading and the live page. That is the
// Playwright walk recorded on the board (docs/workflows/2026-09-22-watch-proof.md).
//
// npm test's glob is src/** and scripts/** only (CLAUDE.md §12).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PUSH_MANIFEST,
  WATCH_PROOF_SRC,
  THANKYOU_SORT_SRC,
  VSL_WATCH_BEACON_SRC,
  FH_ATTRIBUTION_SRC,
  trackingFooterScripts,
} from "../../clickfunnels-fragments/tracking-manifest.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const WATCH = read("public/funnel/watch-proof.js");
const THANKS = read("public/funnel/thankyou-sort.js");
const TEMPLATE = read("clickfunnels-fragments/slo/fundhub-proof-cards.html");
const TEMPLATE_CSS = TEMPLATE.slice(TEMPLATE.indexOf("<style>") + "<style>".length, TEMPLATE.indexOf("</style>"));
const DECK = JSON.parse(read("clickfunnels-fragments/slo/client-wins/deck.json"));

function arrayLiteral(src, name) {
  const start = src.indexOf(`var ${name} = [`);
  assert.ok(start > -1, `${name} is missing`);
  const body = src.slice(start + `var ${name} = `.length, src.indexOf("];", start) + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${body};`)();
}

describe("proof cards are the template, not a copy that drifted", () => {
  test("both scripts carry the template's CSS verbatim", () => {
    assert.ok(TEMPLATE_CSS.length > 1000);
    assert.ok(WATCH.includes(TEMPLATE_CSS), "watch-proof.js template CSS differs from fundhub-proof-cards.html");
    assert.ok(THANKS.includes(TEMPLATE_CSS), "thankyou-sort.js template CSS differs from fundhub-proof-cards.html");
  });

  test("every card uses the template switches with photo off and name off", () => {
    for (const src of [WATCH, THANKS]) {
      assert.match(src, /'<article class="fh-card" data-layout="' \+ o\.layout \+ '" data-photo="off" data-name="off" data-amount="'/);
      for (const slot of ["face", "dollar-amount", "approval-screenshot", "quote", "name"]) {
        assert.ok(src.includes(`data-slot="${slot}"`), `slot ${slot} kept`);
      }
    }
  });
});

describe("every approval is a real deck crop with the amount read off it", () => {
  const byId = new Map(DECK.cards.map((c) => [c.id, c]));
  const money = (n) => `$${n.toLocaleString("en-US")}`;

  for (const [name, src, ids] of [
    ["/watch", WATCH, ["t-74k-chase-ink", "d-54k-ink", "t-50k-keybank", "t-50k-chase", "d-41k-chase-ink", "t-25k-highland"]],
    ["/thank-you", THANKS, ["t-74k-chase-ink", "t-50k-keybank", "t-25k-highland"]],
  ]) {
    test(`${name} shows exactly the planned approvals, amounts and images from deck.json`, () => {
      const wins = arrayLiteral(src, "WINS");
      assert.deepEqual(wins.map((w) => w.id), ids);
      for (const w of wins) {
        const card = byId.get(w.id);
        assert.ok(card, `${w.id} is in deck.json`);
        assert.equal(card.kind, "win");
        assert.equal(w.amount, money(card.amount_dollars), `${w.id} amount`);
        assert.equal(w.src, card.image.url, `${w.id} image`);
        assert.ok(card.amount_dollars < 100000, "the $400K+ lines stay out: not proven client wins");
      }
    });
  }
});

describe("the three client texts are the client's own words", () => {
  const EXPECTED = [
    { id: "s34-q1", lines: ["We got approved for 25,000 🙏🏾"], amount: "25,000" },
    { id: "s21-b", lines: ["APPROVED!!!", "I was on such a cold streak and I finally got an approval", "No hard pull it all!!!"], amount: "" },
    { id: "s23-b", lines: ["I GOT APPROVED. LETS GOOOOOOOOO"], amount: "" },
  ];

  test("same three quotes, same words, on both pages; s33-q1 (team-written $70K) stays out", () => {
    for (const src of [WATCH, THANKS]) {
      const texts = arrayLiteral(src, "TEXTS");
      assert.deepEqual(texts.map(({ id, lines, amount }) => ({ id, lines, amount })), EXPECTED);
      assert.equal(src.includes("s33-q1"), false);
      for (const t of texts) {
        assert.match(t.source, /^Real client text\. Source: Canva Client Wins deck, slide \d+/, `${t.id} names its source`);
        assert.equal(t.src, `https://fundhub.ai/funnel/proof/${t.id}.jpg`);
      }
    }
  });

  test("the served crops are byte-for-byte the deck crops", () => {
    for (const { id } of EXPECTED) {
      const served = fs.readFileSync(path.join(ROOT, "public/funnel/proof", `${id}.jpg`));
      const deck = fs.readFileSync(path.join(ROOT, "clickfunnels-fragments/slo/client-wins/deck", `${id}.jpg`));
      assert.ok(served.equals(deck), `${id}.jpg`);
    }
  });
});

describe("no links off the page", () => {
  test("the only links the scripts add go to the next funnel step", () => {
    const hrefs = (src) => [...new Set([...src.matchAll(/href="([^"]*)"/g)].map((m) => m[1]))];
    assert.deepEqual(hrefs(WATCH), ["/apply"]);
    assert.deepEqual(hrefs(THANKS), ["/funding-book-call"]);
    assert.equal(/make sure you show up/i.test(THANKS), false);
  });
});

describe("fhIsBooked — the thank-you page claims a booking only when one exists (T14-01)", () => {
  const START = "BOOKING CHECK START";
  const END = "BOOKING CHECK END";
  const a = THANKS.indexOf(START);
  const b = THANKS.indexOf(END);
  assert.ok(a > -1 && b > a, "booking check markers");
  const body = THANKS.slice(THANKS.indexOf("*/", a) + 2, THANKS.lastIndexOf("/*", b));
  // eslint-disable-next-line no-new-func
  const fhIsBooked = new Function(`var FRESH_MS = 6 * 60 * 60 * 1000;\n${body}\nreturn fhIsBooked;`)();

  const now = Date.parse("2026-09-22T15:00:00Z");
  const H = 3600e3;
  const base = {
    start: new Date(now + 26 * H).toISOString(),
    end: new Date(now + 26.5 * H).toISOString(),
    name: "Pat",
    email: "pat@example.com",
  };

  test("nothing stored, or junk, is not a booking", () => {
    assert.equal(fhIsBooked(null, now), false);
    assert.equal(fhIsBooked("x", now), false);
    assert.equal(fhIsBooked({}, now), false);
  });

  test("the live booking page's record (capturedAt only) counts when fresh", () => {
    assert.equal(fhIsBooked({ ...base, capturedAt: now - 60e3 }, now), true);
  });

  test("the repo booking page's record (submittedAt) counts when fresh", () => {
    assert.equal(fhIsBooked({ ...base, capturedAt: now - 60e3, submittedAt: now - 30e3 }, now), true);
  });

  test("a time slot clicked with an empty form is not a booking", () => {
    assert.equal(fhIsBooked({ ...base, name: "", email: "", capturedAt: now }, now), false);
  });

  test("older than six hours is not a booking", () => {
    assert.equal(fhIsBooked({ ...base, capturedAt: now - 7 * H }, now), false);
  });

  test("an appointment already in the past is not a booking", () => {
    assert.equal(fhIsBooked({ ...base, start: new Date(now - H).toISOString(), capturedAt: now - 60e3 }, now), false);
  });

  test("a stamp far in the future is not trusted", () => {
    assert.equal(fhIsBooked({ ...base, capturedAt: now + 7 * H }, now), false);
  });
});

describe("the fragments and the push manifest load the scripts once", () => {
  test("01-vsl.html loads watch-proof.js after the attribution script and the beacon", () => {
    const html = read("clickfunnels-fragments/01-vsl.html");
    const at = (s) => html.indexOf(s);
    assert.ok(at(WATCH_PROOF_SRC) > at(VSL_WATCH_BEACON_SRC) && at(VSL_WATCH_BEACON_SRC) > at(FH_ATTRIBUTION_SRC));
  });

  test("05-thank-you.html loads thankyou-sort.js and no longer carries its own booking check", () => {
    const html = read("clickfunnels-fragments/05-thank-you.html");
    assert.ok(html.includes(`<script src="${THANKYOU_SORT_SRC}"></script>`));
    assert.equal(html.includes("T14-01: nothing on this page may claim"), false, "the check lives in thankyou-sort.js now");
    assert.equal(html.includes("You get your exact funding number"), false);
    assert.ok(html.includes("You leave knowing your road"));
  });

  test("only /watch and /thank-you get the new footer scripts", () => {
    const withExtras = PUSH_MANIFEST.filter((r) => r.extraFooterScripts?.length);
    assert.deepEqual(
      withExtras.map((r) => [r.key, r.pageId, r.extraFooterScripts]),
      [
        ["apply-watch", "25061160", [WATCH_PROOF_SRC]],
        ["apply-thank-you", "25063539", [THANKYOU_SORT_SRC]],
      ],
    );
  });

  test("trackingFooterScripts skips any src already on the page and never repeats one", () => {
    const livePage = `<script src="${FH_ATTRIBUTION_SRC}"></script>` +
      `<script src="${VSL_WATCH_BEACON_SRC}"></script>`.repeat(3);
    assert.equal(
      trackingFooterScripts({ includeVslBeacon: true, skipAttribution: false, extraSrcs: [WATCH_PROOF_SRC], existing: livePage }),
      `<script src="${WATCH_PROOF_SRC}"></script>`,
    );
    assert.equal(
      trackingFooterScripts({ includeVslBeacon: true, skipAttribution: false, extraSrcs: [WATCH_PROOF_SRC], existing: livePage + `<script src="${WATCH_PROOF_SRC}"></script>` }),
      "",
    );
    assert.equal(
      trackingFooterScripts({ includeVslBeacon: false, skipAttribution: true, extraSrcs: [THANKYOU_SORT_SRC, THANKYOU_SORT_SRC] }),
      `<script src="${THANKYOU_SORT_SRC}"></script>`,
    );
  });
});
