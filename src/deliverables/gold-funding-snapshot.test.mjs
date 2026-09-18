// The Capital Readiness Snapshot in the gold look (W4a, 2026-09-17).
//
// What the hosted funding snapshot must be true of now that it draws the gold
// pack (docs/workflows/gold-deliverables-v5/funding_snapshot.pdf): every gold
// section in the gold order, the gold waterfall where the file supports one and
// nowhere else, the gold blocks, the owner-set booking link, and not one of the
// builder's sentences lost on the way. The old look is pinned separately by
// port-parity.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderDeliverableHtml } from "./index.mjs";
import { buildFundingSnapshot } from "./funding-snapshot.mjs";
import { cover, ctaPage, BOOK_CALL_URL, GOLD } from "./chrome.mjs";
import { lenderBuckets, fastestWins } from "./derive.mjs";
import { emptyBlackReportClient } from "../underwrite/black-report-client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => JSON.parse(readFileSync(join(HERE, "fixtures", `${n}.json`), "utf8"));

const CLIENTS = {
  jordan: fixture("jordan-sample-client"),
  repair: fixture("repair-client"),
  academy: fixture("academy-client"),
  noLimit: fixture("no-limit-client"),
  zeroLimit: fixture("zero-limit-client"),
  empty: emptyBlackReportClient()
};

const page = (client) =>
  renderDeliverableHtml({ client, doc: "funding_snapshot", fontsHref: "/assets/fonts" }).html;
const PAGES = Object.fromEntries(Object.entries(CLIENTS).map(([k, c]) => [k, page(c)]));

/** What a reader sees: tags out, charts out, whitespace collapsed. */
const textOf = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim();

const COVER_TITLE = ["funding snapshot", "Capital Readiness Snapshot"];

/** The builder's body with the cover and the closing panel taken off. */
function bodyOf(client, opts) {
  const html = buildFundingSnapshot(client, opts);
  const cov = cover(client, ...COVER_TITLE, opts);
  const cta = ctaPage(client, opts);
  assert.ok(html.startsWith(cov), "the document opens on the cover");
  assert.ok(html.endsWith(cta), "the document closes on the closing panel");
  return html.slice(cov.length, html.length - cta.length);
}

const WATERFALL = /<div class="chart"><svg[^>]*aria-label="Funding waterfall:/g;

