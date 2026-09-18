// The Financial Profile Assessment (credit analysis) in the gold look
// (W3, 2026-09-17).
//
// What a buyer holding the gold pack looks for: the cover, the opening, the
// journey map, eight numbered sections in the gold order, the six gold charts
// where the file can honestly carry them, and the honest closing panel. Every
// sentence the builder printed before the gold look still prints. Nothing is
// invented for a file that does not have it: a chart the file cannot support
// is left out, and a missing figure prints "-".

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderDeliverableHtml } from "./index.mjs";
import { buildCreditAnalysis } from "./credit-analysis.mjs";
import { BOOK_CALL_URL, GOLD } from "./chrome.mjs";
import { emptyBlackReportClient } from "../underwrite/black-report-client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => JSON.parse(readFileSync(join(HERE, "fixtures", n), "utf8"));

const CLIENTS = {
  jordan: fixture("jordan-sample-client.json"),
  repair: fixture("repair-client.json"),
  academy: fixture("academy-client.json"),
  "no-limit": fixture("no-limit-client.json"),
  "zero-limit": fixture("zero-limit-client.json"),
  empty: emptyBlackReportClient()
};

// fontsHref keeps the base64 font payload out of the page; "NaN" can occur inside it.
const page = (client) =>
  renderDeliverableHtml({ client, doc: "credit_analysis", fontsHref: "/assets/fonts" }).html;
const gold = (client) => buildCreditAnalysis(client, { look: GOLD });
const noStyle = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "");
const flat = (html) => noStyle(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const SECTIONS = [
  ["01", "BUREAUS", "Bureau Health Summary"],
  ["02", "SCORES", "Score Breakdown by Bureau"],
  ["03", "UTILIZATION", "Primary Revolving Cards - Utilization Analysis"],
  ["04", "AU ACCOUNTS", "Authorized User (AU) Accounts"],
  ["05", "NEGATIVES", "Negative Items - One by One"],
  ["06", "INQUIRIES", "Inquiries - Cleanup Only. Zero Impact on Funding."],
  ["07", "PERSONAL DATA", "Personal Data Cleanup"],
  ["08", "BOTTOM LINE", "The Bottom Line - Where You Are vs. Where You Are Going"]
];

/* Each gold chart, found by the aria-label gold-charts.mjs gives it. */
const CHART = {
  journeyMap: /aria-label="Your plan (runs on two tracks at the same time|starts with repair)\."/,
  scoreLineup: /aria-label="You do not have one credit score\. You have three\."/,
  utilizationTank: /aria-label="Your [^"]* card holds [^"]*full\."/,
  utilizationBars: /aria-label="Utilization by card: /,
  severityScale: /aria-label="Your \d+ negative items are not equally bad\."/,
  moneyChain: /aria-label="How [^"]* more funding\."/
};

/* Where each chart is drawn (1) and where DIAGRAM_SPEC section 6, or the page's
   own words, leave it out (0), and why.
     journey: negatives to dispute, and then two tracks (money today and a
              clean bureau) or one track (the file says no money today:
              REPAIR_ONLY or $0). The page's words follow the map it draws.
     lineup:  exactly three scores.
     tank:    a card this report marks CRITICAL with a known limit.
     bars:    a card with a known limit ("no revolving card with a known limit").
     severity: three to RAIL_MAX (10) negatives the report itself ranks (each
              says why it matters). The repair file's mapper order is not a
              ranking.
     chain:   projected above current, both known, and a card with a paydown
              to its 10% target. */
const EXPECT = {
  jordan: { journeyMap: 1, scoreLineup: 1, utilizationTank: 1, utilizationBars: 1, severityScale: 1, moneyChain: 1 },
  repair: { journeyMap: 1, scoreLineup: 1, utilizationTank: 1, utilizationBars: 1, severityScale: 0, moneyChain: 0 },
  academy: { journeyMap: 0, scoreLineup: 1, utilizationTank: 0, utilizationBars: 1, severityScale: 0, moneyChain: 1 },
  "no-limit": { journeyMap: 0, scoreLineup: 1, utilizationTank: 0, utilizationBars: 0, severityScale: 0, moneyChain: 0 },
  "zero-limit": { journeyMap: 0, scoreLineup: 1, utilizationTank: 0, utilizationBars: 0, severityScale: 0, moneyChain: 0 },
  empty: { journeyMap: 0, scoreLineup: 0, utilizationTank: 0, utilizationBars: 0, severityScale: 0, moneyChain: 0 }
};

