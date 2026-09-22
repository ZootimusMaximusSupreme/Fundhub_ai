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
  isClickFunnelsPageHtml,
  nextFooterCode,
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
    { id: "s34-q1", lines: ["We got approved for 25,000 🙏🏾"], amount: "" },
    { id: "s21-b", lines: ["APPROVED!!!", "I was on such a cold streak and I finally got an approval", "No hard pull it all!!!"], amount: "" },
    { id: "s23-b", lines: ["I GOT APPROVED. LETS GOOOOOOOOO"], amount: "" },
  ];

  test("same three quotes, same words, on both pages; s33-q1 (team-written $70K) stays out", () => {
    // s34-q1's 25,000 is in the quote and on the screenshot, so its amount headline
    // stays off: the same number three times on one small card is noise.
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
  const check = new Function(`var FRESH_MS = 6 * 60 * 60 * 1000;\n${body}\nreturn fhIsBooked;`)();
  // ClickFunnels sends a real booker on from the booking page with window.location,
  // so that page is the referrer. Every case below arrives that way unless it says not.
  const FROM_BOOKING = "https://apply.fundhub.ai/funding-book-call";
  const fhIsBooked = (d, now, ref = FROM_BOOKING) => check(d, now, ref);

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

  test("a full record is not a booking unless the visitor came straight from the booking page", () => {
    // The live booking page saves the record as the form is typed, before Book is
    // pressed. Filling the form and pressing Back keeps /thank-you's first referrer.
    const rec = { ...base, capturedAt: now - 60e3 };
    for (const ref of ["", "https://fundhub.ai/", "https://apply.fundhub.ai/apply", "https://apply.fundhub.ai/thank-you", "https://apply.fundhub.ai/funding-book-call-old", "https://apply.fundhub.ai/x/funding-book-call"]) {
      assert.equal(fhIsBooked(rec, now, ref), false, `referrer ${JSON.stringify(ref)}`);
    }
    assert.equal(fhIsBooked({ ...rec, submittedAt: now - 30e3 }, now, "https://fundhub.ai/"), false);
    for (const ref of ["https://apply.fundhub.ai/funding-book-call", "https://apply.fundhub.ai/funding-book-call/", "https://apply.fundhub.ai/funding-book-call?utm_source=fb&fbclid=1"]) {
      assert.equal(fhIsBooked(rec, now, ref), true, `referrer ${ref}`);
    }
  });

  test("the page passes document.referrer to the check", () => {
    assert.match(THANKS, /fhIsBooked\(readBooking\(\), Date\.now\(\), document\.referrer\)/);
  });
});