describe("W4a: every gold section, in the gold order", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: cover, 01-06, closing panel`, () => {
      const html = PAGES[name];
      const [, locked] = lenderBuckets(client);
      const want = [
        '<div class="cover">',
        '<div class="eyebrow">01 / NUMBERS</div><h2>Your Numbers Right Now</h2>',
        '<div class="eyebrow">02 / BREAKDOWN</div><h2>Breakdown by Category</h2>',
        "<h3>Personal Cards</h3>",
        "<h3>Installment Loans</h3>",
        "<h3>Mortgage / Real Estate</h3>",
        "<h3>Child Support / Public Obligations</h3>",
        "<h3>Business Accounts</h3>",
        '<div class="eyebrow">03 / COSTING YOU</div><h2>What Is Costing You Money</h2>',
        '<div class="eyebrow">04 / NOT A FACTOR</div><h2>What Does Not Affect Your Funding</h2>',
        ...(locked.length
          ? ['<div class="eyebrow">05 / AFTER OPTIMIZATION</div>'
            + "<h2>Where You Could Be - After Optimization</h2>"]
          : []),
        '<div class="eyebrow">06 / NEXT STEP</div><h2>Your Next Step</h2>',
        '<div class="cta-page">'
      ];
      let at = -1;
      for (const w of want) {
        const i = html.indexOf(w);
        assert.ok(i > at, `${name}: "${w}" missing or out of order`);
        at = i;
      }
      const eyebrows = (html.match(/<div class="eyebrow">\d\d \//g) || []).length;
      assert.equal(eyebrows, locked.length ? 6 : 5);
      if (!locked.length) assert.ok(!html.includes("05 / AFTER OPTIMIZATION"), "no invented lenders");
    });
  }

  test("the gold cover, the gold tables and the gold closing panel are used", () => {
    const html = PAGES.jordan;
    assert.ok(html.includes('<div class="cover"><div class="spec-top"></div>'));
    assert.ok(html.includes('<div class="cta-page"><div class="spec-top"></div>'));
    assert.ok(html.includes('<div class="qr">[ QR CODE ]</div>'));
    // 01, Personal Cards, Installment, Mortgage, Child Support, 05 lenders.
    assert.equal((html.match(/<table class="fh">/g) || []).length, 6);
    assert.ok(!/<table>/.test(html), "no old-look table is left");
  });
});

describe("W4a: the waterfall in 01, only where the file supports it", () => {
  test("Jordan: drawn once, in 01, with the file's own three figures", () => {
    const html = PAGES.jordan;
    assert.equal((html.match(WATERFALL) || []).length, 1);
    assert.ok(html.includes('aria-label="Funding waterfall: TODAY $7,936, UTILIZATION FIX '
      + '+$11,905, PROJECTED $19,841"'));
    const at = html.search(WATERFALL);
    assert.ok(at > html.indexOf("01 / NUMBERS") && at < html.indexOf("02 / BREAKDOWN"));
    // The cards with a balance above a 10% target, one per account: the same
    // count the credit analysis prints, so the two pages agree (gold: "Pay down two cards").
    assert.ok(html.includes("Pay down your 2 open revolving cards."), "the card count is the file's");
    assert.ok(!html.includes('<svg class="diagram"'), "the old chart is gone");
  });

  test("Jordan: the bars stand in the file's proportions (within 1%)", () => {
    const svg = PAGES.jordan.match(/<svg[^>]*aria-label="Funding waterfall[\s\S]*?<\/svg>/)[0];
    const inks = [...svg.matchAll(/<rect [^>]*height="([\d.]+)" fill="#0C0C0D"\/>/g)]
      .map((m) => Number(m[1]));
    assert.equal(inks.length, 2, "TODAY and PROJECTED are the two ink bars");
    const ratio = inks[0] / inks[1];
    assert.ok(Math.abs(ratio - 7936 / 19841) < 0.01, `ratio ${ratio}`);
  });

  test("academy: projected is above current and there are cards to pay down, so it is drawn", () => {
    assert.equal((PAGES.academy.match(WATERFALL) || []).length, 1);
  });

  /* Fix pass. The middle bar is labelled UTILIZATION FIX. These two files report
     no limit and no utilization, and 03 lists no utilization item, so a chart
     saying the gain comes from a utilization fix names a cause the file does not
     support. Suppressed, as DIAGRAM_SPEC section 6 says, rather than drawn false. */
  for (const name of ["noLimit", "zeroLimit"]) {
    test(`${name}: no utilization on the file, so no UTILIZATION FIX chart`, () => {
      assert.equal((PAGES[name].match(WATERFALL) || []).length, 0);
      assert.ok(!PAGES[name].includes("UTILIZATION FIX"));
      assert.ok(!PAGES[name].includes("<svg"));
    });
  }

  test("a gain with no card to pay down is not drawn as a utilization fix", () => {
    const base = CLIENTS.jordan;
    const noPct = base.revolving.map((r) => [r[0], r[1], r[2], null, "", "", "MONITOR"]);
    const html = buildFundingSnapshot({ ...base, revolving: noPct }, { look: GOLD });
    assert.equal((html.match(WATERFALL) || []).length, 0);
    const already = base.revolving.map((r) => [r[0], r[1], 0, 1000, "0%", "$100 or less", "CLEAN"]);
    const html2 = buildFundingSnapshot({ ...base, revolving: already }, { look: GOLD });
    assert.equal((html2.match(WATERFALL) || []).length, 0, "every balance already under target");
  });

  test("repair: $0 today and $0 projected is no gain, so no chart", () => {
    assert.equal((PAGES.repair.match(WATERFALL) || []).length, 0);
    assert.ok(!PAGES.repair.includes("<svg"), "and no other chart stands in for it");
  });

  test("empty file: no pre-approval on file, so no chart", () => {
    assert.equal((PAGES.empty.match(WATERFALL) || []).length, 0);
    assert.ok(!PAGES.empty.includes("<svg"));
  });

  test("projected below current, or one figure missing: suppressed", () => {
    const base = CLIENTS.jordan;
    for (const [label, patch] of [
      ["projected below current", { preapproval_now: 20000, preapproval_after: 15000 }],
      ["projected equal to current", { preapproval_now: 15000, preapproval_after: 15000 }],
      ["current missing", { preapproval_now: null }],
      ["projected missing", { preapproval_after: null }],
      ["current blank", { preapproval_now: "" }]
    ]) {
      const html = buildFundingSnapshot({ ...base, ...patch }, { look: GOLD });
      assert.equal((html.match(WATERFALL) || []).length, 0, label);
    }
  });
});

describe("W4a: the gold blocks", () => {
  test("03 is numbered cost items, one per item, in fix order", () => {
    const html = PAGES.jordan;
    const s03 = html.slice(html.indexOf("03 / COSTING YOU"), html.indexOf("04 / NOT A FACTOR"));
    const nums = [...s03.matchAll(/<div class="cnum">(\d+)<\/div>/g)].map((m) => Number(m[1]));
    assert.ok(nums.length >= 3);
    assert.deepEqual(nums, nums.map((_, i) => i + 1));
    assert.ok(s03.includes('<div class="ctitle">SYNCB/LEVITZ - 93% Utilization</div>'));
    assert.ok(s03.includes('<div class="cline">You owe $1,762 on a $1,894 limit.</div>'));
    assert.ok(!s03.includes('class="steps"'), "the old step list is gone");
  });

  test("04 is the gold cleanup items: bold title, lines, no number", () => {
    const html = PAGES.jordan;
    const s04 = html.slice(html.indexOf("04 / NOT A FACTOR"), html.indexOf("05 / AFTER"));
    assert.ok(s04.includes('<div class="cost"><div class="cbody"><div class="ctitle">Inquiries.</div>'));
    assert.ok(!s04.includes("cnum"));
    assert.ok(!s04.includes('<ul class="plain">'));
  });

  test("06: the warning is a callout, the wins are a numbered list, then the booking link", () => {
    const html = PAGES.jordan;
    const s06 = html.slice(html.indexOf("06 / NEXT STEP"), html.indexOf('<div class="cta-page">'));
    assert.ok(s06.includes('<div class="co"><div class="ct">Do NOT open new accounts before funding.</div>'));
    const wins = fastestWins(CLIENTS.jordan);
    assert.equal(wins.length, 3);
    assert.ok(s06.includes('<ol class="fh-ol">'));
    assert.equal((s06.match(/<li>/g) || []).length, 3);
    assert.ok(s06.includes(`<div class="co info"><div class="cb">Book your strategy call now: `
      + `<a href="${BOOK_CALL_URL}">apply.fundhub.ai/schedule/phonecall</a>.</div></div>`));
  });
});

describe("W4a: links, dashes and leaks", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: links to the booking page, never to a dead or client-held URL`, () => {
      const html = PAGES[name];
      assert.ok(html.includes(`href="${BOOK_CALL_URL}"`));
      assert.ok(!html.includes("fundhubbookingurl"));
      if (client.booking_url) assert.ok(!html.includes(client.booking_url), client.booking_url);
    });

    test(`${name}: no em or en dash, no NaN, no undefined, no banned phrase`, () => {
      const html = PAGES[name];
      /* The dash gate is on what a reader sees (DIAGRAM_SPEC 8, gate 5), so the
         stylesheet's own comments are left out; everything this builder prints,
         and the whole page body, is checked. */
      const shown = html.replace(/<style>[\s\S]*?<\/style>/, "");
      assert.ok(!/[–—]/.test(shown), "em or en dash on the page");
      assert.ok(!/[–—]/.test(buildFundingSnapshot(client, { look: GOLD })),
        "em or en dash in the builder's output");
      assert.ok(!/\bNaN\b/.test(html), "NaN");
      assert.ok(!/\bundefined\b/.test(html), "undefined");
      assert.ok(!/credit[\s-]*repair/i.test(html), "banned phrase");
      assert.ok(!/fundhub academy/i.test(html), "no Academy pitch");
    });
  }

  test("the Academy sample carries none of Jordan's file", () => {
    for (const leak of ["Jordan", "SYNCB", "SIGNET BANK", "San Antonio", "Knoll Krest"]) {
      assert.ok(!PAGES.academy.includes(leak), leak);
    }
  });
});