describe("gold credit analysis: every gold section, in the gold order", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: cover, opening, 01 to 08, closing panel`, () => {
      const html = page(client);
      let at = html.indexOf('<div class="cover">');
      assert.ok(at >= 0, "the cover");
      const lead = html.indexOf('<p class="lead">');
      assert.ok(lead > at, "the opening paragraph, as the gold lead");
      at = lead;
      for (const [num, label, heading] of SECTIONS) {
        const eyebrow = `<div class="eyebrow">${num} / ${label}</div><h2>${heading}</h2>`;
        const next = html.indexOf(eyebrow);
        assert.ok(next > at, `${num} ${heading} missing or out of order`);
        at = next;
      }
      assert.ok(html.indexOf('<div class="cta-page">') > at, "the closing panel comes last");
    });
  }
});

describe("gold credit analysis: the six charts, placed and suppressed", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: each chart drawn exactly where the file supports it`, () => {
      const html = page(client);
      for (const [chart, want] of Object.entries(EXPECT[name])) {
        const n = (html.match(new RegExp(CHART[chart].source, "g")) || []).length;
        assert.equal(n, want, `${chart} drawn ${n} times, expected ${want}`);
      }
      assert.ok((html.match(/<div class="chart">/g) || []).length <= 6,
        "DIAGRAM_SPEC 5: six visuals at most in the report");
    });

    test(`${name}: none of the old look's drawings survive`, () => {
      const html = gold(client);
      for (const old of ['<svg class="diagram"', 'class="scorebox', 'class="flowrow"',
        'class="bar-row"', 'class="midlabel"', 'class="callout bar"', "<h3>ITEM"]) {
        assert.ok(!html.includes(old), `still draws ${old}`);
      }
    });
  }

  const at = (html, re) => html.search(re);
  test("jordan: each chart sits in its gold section", () => {
    const html = page(CLIENTS.jordan);
    const sec = (num) => (num === "end"
      ? html.indexOf('<div class="cta-page">')
      : html.indexOf(`<div class="eyebrow">${num} /`));
    const inSection = (re, num, nextNum) => {
      const x = at(html, re);
      assert.ok(x > sec(num) && x < sec(nextNum), `${re} is not in section ${num}`);
    };
    assert.ok(at(html, CHART.journeyMap) > html.indexOf('<p class="lead">')
      && at(html, CHART.journeyMap) < sec("01"), "journey map: after the opening, before 01");
    inSection(CHART.scoreLineup, "02", "03");
    assert.ok(at(html, CHART.scoreLineup) < html.indexOf('<div class="mrow">', sec("02")),
      "the line-up sits above the four score cards");
    inSection(CHART.utilizationTank, "03", "04");
    inSection(CHART.utilizationBars, "03", "04");
    assert.ok(at(html, CHART.utilizationTank) > html.indexOf("</table>", sec("03")),
      "the tank comes after the utilization table");
    inSection(CHART.severityScale, "05", "06");
    assert.ok(at(html, CHART.severityScale) > html.indexOf("</table>", sec("05")),
      "the severity rail comes after the negatives table");
    inSection(CHART.moneyChain, "08", "end");
    assert.ok(at(html, CHART.moneyChain) > html.indexOf('<div class="mrow">', sec("08")),
      "the money chain comes after the three pre-approval cards");
  });
});