describe("/thank-you copy for visitors with no booking", () => {
  test("one message, and it matches the button under it", () => {
    assert.ok(THANKS.includes('"One step left: pick a time for your call."'));
    assert.ok(THANKS.includes(">Pick your call time</a>"));
    assert.equal(/we'll be in touch with your next step/.test(THANKS), false, "no 'we will be in touch' above a book-now button");
    assert.equal(THANKS.includes('textContent = "You leave knowing'), false);
  });
});

describe("screenshots open full size (at 1280 wide the approvals are about 100px)", () => {
  test("both scripts make every card screenshot open on tap, click, Enter or Space and close on Escape", () => {
    for (const [src, scope] of [[WATCH, "zoomable(sec)"], [THANKS, "zoomable(proof)"]]) {
      assert.ok(src.includes(scope), scope);
      assert.ok(src.includes(`var SHOT = 'img[data-slot="approval-screenshot"]';`));
      assert.match(src, /e\.key === "Enter" \|\| e\.key === " "/);
      assert.match(src, /e\.key === "Escape"/);
      assert.ok(src.includes(".fhz{position:fixed;inset:0;"));
    }
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
    assert.ok(html.includes('<div class="t">You get one of three roads</div>'));
    assert.equal(html.includes("You leave knowing your road"), false, "the step 03 title must not repeat its own text");
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

  test("only a rendered ClickFunnels page counts as a read of the live page", () => {
    assert.equal(isClickFunnelsPageHtml(`<div data-page-element="ContentNode"></div><script src="${FH_ATTRIBUTION_SRC}"></script>`), true);
    for (const html of ["", null, undefined, "<html><title>Just a moment...</title></html>", "Service Unavailable"]) {
      assert.equal(isClickFunnelsPageHtml(html), false, String(html));
    }
  });

  test("a builder-page push stops, and writes nothing, when the live footer or page cannot be read", () => {
    // A blind write would stack fh-attribution.js and a 4th vsl-watch-beacon.js on /watch.
    const push = read("scripts/cf-push-custom-html.mjs");
    const fn = push.slice(push.indexOf("async function pushBuilderFooter("), push.indexOf("async function putCustomHtml("));
    assert.ok(fn.length > 200, "pushBuilderFooter exists");
    const stopAt = fn.indexOf("if (liveFoot === null || !liveHtml) {");
    const putAt = fn.indexOf('method: "PUT"');
    assert.ok(fn.indexOf('getPageCode(creds, pageId, "footer_code", ctx)') < stopAt, "footer_code is read first");
    assert.ok(fn.indexOf("await fetchLiveHtml(row.liveUrl, ctx)") < stopAt, "the public page is read first");
    assert.ok(stopAt > -1 && putAt > stopAt, "the unreadable check sits before the write");
    assert.match(fn.slice(stopAt, putAt), /reason: "live_page_unreadable"/);
    assert.match(push, /return isClickFunnelsPageHtml\(html\) \? html : "";/);
    assert.match(push, /const r = await pushBuilderFooter\(creds, page\.id, row, ctx, dryRun, snapDir\);\s*if \(!r\.ok\) process\.exitCode = 1;/);
  });

  test("a builder-page push sends the whole footer in replace mode and checks the read-back", () => {
    // ClickFunnels "append" stored watch-proof.js and thankyou-sort.js twice (2026-09-22).
    const push = read("scripts/cf-push-custom-html.mjs");
    const fn = push.slice(push.indexOf("async function pushBuilderFooter("), push.indexOf("async function putCustomHtml("));
    assert.match(fn, /footer_code: plan\.next, footer_code_mode: "replace"/);
    assert.equal(fn.includes('"append"'), false);
    assert.match(fn, /const verified = after\.trim\(\) === plan\.next\.trim\(\);/);
  });

  test("nextFooterCode: one copy of each owned script, other tags untouched, nothing added twice", () => {
    const t = (src) => `<script src="${src}"></script>`;
    const watchLive = [t(FH_ATTRIBUTION_SRC), t(VSL_WATCH_BEACON_SRC), t(VSL_WATCH_BEACON_SRC), t(VSL_WATCH_BEACON_SRC)].join("\n");
    const opts = { includeVslBeacon: true, extraSrcs: [WATCH_PROOF_SRC], existing: "" };

    // before the push: adds watch-proof.js once, keeps the three old beacons as they are
    const first = nextFooterCode(watchLive, opts);
    assert.equal(first.next, `${watchLive}\n${t(WATCH_PROOF_SRC)}`);
    assert.deepEqual(first.added, [WATCH_PROOF_SRC]);
    assert.equal(first.changed, true);

    // after "append" doubled it: collapses to one copy, adds nothing
    const doubled = `${watchLive}\n${t(WATCH_PROOF_SRC)}\n${t(WATCH_PROOF_SRC)}`;
    const fixed = nextFooterCode(doubled, opts);
    assert.equal(fixed.next, first.next);
    assert.deepEqual(fixed.collapsed, [WATCH_PROOF_SRC]);
    assert.deepEqual(fixed.added, []);

    // already right: no change, so no write
    assert.equal(nextFooterCode(first.next, opts).changed, false);

    // thank-you: the two old attribution tags stay; thankyou-sort.js is added once
    const tyLive = `${t(FH_ATTRIBUTION_SRC)}\n${t(FH_ATTRIBUTION_SRC)}`;
    const ty = nextFooterCode(tyLive, { includeVslBeacon: false, extraSrcs: [THANKYOU_SORT_SRC] });
    assert.equal(ty.next, `${tyLive}\n${t(THANKYOU_SORT_SRC)}`);

    // empty footer on a page whose public HTML already loads attribution
    const blank = nextFooterCode("", { includeVslBeacon: false, extraSrcs: [THANKYOU_SORT_SRC], existing: `<body>${t(FH_ATTRIBUTION_SRC)}</body>` });
    assert.equal(blank.next, t(THANKYOU_SORT_SRC));
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