describe("W4a: honest empty", () => {
  test("a file with no scores and no pre-approval prints dashes, never $0", () => {
    const flat = PAGES.empty.replace(/\s+/g, " ");
    for (const label of ["Median Score", "Experian Score"]) {
      assert.ok(new RegExp(`${label}</td><td[^>]*>-</td>`).test(flat), `${label} is not "-"`);
    }
    assert.ok(/Pre-Approval<\/td><td[^>]*>-<\/td><td[^>]*>-<\/td>/.test(flat));
    assert.ok(flat.includes("- left on the table"));
    assert.ok(!flat.includes("$0 left on the table"), "an unknown gap is not $0");
  });

  test("a file that states $0 prints $0: that is the file's number", () => {
    assert.ok(PAGES.repair.includes("$0 left on the table"));
  });
});

describe("W4a: the words survive the new drawing", () => {
  test("no opts is still the old look, byte for byte", () => {
    for (const client of Object.values(CLIENTS)) {
      const a = buildFundingSnapshot(client);
      assert.equal(buildFundingSnapshot(client, {}), a);
      assert.equal(buildFundingSnapshot(client, { look: "plain" }), a);
      assert.notEqual(buildFundingSnapshot(client, { look: GOLD }), a);
      assert.ok(!a.includes('class="fh"'));
    }
  });

  /* Every sentence of the old look's prose must print in the gold look. Tables
     are checked row by row in "the fix pass" below, because the gold tables
     change on purpose: honest "-" for unknowns (owner-set), the file's own
     score targets, one row per account, the account state in STATUS.
     The only prose the gold look may leave out is listed here, each one a
     sentence the fix pass found untrue or empty for that file, and each one is
     checked to be ABSENT from gold, so the list cannot hide a loss. */
  const CAPTION = "PERSONAL LOAN PRE-APPROVAL BAND · UNDERWRITEIQ";
  const ALLOWED_GONE = {
    jordan: [],
    academy: [],
    // No chart is drawn, so the chart's caption goes with it.
    repair: [CAPTION, "Those 3 moves are what take your pre-approval from $0 toward $0."],
    noLimit: [CAPTION, "That one move is what takes your pre-approval from $50,000 toward $60,000."],
    zeroLimit: [CAPTION, "That one move is what takes your pre-approval from $50,000 toward $60,000."],
    // A heading with no list under it.
    empty: [CAPTION, "Your fastest wins:"]
  };
  /* Engine code words the gold look prints in plain words (fix pass). */
  const PLAIN = [["CollectionOrChargeOff", "Collection or charge-off"],
    ["ChargeOff", "Charge-off"], ["Late30Days", "30 days late"]];
  /* Prose only, one piece per block (heading, paragraph, line, list item), so a
     heading does not run into the sentence after it. Tables and charts out. */
  const BLOCK_END = /<\/(h[1-6]|p|div|li|ol|ul)>/g;
  const piecesOf = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<table[\s\S]*?<\/table>/g, "\u0001").replace(BLOCK_END, "\u0001")
    .replace(/<[^>]+>/g, " ").split("\u0001")
    .flatMap((b) => b.replace(/\s+/g, " ").trim().split(/(?<=[.!?:])\s+/))
    .filter(Boolean);

  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: every sentence of the old look prints in the gold look`, () => {
      const oldPieces = piecesOf(bodyOf(client));
      const goldPieces = new Set(piecesOf(bodyOf(client, { look: GOLD })));
      const gone = ALLOWED_GONE[name];
      for (const g of gone) {
        assert.ok(oldPieces.includes(g), `${name}: the old look no longer prints "${g}"`);
        assert.ok(!goldPieces.has(g), `${name}: gold still prints "${g}"`);
      }
      const plain = (t) => PLAIN.reduce((acc, [code, words]) => acc.split(code).join(words), t);
      /* A bare item number in 03 is not a sentence: dropping a repeated card
         (fix 8) renumbers the list. The items themselves are checked in fix 8. */
      const pieces = oldPieces.filter((p) => !gone.includes(p) && !/^\d+$/.test(p)).map(plain);
      assert.ok(pieces.length > 10);
      for (const p of pieces) assert.ok(goldPieces.has(p), `${name}: lost "${p}"`);
    });
  }
});

/* ------------------------------------------------------------ fix pass -- */
/* One describe per checker finding (2026-09-17, second pass). */

/** The gold 02 section only. */
const s02 = (html) => html.slice(html.indexOf("02 / BREAKDOWN"), html.indexOf("03 / COSTING YOU"));
const s03 = (html) => html.slice(html.indexOf("03 / COSTING YOU"), html.indexOf("04 / NOT A FACTOR"));
const s06 = (html) => html.slice(html.indexOf("06 / NEXT STEP"), html.indexOf('<div class="cta-page">'));
/** The rows of the first gold table after an <h3>. */
function rowsUnder(html, h3) {
  const at = html.indexOf(`<h3>${h3}</h3>`);
  const next = html.indexOf("<h3>", at + 4);
  const block = html.slice(at, next < 0 ? undefined : next);
  const body = (block.match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ""])[1];
  const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return (body.match(/<tr>[\s\S]*?<\/tr>/g) || []).map((tr) =>
    (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map((td) => unesc(textOf(td))));
}
const flatRow = (tr) => tr.join(" | ");

describe("fix 1: AFTER OPTIMIZATION scores are the file's own targets, never a typed 700+", () => {
  test("Jordan: the file's targets", () => {
    const flat = PAGES.jordan.replace(/\s+/g, " ");
    assert.ok(/Median Score<\/td><td[^>]*>636<\/td><td[^>]*>680-710 \(projected\)<\/td>/.test(flat));
    assert.ok(/Experian Score<\/td><td[^>]*>630<\/td><td[^>]*>690\+<\/td>/.test(flat));
  });

  for (const name of ["repair", "academy", "noLimit", "zeroLimit", "empty"]) {
    test(`${name}: no target on file prints "-"`, () => {
      const flat = PAGES[name].replace(/\s+/g, " ");
      for (const label of ["Median Score", "Experian Score"]) {
        assert.ok(new RegExp(`${label}</td><td[^>]*>[^<]*</td><td[^>]*>-</td>`).test(flat),
          `${name}: ${label} after optimization is not "-"`);
      }
    });
  }

  for (const [name, html] of Object.entries(PAGES)) {
    test(`${name}: "700+ (projected)" is on no gold page`, () => {
      assert.ok(!html.includes("700+ (projected)"));
    });
  }

  test("the default look still prints the old cell (parity is pinned elsewhere)", () => {
    assert.ok(buildFundingSnapshot(CLIENTS.empty).includes("700+ (projected)"));
  });
});

describe("fix 2: the chart caption prints only under a drawn chart", () => {
  const CAP = '<div class="note">PERSONAL LOAN PRE-APPROVAL BAND · UNDERWRITEIQ</div>';
  for (const [name, html] of Object.entries(PAGES)) {
    test(`${name}: one caption per waterfall, directly under it`, () => {
      const charts = (html.match(WATERFALL) || []).length;
      assert.equal(html.split(CAP).length - 1, charts);
      if (charts) assert.ok(html.includes(`</svg></div>${CAP}`), "the caption follows the chart");
    });
  }
});

describe("fix 3: no \"Your fastest wins:\" heading over an empty list", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: the heading prints only with wins under it`, () => {
      const s = s06(PAGES[name]);
      const hasWins = fastestWins(client).length > 0;
      assert.equal(s.includes("Your fastest wins:"), hasWins);
      assert.ok(!s.includes('<ol class="fh-ol"></ol>'), "an empty list");
    });
  }
  test("empty: the warning goes straight to the booking box", () => {
    const s = s06(PAGES.empty);
    assert.ok(!s.includes("<ol"));
    assert.ok(s.includes("Book your strategy call now:"));
  });
});