describe("gold credit analysis: the charts carry this file's own numbers", () => {
  const html = gold(CLIENTS.jordan);

  test("the tank pays down balance minus target, from the table's own row", () => {
    const tank = html.match(/<svg[^>]*aria-label="Your SYNCB\/LEVITZ card holds \$1,894[\s\S]*?<\/svg>/);
    assert.ok(tank, "the tank is on the worst card with a known limit");
    assert.ok(tank[0].includes("PAY DOWN $1,573"), "1,762 - 189");
    assert.ok(tank[0].includes(">$189<"), "the target the table prints");
  });

  test("the bars leave out the card with no reported limit and keep the overall row", () => {
    const label = html.match(/aria-label="(Utilization by card: [^"]*)"/)[1];
    assert.equal(label,
      "Utilization by card: SYNCB/LEVITZ 93%, CITIBANK SD NA 69%, Overall revolving 97%. Target 10%");
    assert.ok(!label.includes("BENEFICIAL"), "BENEFICIAL has no limit; a bar would be a guess");
  });

  test("the severity rail numbers match the table and fix item 1 first", () => {
    const rail = html.match(/<svg[^>]*aria-label="Your 7 negative items[\s\S]*?<\/svg>/)[0];
    for (let n = 1; n <= 7; n++) assert.ok(rail.includes(`>${n}</text>`), `dot ${n}`);
    assert.ok(rail.includes("Start on the right. SIGNET BANK/VIRGINIA hurts the most. Fix it first."));
    // Least damaging on the left: item 7 is drawn left of item 1.
    const cx = (n) => Number(rail.match(new RegExp(`<circle cx="([\\d.]+)"[^>]*/><text[^>]*>${n}</text>`))[1]);
    assert.ok(cx(7) < cx(1));
  });

  test("the score line-up never reads backwards (DIAGRAM_SPEC 4.1)", () => {
    const lineup = html.match(/<svg[^>]*aria-label="You do not have one credit score[\s\S]*?<\/svg>/)[0];
    // Experian 630 carries 1 item, Equifax 636 carries 7: counts would read backwards.
    assert.ok(!/\d negative items?</.test(lineup), "no counts under the scores on this file");
    assert.equal((lineup.match(/>Negative items on it</g) || []).length, 2);
    assert.equal((lineup.match(/>Nothing negative on it</g) || []).length, 1);
    // Equal counts cannot read backwards, so the repair file keeps them.
    const repair = gold(CLIENTS.repair)
      .match(/<svg[^>]*aria-label="You do not have one credit score[\s\S]*?<\/svg>/)[0];
    assert.equal((repair.match(/>3 negative items</g) || []).length, 3);
  });

  test("the money chain is this file's paydown and pre-approvals", () => {
    const chain = html.match(/<svg[^>]*aria-label="How \$1,940 becomes \$11,905 more funding\."[\s\S]*?<\/svg>/);
    assert.ok(chain, "headline from the page's own sentence");
    assert.ok(chain[0].includes("$1,573 + $367"));
    assert.ok(chain[0].includes("$7,936 becomes"), "and it ends on $7,936 becoming $19,841");
    assert.ok(chain[0].includes("$19,841"));
  });

  test("the money chain is left out when projected is not above current", () => {
    const flatFile = { ...CLIENTS.jordan, preapproval_now: 19841, preapproval_after: 7936 };
    assert.ok(!CHART.moneyChain.test(gold(flatFile)));
    assert.ok(gold(flatFile).includes("You are not paying to make the debt disappear."),
      "the teaching line still prints as page copy");
  });
});

describe("gold credit analysis: every sentence the builder printed still prints", () => {
  /* The default look is the builder's words (port-parity pins it). Strip what
     the gold look replaces with a drawing (cover, closing panel, the old SVGs,
     the score boxes, the flow row, the old bars), then every sentence left must
     be on the gold page, in a paragraph or drawn inside a chart. */
  const prose = (html) => html
    .replace(/<div class="cover">[\s\S]*?FUNDHUB CONFIDENTIAL<\/span>\s*<\/div>\s*<\/div>/, " ")
    .replace(/<div class="cta-page">[\s\S]*$/, " ")
    .replace(/<svg class="diagram"[\s\S]*?<\/svg>/g, " ")
    .replace(/<div class="midlabel">[\s\S]*?(?=<p><b>Line them up)/, " ")
    .replace(/<div class="flowrow">[\s\S]*?\n<\/div>\n/, " ")
    .replace(/<div class="bar-row">[\s\S]*?<div class="small">[^<]*<\/div>\s*<\/div>/g, " ");
  const BLOCK = "\u0001"; // the end of a paragraph, cell, heading or panel
  const sentences = (html) => html
    .replace(/<\/(p|div|td|th|h\d|li)>/g, BLOCK)
    .replace(/<[^>]*>/g, " ")
    .split(BLOCK)
    .flatMap((block) => block.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/))
    .filter((x) => x.split(" ").length >= 3);

  /* Every old sentence the gold page leaves out (null) or prints differently
     (the new text), per file. Each one is a sentence that is false, or a
     caption for nothing, on that file. Anything not listed must print. */
  const TWO_TRACK = [
    "Your plan runs on two tracks at the same time.",
    "You do not wait for repair to finish before you get money.",
    "Both tracks run at the same time."
  ];
  const drop = (...xs) => xs.map((x) => [x, null]);
  // No negatives, money today: no repair track, so no two-track claim.
  const noRepairTrack = (outcome) => [
    ...drop(...TWO_TRACK, "Each dispute round makes the next application round stronger."),
    [`YOUR OUTCOME: ${outcome} · BOTH TRACKS ARE ALREADY IN THIS PLAN`, `YOUR OUTCOME: ${outcome}`]
  ];
  // Empty lists: no header-only tables, and a count summed from nothing is "-".
  const emptyLists = [
    ...drop("WHY IT MATTERS", "PRIORITY FOR REMOVAL"),
    ["You have 0 total hard inquiries across the bureaus.", "You have - total hard inquiries across the bureaus."]
  ];
  // A card with no 10% target: no money chain, so no chain headline or note.
  const noTargetChain = drop("How a targeted paydown becomes $10,000 more funding.",
    "EVERY FIGURE COMES FROM SECTIONS 03 AND 08 OF THIS REPORT", "DASHED LINE MARKS THE 10% UTILIZATION THRESHOLD LENDERS LOOK FOR");
  // A 700 Experian does not move "from 700 toward 700+".
  const at700 = drop("After full repair - your Experian score moves from 700 toward 700+.",
    "At that level you unlock premium cards, SBA 7(a) loans, and personal loans up to $40,000+.");
  const CHANGES = {
    jordan: [
      // The rail draws "Start on the right. SIGNET BANK/VIRGINIA hurts the most. Fix it first."
      ...drop("Start with SIGNET BANK/VIRGINIA on Experian."),
      ["URGENT - 2 different names on file across bureaus Clean this up before you apply.",
        "URGENT - 2 different names on file across bureaus. Clean this up before you apply."],
      // $0 DISCOVERCARD lines and the paid SYNCB (old) are not cards to pay down.
      ["Pay down your 5 open revolving cards.", "Pay down your 2 open revolving cards."]
    ],
    repair: [
      // REPAIR_ONLY at $0: no money today, one track (the map draws it).
      ...drop("You qualify for funding today based on the numbers in this pack.", ...TWO_TRACK),
      ["YOUR OUTCOME: repair_only · BOTH TRACKS ARE ALREADY IN THIS PLAN", "YOUR OUTCOME: repair_only"],
      // Mapper order is not a ranking: no rail, so no note about its dots.
      ...drop("DOT NUMBERS MATCH THE TABLE ABOVE · ORDER FOLLOWS THIS REPORT"),
      // Three cards, each on several bureaus; and $0 becomes $0 moves nothing.
      ["Pay down your 8 open revolving cards.", "Pay down your 3 open revolving cards."],
      ...drop("That alone moves your pre-approval.", "How $4,500 becomes $0 more funding.",
        "EVERY FIGURE COMES FROM SECTIONS 03 AND 08 OF THIS REPORT"),
      // A stage cell answers its heading or reads "-".
      ...drop("Cleans the file")
    ],
    academy: [
      ...noRepairTrack("full_funding"),
      ...emptyLists,
      // Three cards on three bureaus each.
      ["Pay down your 9 open revolving cards.", "Pay down your 3 open revolving cards."],
      ["How $4,600 becomes $22,150 more funding.", "How $3,200 becomes $22,150 more funding."],
      // 762 does not move "toward 700+"; $199,350 today is past "up to $40,000+".
      ...drop("After full repair - utilization under 10% - your Experian score moves from 762 toward 700+.",
        "At that level you unlock premium cards, SBA 7(a) loans, and personal loans up to $40,000+.")
    ],
    "no-limit": [...noRepairTrack("full_funding"), ...emptyLists, ...noTargetChain, ...at700],
    "zero-limit": [...noRepairTrack("full_funding"), ...emptyLists, ...noTargetChain, ...at700],
    /* The empty file: honest empty. A blank or a 0 standing for "unknown" is a
       "-", a bureau the file does not list is not called clean, and nothing
       is claimed about money, tracks or cards the file does not show. */
    empty: [
      ...drop("You qualify for funding today based on the numbers in this pack.", ...TWO_TRACK,
        "Each dispute round makes the next application round stronger."),
      ["YOUR OUTCOME: · BOTH TRACKS ARE ALREADY IN THIS PLAN", "YOUR OUTCOME: -"],
      ...drop("On this file it is clean.", "Your cleanest bureau on this file."),
      ["Yours is .", "Yours is -."],
      ["Your best and worst are points apart.", "Your best and worst are - points apart."],
      ...emptyLists,
      ...drop("How a targeted paydown becomes $0 more funding.",
        "EVERY FIGURE COMES FROM SECTIONS 03 AND 08 OF THIS REPORT",
        "DASHED LINE MARKS THE 10% UTILIZATION THRESHOLD LENDERS LOOK FOR",
        "That alone moves your pre-approval.",
        "After full repair - your Experian score moves from toward 700+.",
        "At that level you unlock premium cards, SBA 7(a) loans, and personal loans up to $40,000+.")
    ]
  };

  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: no sentence lost`, () => {
      const goldText = flat(gold(client));
      const changes = new Map(CHANGES[name]);
      const met = new Set();
      const missing = [];
      for (const sentence of sentences(prose(buildCreditAnalysis(client)))) {
        if (sentence.startsWith("Book your strategy call at")) continue; // the link, below
        if (changes.has(sentence)) {
          const now = changes.get(sentence);
          assert.ok(!goldText.includes(sentence), `still prints: ${sentence}`);
          if (now !== null) assert.ok(goldText.includes(now), `expected ${now}`);
          met.add(sentence);
          continue;
        }
        if (!goldText.includes(sentence)) missing.push(sentence);
      }
      assert.deepEqual(missing, []);
      // Every listed change was met, so the list cannot go stale.
      assert.deepEqual([...changes.keys()].filter((k) => !met.has(k)), []);
    });
  }
});

describe("gold credit analysis: the booking link and the page gates", () => {
  const link = `<a href="${BOOK_CALL_URL}">apply.fundhub.ai/schedule/phonecall</a>`;

  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: the body books the call on the real page, never the dead template`, () => {
      const html = page(client);
      assert.ok(gold(client).includes(`Ready to move? Book your strategy call at ${link}.`));
      assert.ok(html.includes(`href="${BOOK_CALL_URL}"`));
      assert.ok(!html.includes("fundhubbookingurl"), "the dead www.fundhubbookingurl.template");
      if (client.booking_url) assert.ok(!gold(client).includes(client.booking_url));
    });

    test(`${name}: no em or en dash, no NaN, no undefined, no banned phrase`, () => {
      const html = page(client);
      const shown = noStyle(html);
      assert.ok(!/[–—]/.test(shown), "em or en dash on the page");
      assert.ok(!/[–—]/.test(gold(client)), "em or en dash in the builder's output");
      assert.ok(!/\bNaN\b/.test(html), "NaN");
      assert.ok(!/\bundefined\b/.test(html), "undefined");
      assert.ok(!/credit[\s\-]*repair/i.test(flat(html)), "the banned phrase");
    });
  }

  test("academy: no Jordan sample data leaks onto another client's page", () => {
    const html = page(CLIENTS.academy);
    for (const leak of ["Jordan", "SYNCB", "SIGNET BANK", "San Antonio", "Knoll Krest"]) {
      assert.ok(!html.includes(leak), `academy page carries ${leak}`);
    }
  });

  test("no Fundhub Academy plug and no gold-sample prose on any page", () => {
    for (const client of Object.values(CLIENTS)) {
      const text = flat(page(client));
      assert.ok(!/Fundhub Academy/i.test(text));
      assert.ok(!text.includes("Nobody has ever broken your credit down like this"));
      assert.ok(!text.includes("$50,000+"));
    }
  });
});