describe("fix 4: a category with no rows says so, never a header-only table", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    test(`${name}: every gold table has a row, and every empty category reads "None on file."`, () => {
      for (const t of html.match(/<table class="fh">[\s\S]*?<\/table>/g) || []) {
        assert.ok(/<tbody><tr>/.test(t), `${name}: a table with headers and no rows`);
      }
      const b = s02(html);
      for (const h3 of ["Personal Cards", "Installment Loans", "Mortgage / Real Estate",
        "Child Support / Public Obligations"]) {
        const at = b.indexOf(`<h3>${h3}</h3>`);
        const after = b.slice(at + h3.length + 9);
        assert.ok(after.startsWith('<table class="fh">') || after.startsWith("<p>None on file.</p>"),
          `${name}: ${h3} is followed by neither a table nor the empty line`);
      }
    });
  }
  test("empty file: all four categories read \"None on file.\"", () => {
    assert.equal(s02(PAGES.empty).split("<p>None on file.</p>").length - 1, 4);
  });
  test("Jordan: every category has rows, so no empty line", () => {
    assert.ok(!PAGES.jordan.includes("None on file."));
  });
});

describe("fix 5: Personal Cards print the flag once, the account state in STATUS", () => {
  test("Jordan: the gold rows", () => {
    const rows = rowsUnder(PAGES.jordan, "Personal Cards").map(flatRow);
    assert.deepEqual(rows, [
      "SYNCB/LEVITZ | Open | $1,762 | $1,894 | 93% CRITICAL",
      "CITIBANK SD NA | Open | $429 | $624 | 69% HIGH",
      "BENEFICIAL | Open | $239 | - | Unknown MONITOR",
      "CAPITAL ONE | Closed | $124 | $558 (high bal) | Closed",
      "DISCOVERCARD (x2) | Open | $0 | - | 0% CLEAN",
      "SYNCB/LEVITZ (old) | Closed | $0 | $1,230 (high bal) | Paid/Closed CLEAN"
    ]);
  });

  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: no row prints its status flag twice`, () => {
      for (const tr of rowsUnder(PAGES[name], "Personal Cards")) {
        assert.ok(["Open", "Closed", "-"].includes(tr[1]), `STATUS "${tr[1]}"`);
        const flags = tr.join(" ").match(/\b(CRITICAL|HIGH|MONITOR|CLEAN|CLOSED)\b/g) || [];
        assert.ok(flags.length <= 1, `${name}: "${flatRow(tr)}"`);
      }
      assert.ok(!/<span class="chip [a-z]+">CLOSED<\/span>/.test(s02(PAGES[name])),
        "a closed card says Closed in STATUS, not again as a chip");
      void client;
    });
  }
});

describe("fix 6: the closing line of 06 only claims a move that moves money", () => {
  test("Jordan: three real moves, a real gain", () => {
    assert.ok(s06(PAGES.jordan).includes(
      "Those 3 moves are what take your pre-approval from $7,936 toward $19,841."));
  });
  test("academy: two real moves (one per card), a real gain", () => {
    assert.ok(s06(PAGES.academy).includes(
      "Those 2 moves are what take your pre-approval from $199,350 toward $221,500."));
  });
  for (const name of ["repair", "noLimit", "zeroLimit", "empty"]) {
    test(`${name}: no "toward" line`, () => {
      assert.ok(!/move[s]? (is|are) what take/.test(s06(PAGES[name])));
    });
  }
  test("repair would read \"$0 toward $0\": no gain, no line", () => {
    assert.ok(!PAGES.repair.includes("toward $0"));
  });
  test("noLimit and zeroLimit: the listed item is not a move, so it is not credited", () => {
    for (const name of ["noLimit", "zeroLimit"]) {
      const s = s06(PAGES[name]);
      assert.ok(s.includes("so there is no 10% target to pay down to"), "the win is still listed");
      assert.ok(!s.includes("toward $60,000"));
    }
  });
});

describe("fix 7: see \"the waterfall in 01\" above (no-limit and zero-limit suppressed)", () => {
  test("no page names UTILIZATION FIX without a card to pay down in 03", () => {
    for (const [name, html] of Object.entries(PAGES)) {
      if (!html.includes("UTILIZATION FIX")) continue;
      assert.ok(/ - \d+% Utilization<\/div>|Overall Utilization - /.test(s03(html)),
        `${name}: a utilization gain with no utilization item in 03`);
    }
  });
});

describe("fix 8: one row per account, not one per bureau", () => {
  test("academy: three cards, not nine", () => {
    assert.equal(rowsUnder(PAGES.academy, "Personal Cards").length, 3);
    assert.ok(PAGES.academy.includes("Pay down your 3 open revolving cards."));
    assert.ok(!PAGES.academy.includes("Pay down your 9 open revolving cards."));
    assert.equal(rowsUnder(PAGES.academy, "Installment Loans").length, 1, "one Toyota loan");
  });

  for (const name of ["academy", "repair"]) {
    test(`${name}: no fastest win and no 03 utilization item is listed twice`, () => {
      const wins = [...s06(PAGES[name]).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
      assert.equal(new Set(wins).size, wins.length, wins.join(" / "));
      const titles = [...s03(PAGES[name]).matchAll(/<div class="ctitle">([^<]*)<\/div>/g)]
        .map((m) => m[1]).filter((t) => / Utilization$/.test(t));
      assert.equal(new Set(titles).size, titles.length, titles.join(" / "));
    });
  }

  test("repair: three cards in the table and three utilization items in 03", () => {
    assert.equal(rowsUnder(PAGES.repair, "Personal Cards").length, 3);
    const titles = [...s03(PAGES.repair).matchAll(/<div class="ctitle">([^<]*) - \d+% Utilization<\/div>/g)]
      .map((m) => m[1]);
    assert.deepEqual(titles, ["Synchrony Bank / Care Credit", "Credit One Bank", "Capital One Platinum"]);
  });

  test("rows that differ in anything the page shows are all kept", () => {
    for (const [name, client] of Object.entries(CLIENTS)) {
      for (const [key, h3, drop] of [["revolving", "Personal Cards", 1],
        ["installments", "Installment Loans", -1], ["mortgages", "Mortgage / Real Estate", -1],
        ["public_obligations", "Child Support / Public Obligations", -1]]) {
        const distinct = new Set((client[key] || [])
          .map((r) => JSON.stringify(r.filter((_, i) => i !== drop)))).size;
        assert.equal(rowsUnder(PAGES[name], h3).length, distinct, `${name} ${h3}`);
        for (const r of client[key] || []) {
          assert.ok(rowsUnder(PAGES[name], h3).some((tr) => tr[0] === String(r[0])),
            `${name}: ${r[0]} is missing from ${h3}`);
        }
      }
    }
  });

  test("the negatives in 03 stay one per bureau: each names its bureau", () => {
    const n = (CLIENTS.repair.negatives || []).length;
    const items = [...s03(PAGES.repair).matchAll(/<div class="ctitle">[^<]* - (Experian|Equifax|TransUnion)<\/div>/g)];
    assert.equal(items.length, n);
  });
});

describe("fix 9: no engine code word reaches the client", () => {
  const CODES = /\b(Late\d+Days|CollectionOrChargeOff|ChargeOff|AsAgreed|BankruptcyOrWageEarnerPlan|TooNew|NoDataAvailable)\b/;
  for (const [name, html] of Object.entries(PAGES)) {
    test(`${name}: none on the page`, () => {
      assert.ok(!CODES.test(textOf(html)), (textOf(html).match(CODES) || [])[0]);
    });
  }
  test("repair: the plain words, the rest of each title unchanged", () => {
    const s = s03(PAGES.repair);
    for (const t of ["Capital One Platinum - 30 days late - $2,870 - Experian",
      "Midland Credit Management - Collection or charge-off - $1,840 - Experian",
      "Synchrony Bank / Care Credit - Charge-off - $2,500 - Experian"]) {
      assert.ok(s.includes(`<div class="ctitle">${t}</div>`), t);
    }
  });
  test("academy: the installment note reads \"Paying on time\"", () => {
    assert.deepEqual(rowsUnder(PAGES.academy, "Installment Loans").map(flatRow),
      ["Toyota Motor Credit | open | $14,200 | Paying on time"]);
  });
  test("a type that is already words is printed as the file wrote it", () => {
    assert.ok(s03(PAGES.jordan).includes(
      '<div class="ctitle">SIGNET BANK/VIRGINIA - Charge-Off - $4,798 - Experian</div>'));
    assert.ok(s03(PAGES.jordan).includes("60-Day Lates (28x)"));
  });
});

describe("fix 10 (the part in this file): the utilization cell carries one chip", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    test(`${name}: at most one chip per Personal Cards cell`, () => {
      const at = html.indexOf("<h3>Personal Cards</h3>");
      const block = html.slice(at, html.indexOf("<h3>Installment Loans</h3>"));
      for (const td of block.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []) {
        assert.ok((td.match(/class="chip /g) || []).length <= 1, td);
      }
    });
  }
});