describe("gold credit analysis: honest empty", () => {
  const html = gold(CLIENTS.empty);

  test("a missing score or dollar prints -, never 0 or a blank", () => {
    assert.ok(!html.includes("+$0"), "two unknown pre-approvals are not a $0 delta");
    assert.equal((html.match(/<div class="mval">-<\/div>/g) || []).length, 7,
      "three bureau scores, the median, and the three pre-approval cards");
    assert.ok(!html.includes('<div class="mval"></div>'));
  });

  test("a bureau the file does not list is never called clean", () => {
    assert.ok(!html.includes("Your cleanest bureau on this file."));
    assert.ok(!html.includes("On this file it is clean."));
    assert.ok(!/>STRONG</.test(html));
  });

  test("the journey map is not drawn for a file with nothing to map", () => {
    assert.ok(!CHART.journeyMap.test(html));
    // Nothing on the file says there is money today or anything to dispute.
    assert.ok(!/two tracks|both tracks|qualify for funding today/i.test(flat(html)));
  });

  test("a repair-only file gets the one-track map and no two-track words", () => {
    const repair = gold(CLIENTS.repair);
    assert.ok(repair.includes('aria-label="Your plan starts with repair."'));
    assert.ok(!repair.includes("TRACK 1"));
    assert.ok(!/two tracks|both tracks|qualify for funding today/i.test(flat(repair)));
  });

  test("the default look is untouched by the gold switch", () => {
    for (const client of Object.values(CLIENTS)) {
      assert.equal(buildCreditAnalysis(client), buildCreditAnalysis(client, {}));
      assert.equal(buildCreditAnalysis(client), buildCreditAnalysis(client, { look: "old" }));
      assert.ok(!buildCreditAnalysis(client).includes('<div class="chart">'));
    }
  });
});

/* Fix pass (2026-09-17): one test per gap the independent checker found. */
describe("gold credit analysis: fix pass", () => {
  const J = CLIENTS.jordan;
  const svgOf = (html, re) => {
    const at = html.search(re);
    return at < 0 ? null : html.slice(html.lastIndexOf("<svg", at), html.indexOf("</svg>", at) + 6);
  };
  const chartEnd = (html, re) => html.indexOf("</svg></div>", html.search(re)) + "</svg></div>".length;
  const stageRows = (html) => {
    const t = html.match(/<table class="fh"><thead><tr><th[^>]*>STAGE<\/th>[\s\S]*?<\/table>/)[0];
    return [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1)
      .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]));
  };
  const many = (k) => ({ ...J, negatives: Array.from({ length: k }, (_, i) => ({ ...J.negatives[i % 7], n: i + 1 })) });

  test("bars: a card three bureaus report is one bar, not two identical bars", () => {
    const label = (client) => gold(client).match(/aria-label="(Utilization by card: [^"]*)"/)[1];
    assert.equal(label(CLIENTS.academy),
      "Utilization by card: American Express Blue 19%, Chase Sapphire Preferred 18%, Overall revolving 17%. Target 10%");
    assert.equal(label(CLIENTS.repair),
      "Utilization by card: Synchrony Bank / Care Credit 100%, Credit One Bank 99%, Overall revolving 98%. Target 10%");
    // One card on three bureaus: one bar, and no Overall row (it would be that card again).
    const amex = CLIENTS.academy.revolving.filter((r) => r[0].startsWith("American Express"));
    assert.equal(label({ ...CLIENTS.academy, revolving: amex }), "Utilization by card: American Express Blue 19%. Target 10%");
  });

  test("money chain and Step 1 rows count each card once", () => {
    const academy = gold(CLIENTS.academy);
    const chain = svgOf(academy, /aria-label="How \$3,200 becomes \$22,150 more funding\."/);
    assert.ok(chain, "$2,300 + $900, not $2,300 + $2,300");
    assert.ok(chain.includes("$2,300 + $900"));
    const step1 = (html) => stageRows(html).filter((r) => r[0] === "Step 1 - Fast Win").map((r) => r[1]);
    assert.deepEqual(step1(academy), ["Pay American Express Blue Business Cash from $4,800 down to $2,500",
      "Pay Chase Sapphire Preferred from $2,100 down to $1,200"]);
    assert.deepEqual(step1(gold(CLIENTS.repair)), ["Pay Synchrony Bank / Care Credit from $2,500 down to $250",
      "Pay Credit One Bank from $1,490 down to $150"]);
  });

  test("after-repair panel: no score or loan claim the file contradicts", () => {
    const panel = (client) => flat(gold(client).match(/<div class="co up">[\s\S]*?<\/div>/)[0]);
    const LAST = "The gap between where you are and where you could be is not years of waiting. "
      + "It is targeted action on a short list.";
    for (const name of ["academy", "no-limit", "zero-limit", "empty"]) {
      assert.equal(panel(CLIENTS[name]), LAST, name);
    }
    assert.ok(panel(J).includes("moves from 630 toward 700+. At that level you unlock premium cards, "
      + "SBA 7(a) loans, and personal loans up to $40,000+."));
    assert.ok(panel(CLIENTS.repair).includes("your Experian score moves from 588 toward 700+."));
    // Already pre-approved past $40,000: the score line stays, the loan line goes.
    const past = panel({ ...J, preapproval_after: 45000 });
    assert.ok(past.includes("toward 700+.") && !past.includes("$40,000+"));
  });

  test("money chain: not drawn when no card has a paydown to its 10% target", () => {
    for (const name of ["no-limit", "zero-limit"]) {
      const html = gold(CLIENTS[name]);
      assert.ok(!CHART.moneyChain.test(html), name);
      assert.ok(!html.includes("see table") && !html.includes("Cards drop under 10%"), name);
    }
    // Both of Jordan's measured cards already under target: nothing to pay, no chain.
    const under = { ...J, revolving: J.revolving.map((r) => (["SYNCB/LEVITZ", "CITIBANK SD NA"].includes(r[0])
      ? [r[0], r[1], 50, r[3], "8%", r[5], "MONITOR"] : r)) };
    assert.ok(!CHART.moneyChain.test(gold(under)));
  });

  test("tank: its source note sits right under it; the takeaway opens the utilization paragraph", () => {
    const html = gold(J);
    assert.ok(html.startsWith('<div class="note">YOUR NUMBERS FROM THE TABLE ABOVE',
      chartEnd(html, CHART.utilizationTank)));
    const takeaway = html.indexOf("<p><b>A high balance on a revolving card is what lenders read first.</b> "
      + "Right now you are using 97%");
    assert.ok(takeaway > html.indexOf("DASHED LINE MARKS"), "after the bars and their note");
    assert.equal(html.split("A high balance on a revolving card is what lenders read first.").length, 2, "said once");
  });

  test("severity rail: its own takeaway only, then its source note", () => {
    const html = gold(J);
    assert.ok(!html.includes("Start with SIGNET BANK/VIRGINIA on Experian."));
    assert.ok(html.startsWith('<div class="note">DOT NUMBERS MATCH THE TABLE ABOVE',
      chartEnd(html, CHART.severityScale)));
    // No rail: the page copy points at item 1 and says nothing about dots.
    const two = gold({ ...J, negatives: J.negatives.slice(0, 2) });
    assert.ok(two.includes("Start with SIGNET BANK/VIRGINIA on Experian."));
    assert.ok(!two.includes("DOT NUMBERS"));
  });

  test("a chart's caption and headline print only with the chart", () => {
    const probes = {
      ...CLIENTS,
      "two negatives": { ...J, negatives: J.negatives.slice(0, 2) },
      "projected below current": { ...J, preapproval_now: 19841, preapproval_after: 7936 }
    };
    for (const [name, client] of Object.entries(probes)) {
      const html = gold(client);
      const text = flat(html);
      const count = (s) => html.split(s).length - 1;
      const drawn = (re) => (html.match(new RegExp(re.source, "g")) || []).length;
      assert.equal(count("DASHED LINE MARKS THE 10% UTILIZATION THRESHOLD"), drawn(CHART.utilizationBars), name);
      assert.equal(count("DOT NUMBERS MATCH THE TABLE ABOVE"), drawn(CHART.severityScale), name);
      assert.equal(count("EVERY FIGURE COMES FROM SECTIONS 03 AND 08"), drawn(CHART.moneyChain), name);
      assert.equal((text.match(/How [^.]* more funding\./g) || []).length, drawn(CHART.moneyChain), name);
    }
  });

  test("no table prints as headings over nothing", () => {
    for (const [name, client] of Object.entries(CLIENTS)) {
      assert.ok(!gold(client).includes("<tbody></tbody>"), name);
    }
    const none = (client) => (gold(client).match(/<p>None on file\.<\/p>/g) || []).length;
    assert.equal(none(CLIENTS.academy), 2, "inquiries and personal data");
    assert.equal(none(CLIENTS.empty), 4, "bureaus, cards, inquiries and personal data");
    assert.equal(none(J), 0);
    // The negatives table is left out; its own line already says there are none.
    assert.ok(gold(CLIENTS.academy).includes("No derogatory items are listed on this file."));
  });

  test("an inquiry total summed from nothing is -, not 0", () => {
    for (const name of ["academy", "no-limit", "zero-limit", "empty"]) {
      assert.ok(flat(gold(CLIENTS[name])).includes("You have - total hard inquiries across the bureaus."), name);
    }
    assert.ok(flat(gold(J)).includes("You have 46 total hard inquiries"));
    // A bureau listed with 0 is a real 0.
    const zero = { ...J, inquiries: [["TransUnion", 0, "CLEAN", "No inquiries to address."]] };
    assert.ok(flat(gold(zero)).includes("You have 0 total hard inquiries"));
  });

  test("severity rail: drawn only from the report's own ranking, never with status codes", () => {
    const repair = gold(CLIENTS.repair);
    assert.ok(!CHART.severityScale.test(repair));
    assert.ok(!repair.includes("hurts the most"), "a 30-day late is not called the worst item");
    const charts = (repair.match(/<svg[\s\S]*?<\/svg>/g) || []).join("");
    assert.ok(!/>(Late30Days|CollectionOrChargeOff|ChargeOff)</.test(charts), "no status code drawn as a note");
    // One item with no stated reason: the order is not a ranking.
    const unranked = J.negatives.map((n, i) => (i === 3 ? { ...n, why: "" } : n));
    assert.ok(!CHART.severityScale.test(gold({ ...J, negatives: unranked })));
  });

  test("severity rail: left out past ten items, where labels collide", () => {
    assert.ok(CHART.severityScale.test(gold(many(10))));
    for (const k of [11, 16]) {
      const html = gold(many(k));
      assert.ok(!CHART.severityScale.test(html), `${k} items`);
      assert.ok(html.includes(`Your ${k} negative items are not equally bad.`), "the page copy says the count");
    }
  });

  test("the opening claims money today and two tracks only where the file shows them", () => {
    const text = (client) => flat(gold(client));
    assert.ok(text(J).includes("You qualify for funding today based on the numbers in this pack."));
    assert.ok(gold(J).includes('aria-label="Your plan runs on two tracks at the same time."'));
    assert.ok(text(J).includes("BOTH TRACKS ARE ALREADY IN THIS PLAN"));
    // Money today, nothing to dispute: the lead stays, no track claim, no map.
    for (const name of ["academy", "no-limit", "zero-limit"]) {
      assert.ok(text(CLIENTS[name]).includes("You qualify for funding today based on the numbers in this pack."), name);
      assert.ok(!/two tracks|both tracks|dispute round/i.test(text(CLIENTS[name])), name);
    }
    // Money today and items to dispute but no clean bureau: no map, the two lines print.
    const dirty = { ...J, bureaus: J.bureaus.map((b) => [b[0], "DIRTY", 1, b[3]]) };
    assert.ok(!CHART.journeyMap.test(gold(dirty)));
    assert.ok(text(dirty).includes("Your plan runs on two tracks at the same time. You do not wait for repair"));
  });

  test("stage table: Step 2 impact cells answer their headings or read -", () => {
    for (const name of ["jordan", "repair"]) {
      const rows = stageRows(gold(CLIENTS[name])).filter((r) => r[0] === "Step 2 - Repair");
      assert.equal(rows.length, 3, name);
      for (const r of rows) assert.deepEqual(r.slice(2), ["-", "-"], name);
    }
  });

  test("URGENT callout: the issue ends its own sentence", () => {
    assert.ok(flat(gold(J)).includes(
      "URGENT - 2 different names on file across bureaus. Clean this up before you apply."));
    const stated = flat(gold({ ...J, personal_data: [["Name Variations", "Two names on file.", "Fix it.", "HIGH"]] }));
    assert.ok(stated.includes("URGENT - Two names on file. Clean this up before you apply."));
    assert.ok(!stated.includes("file.. Clean"));
  });

  test("projected card: counts the cards to pay down, once each", () => {
    const body = (client) => flat(gold(client)
      .match(/PROJECTED PRE-APPROVAL<\/div>[\s\S]*?<div class="mnote">([\s\S]*?)<\/div>/)[1]);
    assert.equal(body(J), "Pay down your 2 open revolving cards. That alone moves your pre-approval.");
    assert.equal(body(CLIENTS.academy), "Pay down your 3 open revolving cards. That alone moves your pre-approval.");
    assert.equal(body(CLIENTS.repair), "Pay down your 3 open revolving cards.", "$0 becomes $0: nothing moves");
    assert.equal(body(CLIENTS.empty), "There are no open revolving cards on this file to pay down.");
  });
});
