// The 6-Month Business Readiness Roadmap in the gold look (W5, 2026-09-17).
//
// renderDeliverableHtml() always asks the builders for { look: "gold" }. These
// tests pin what the gold roadmap has to carry, for six files: the Jordan
// Sample (the look reference), a repair file, the Academy sample, a card with
// no reported limit, a card with a $0 limit, and a client with no credit data.
//
//   * all nine gold sections, and the gold sub-sections, in the gold order;
//   * the timeline in 01 and the dispute clock in 03, and the timeline left out
//     where DIAGRAM_SPEC section 6 says (no median, or no rise to draw);
//   * every sentence the old look prints is still on the gold page;
//   * the booking link, never the dead template address;
//   * no dash the spec bans, no NaN / undefined, no Jordan Sample leftovers.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeliverableHtml } from "./index.mjs";
import { buildRoadmap, oneRowPerAccount } from "./roadmap.mjs";
import { cover, ctaPage, BOOK_CALL_URL } from "./chrome.mjs";
import { emptyBlackReportClient } from "../underwrite/black-report-client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(join(HERE, "fixtures", n), "utf8"));

const CLIENTS = {
  jordan: fx("jordan-sample-client.json"),
  repair: fx("repair-client.json"),
  academy: fx("academy-client.json"),
  noLimit: fx("no-limit-client.json"),
  zeroLimit: fx("zero-limit-client.json"),
  empty: emptyBlackReportClient()
};

// fontsHref keeps the base64 font payload out of the page; "NaN" occurs in it.
const page = (client) =>
  renderDeliverableHtml({ client, doc: "roadmap", fontsHref: "/assets/fonts" }).html;
const PAGES = Object.fromEntries(Object.entries(CLIENTS).map(([k, c]) => [k, page(c)]));
/** What the reader sees: the body only. The stylesheet lives in <head>. */
const body = (html) => html.slice(html.indexOf("<body"));

const TIMELINE = 'aria-label="Score timeline:';
const CLOCK = 'aria-label="Why disputes take rounds, not days."';

/** The gold sections, in the gold pack's order. */
const SECTIONS = [
  ["01", "PROJECTION", "Your Projected Pre-Approval"],
  ["02", "MONTH 1", "Month 1 - Launch"],
  ["03", "MONTHS 2-3", "Months 2-3 - Results"],
  ["04", "MONTH 4", "Month 4 - Final Push"],
  ["05", "MONTH 5", "Month 5 - Business Milestone"],
  ["06", "MONTH 6", "Month 6 - The Reveal"],
  ["07", "TRANSFORMATION", "Before &amp; After Transformation Table"],
  ["08", "CHECKLIST", "Your 6-Month Checklist"],
  ["09", "CALL TO ACTION", "Your Call to Action"]
];

/** Headings every gold roadmap carries, in order, whatever the file holds. */
const ALWAYS = [
  '<div class="cover">',
  "A note before we dive in:",
  '<div class="eyebrow">01 / PROJECTION</div>',
  '<div class="bigstat">',
  "<h3>Where You Stand Right Now vs. Where You're Going</h3>",
  '<div class="eyebrow">02 / MONTH 1</div>',
  '<div class="mquote">&#8220;We fire on all cylinders. Everything starts now.&#8221;</div>',
  "<h3>Step 1: The Paydown Plan</h3>",
  "<h3>Step 2: Round 1 Dispute Letters - Experian First</h3>",
  "<h3>Step 3: Round 1 Dispute Letters - Equifax</h3>",
  "<h3>Step 4: Inquiry Removal Letters - Experian</h3>",
  "<h3>Step 5: Form Your LLC</h3>",
  "<h3>Step 6: Secure Your Personal Loan NOW</h3>",
  '<div class="eyebrow">03 / MONTHS 2-3</div>',
  '<div class="mquote">&#8220;The work starts paying off. Numbers move.&#8221;</div>',
  CLOCK,
  "<h3>What to Expect in Month 2</h3>",
  "<h3>Month 2 Action Items</h3>",
  "<h3>What to Expect in Month 3</h3>",
  '<div class="eyebrow">04 / MONTH 4</div>',
  '<div class="mquote">&#8220;We go after what\'s left. No item gets a free pass.&#8221;</div>',
  "<h3>Round 3 Dispute Letters</h3>",
  '<div class="eyebrow">05 / MONTH 5</div>',
  "<h3>Business Credit Profile Setup</h3>",
  "<h3>Why This Month Matters for Lenders</h3>",
  '<div class="eyebrow">06 / MONTH 6</div>',
  "<h3>Re-Pull All Three Bureaus</h3>",
  "<h3>Your New Pre-Approval Number</h3>",
  '<div class="eyebrow">07 / TRANSFORMATION</div>',
  '<div class="eyebrow">08 / CHECKLIST</div>',
  "<h4>Month 1</h4>", "<h4>Month 2</h4>", "<h4>Month 3</h4>",
  "<h4>Month 4</h4>", "<h4>Month 5</h4>", "<h4>Month 6</h4>",
  '<div class="eyebrow">09 / CALL TO ACTION</div>',
  '<div class="cta-page">'
];

function assertInOrder(html, needles, who) {
  let at = -1;
  for (const n of needles) {
    const i = html.indexOf(n, at + 1);
    assert.ok(i > at, `${who}: "${n}" is missing or out of order`);
    at = i;
  }
}

describe("gold roadmap: every gold section, in the gold order", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    test(`${name}: nine numbered sections, headed as the gold pack heads them`, () => {
      const eyebrows = html.match(/<div class="eyebrow">\d\d \/[^<]*<\/div>/g) || [];
      assert.equal(eyebrows.length, 9, name);
      assertInOrder(html, SECTIONS.map(([n, label, heading]) =>
        `<div class="eyebrow">${n} / ${label}</div><h2>${heading}</h2>`), name);
    });

    test(`${name}: the gold sub-sections are there, in order`, () => {
      assertInOrder(html, ALWAYS, name);
    });
  }

  test("jordan: the file-driven gold sub-sections appear where the gold has them", () => {
    assertInOrder(PAGES.jordan, [
      "<h3>Step 1: The Paydown Plan</h3>",
      '<div class="card4"><div class="c4t">SYNCB/LEVITZ</div>',
      '<div class="card4"><div class="c4t">CITIBANK SD NA</div>',
      '<div class="card4"><div class="c4t">BENEFICIAL</div>',
      "<h4>Every revolving account on this file</h4>",
      "Total paydown to reach 10% utilization: $2,008.",
      "<h4>Round 1 targets on Experian</h4>",
      "<h4>Personal information on file</h4>",
      "<h4>Inquiries on your Experian file</h4>",
      "<h4>Round 2 targets, if still on the file after Round 1</h4>",
      "Month 3 score projection:",
      "<h3>Settlement Negotiation - SIGNET BANK/VIRGINIA</h3>",
      "<h4>Your settlement script</h4>",
      "Your offer range: $1,919 to $2,879",
      "<h4>Rules for this negotiation</h4>",
      "<h3>Child Support Accounts - Strategic Note</h3>"
    ], "jordan");
  });

  test("a file with no charge-off and no child support has no settlement or child note", () => {
    for (const name of ["academy", "noLimit", "zeroLimit", "empty"]) {
      assert.ok(!PAGES[name].includes("Settlement Negotiation"), name);
      assert.ok(!PAGES[name].includes("Child Support Accounts"), name);
    }
  });
});

describe("gold roadmap: the two charts, and when they are left out", () => {
  test("jordan: the timeline sits in 01 and the dispute clock in 03", () => {
    const h = PAGES.jordan;
    const s01 = h.indexOf("01 / PROJECTION");
    const s02 = h.indexOf("02 / MONTH 1");
    const s03 = h.indexOf("03 / MONTHS 2-3");
    const s04 = h.indexOf("04 / MONTH 4");
    const tl = h.indexOf(TIMELINE);
    const ck = h.indexOf(CLOCK);
    assert.ok(tl > s01 && tl < s02, "timeline in 01");
    assert.ok(ck > s03 && ck < s04, "dispute clock in 03");
    assert.equal(h.split(TIMELINE).length - 1, 1, "one timeline");
    assert.equal(h.split(CLOCK).length - 1, 1, "one dispute clock");
  });

  test("jordan: the timeline draws today's median and the range the FILE states", () => {
    const h = PAGES.jordan;
    // Jordan's score_targets.median is "680-710 (projected)".
    assert.ok(h.includes('aria-label="Score timeline: 636 today, 680-710 projected"'));
    // The month-6 range it draws is the one printed in the 01 and 07 tables.
    assert.equal(h.match(/Median Score<\/td><td[^>]*>636<\/td><td[^>]*>680-710 \(projected\)<\/td>/g)
      .length, 2);
    // The six months are drawn, ending at month 6; the old HTML strip is not.
    for (const m of ["MONTH 1", "MONTH 6", "Launch", "Reveal"]) {
      assert.ok(h.includes(`>${m}</text>`), m);
    }
    assert.ok(!h.includes('<div class="mcol">'), "the strip is drawn once, by the chart");
    assert.ok(h.includes("PROJECTED MEDIAN SCORE RANGE"), "and its caption stays");
  });

  test("the range comes off the file: another stated range draws that range", () => {
    const c = { ...CLIENTS.repair, score_targets: { ...CLIENTS.repair.score_targets, median: "640-660" } };
    assert.ok(page(c).includes('aria-label="Score timeline: 595 today, 640-660 projected"'));
  });

  test("no stated month-6 range, no median, or a median already in the range: no timeline", () => {
    // repair (595) and academy / no-limit / zero-limit carry no score_targets,
    // so there is no month-6 range to draw (DIAGRAM_SPEC section 6). empty has
    // no scores either. The 680-710 the old look drew is the Jordan Sample's.
    for (const name of ["repair", "empty", "academy", "noLimit", "zeroLimit"]) {
      const h = PAGES[name];
      assert.ok(!h.includes(TIMELINE), `${name} draws a timeline`);
      assert.ok(!h.includes("PROJECTED MEDIAN SCORE RANGE"), `${name} captions a missing chart`);
      // The month-by-month plan still prints, as the old strip.
      assert.ok(h.includes('<div class="mcol"><div class="circ">1</div>'), name);
      assert.ok(h.includes("Re-pull all three<br>Reapply"), name);
    }
  });

  test("the dispute clock is static and drawn for every file, with no duplicate text", () => {
    for (const [name, h] of Object.entries(PAGES)) {
      assert.ok(h.includes(CLOCK), name);
      assert.ok(!h.includes("<h3>Why disputes take rounds, not days.</h3>"), `${name}: heading twice`);
      assert.equal(h.split("One round rarely clears everything. Three rounds is normal.").length - 1,
        1, `${name}: the chart's sentence printed twice`);
    }
  });

  test("the old look's charts are gone from the gold page", () => {
    for (const [name, h] of Object.entries(PAGES)) {
      assert.ok(!h.includes('<svg class="diagram"'), name);
    }
  });
});

describe("gold roadmap: the paydown cards read only the file", () => {
  test("jordan: one card per open card with a balance, closed and $0 cards left out", () => {
    const cards = PAGES.jordan.match(/<div class="card4"><div class="c4t">[^<]*<\/div>/g) || [];
    assert.deepEqual(cards.map((c) => c.replace(/<[^>]+>/g, "")),
      ["SYNCB/LEVITZ", "CITIBANK SD NA", "BENEFICIAL"]);
  });

  test("jordan: the card figures are the table's figures", () => {
    const flat = PAGES.jordan;
    const card = flat.slice(flat.indexOf('<div class="c4t">SYNCB/LEVITZ</div>'));
    for (const [k, v] of [["BALANCE", "$1,762"], ["LIMIT", "$1,894"], ["UTILIZATION", "93%"],
      ["PAY DOWN TO", "$189"], ["AMOUNT TO PAY", "$1,573"]]) {
      assert.ok(card.includes(`<span class="k">${k}</span><span class="v m">${v}</span>`), k);
    }
  });

  test("a card with no limit prints dashes and says why, never a target", () => {
    const h = PAGES.jordan;
    const card = h.slice(h.indexOf('<div class="c4t">BENEFICIAL</div>'));
    const one = card.slice(0, card.indexOf("</ul></div>") + 11);
    assert.ok(one.includes('<span class="k">PAY DOWN TO</span><span class="v m">-</span>'));
    assert.ok(one.includes('<span class="k">AMOUNT TO PAY</span><span class="v m">-</span>'));
    assert.ok(one.includes("No credit limit is reported for this card, so there is no 10% "
      + "target to pay down to."));
  });

  test("a $0 limit is named as $0, not as unreported", () => {
    const h = PAGES.zeroLimit;
    assert.ok(h.includes('<div class="c4t">SECURED CARD</div>'));
    assert.ok(h.includes("The credit limit reported for this card is $0, so there is no 10% "
      + "target to pay down to."));
    assert.ok(!h.includes("No credit limit is reported for this card"));
  });

  test("an empty file has no cards and no empty table", () => {
    const h = PAGES.empty;
    assert.ok(!h.includes('class="card4"'));
    assert.ok(!h.includes("Every revolving account on this file"));
    assert.ok(!h.includes(">ACCOUNT</th>"));
  });

  test("an empty file prints '-' for every unknown dollar, never $0, and no sentence of holes", () => {
    const h = PAGES.empty;
    assert.ok(h.includes('<div class="bigstat"><div class="bs-val">-</div></div>'));
    assert.ok(!h.includes("Up from"), "no 'Up from - today - a - increase'");
    assert.ok(h.includes('<div class="bs-lab">PROJECTED PERSONAL LOAN PRE-APPROVAL</div>'
      + '<div class="bs-val">-</div>'));
  });
});

/* EVERY SENTENCE THE OLD LOOK PRINTS, THE GOLD LOOK PRINTS. The old body is cut
   into its text runs (the words between tags); each run must be on the gold
   page. The old page is built from the same file with one row per real account
   (a tri-merge file lists each card once per bureau; the gold page prints each
   card once, see "one row per account").

   Exceptions, each one a false or unmeasured statement the gold page drops and
   each one tested on its own below: the booking line (gold links
   BOOK_CALL_URL instead of client.booking_url), text inside the old SVG
   drawings (a drawing, not a sentence), the range caption when the gold
   timeline is not drawn, the Jordan Sample's "EX 650-665" / "EX 665-680" and
   680-710 / 690+ / 670+ / 725+ printed for every client, "$0" for a business
   pre-approval no file carries, "No" / "None" for a business record the file
   does not have, "reduced" for a bureau with no negatives, the sentences with
   holes in them ("Up from - today", "estimate: -.", "climbs toward $0"),
   "You qualify ... right now" with no pre-approval, "nothing on this file to
   ... pay down" beside a card with a balance, and an engine code printed as
   words. The cover and closing panel are chrome.mjs's, tested there. */
describe("gold roadmap: the old look's words all survive", () => {
  const decode = (s) => s.replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  // An old table with headings and no rows carries no words; gold leaves it out.
  const runs = (html) => decode(html.replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<table><thead>(?:(?!<\/table>)[\s\S])*?<\/thead><tbody><\/tbody><\/table>/g, " "))
    .split(/<[^>]*>/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const flat = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
  /** Blank one cell of an old table row: the cell `at` (1 before, 2 after). */
  const blankCell = (html, label, at) => html.replace(new RegExp(
    `(${label}</td>${at === 2 ? "<td[^>]*>[^<]*</td>" : ""}<td[^>]*>)[^<]*(</td>)`, "g"), "$1$2");
  const hasBureau = (c, b) => (c.bureaus || []).some((r) => String(r[0]).toLowerCase() === b);

  for (const [name, client] of Object.entries(CLIENTS)) {
    test(name, () => {
      const first = String(client.applicant || "").trim().split(/\s+/)[0] || "Client";
      const one = { ...client, revolving: oneRowPerAccount(client.revolving) };
      const st = client.score_targets || {};
      const now = client.preapproval_now;
      const after = client.preapproval_after;
      const rises = now != null && now !== "" && after != null && after !== ""
        && Number(after) > Number(now);
      let old = buildRoadmap(one)
        .replace(cover(one, "credit optimization roadmap",
          `${first}'s 6-Month Business Readiness Roadmap`), "")
        .replace(ctaPage(one), "")
        .replace(/<div class="mex">EX 6\d\d-6\d\d<\/div>/g, "")
        .replace(/\bLate(\d+)Days\b/g, "$1 days late")
        .replace(/\bCollectionOrChargeOff\b/g, "Collection or charge-off")
        .replace(/\bChargeOff\b/g, "Charge-off");
      for (const [label, key] of [["Median Score", "median"], ["Experian Score", "experian"],
        ["Equifax Score", "equifax"], ["TransUnion Score", "transunion"]]) {
        if (!st[key]) old = blankCell(old, label, 2);
      }
      old = blankCell(old, "Business Pre-Approval", 1);
      if (!client.business) {
        old = blankCell(old, "LLC Formed", 1);
        old = blankCell(old, "Business Credit Profile", 1);
      }
      if (!hasBureau(client, "equifax") || !(client.bureaus.find((r) =>
        String(r[0]).toLowerCase() === "equifax")[2] > 0)) {
        old = blankCell(old, "Equifax [Nn]egatives", 2);
      }
      const goldHtml = buildRoadmap(client, { look: "gold" });
      const gold = flat(goldHtml);
      const drawn = goldHtml.includes(TIMELINE);
      const owes = oneRowPerAccount(client.revolving).some((r) => r[6] !== "CLOSED" && r[2] > 0);
      assert.ok(runs(old).length > 60, `${name}: too few words compared to mean anything`);
      for (let run of runs(old)) {
        if (run.startsWith("Book your strategy call at")) continue;
        if (!rises && run.startsWith("Up from ")) continue;
        if (!rises) run = run.replace(/ ?Pre-approval estimate climbs toward [^.]*\.$/, "");
        if (!(Number(now) > 0) && run.startsWith("You qualify for a personal loan right now")) {
          run = run.slice(run.indexOf("Do NOT open"));
        }
        if (owes && run.startsWith(`${first}, there is nothing on this file`)) continue;
        if (!(one.revolving || []).length && run.startsWith("This is your single biggest")) continue;
        // No state or address on the file: the gold page does not print the
        // sentence with a hole in it (tested in "honest-empty rules").
        if (!client.state && run.startsWith("File your LLC in ")) continue;
        if (!client.address && run === "Use your address at .") continue;
        if (!drawn && run.startsWith("PROJECTED MEDIAN SCORE RANGE")) continue;
        if (!run) continue;
        assert.ok(gold.includes(run), `${name}: the gold page lost "${run}"`);
      }
    });
  }
});

describe("gold roadmap: the booking link and the honest-empty rules", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    const b = body(html);

    test(`${name}: section 09 links the booking page, and nothing prints the dead URL`, () => {
      const s09 = b.slice(b.indexOf("09 / CALL TO ACTION"), b.indexOf('<div class="cta-page">'));
      assert.ok(s09.includes(`Book your strategy call at <a href="${BOOK_CALL_URL}">`
        + "apply.fundhub.ai/schedule/phonecall</a>."), name);
      assert.ok(!html.includes("fundhubbookingurl"), name);
      const own = String(CLIENTS[name].booking_url || "");
      if (own) assert.ok(!html.includes(own), `${name} prints client.booking_url`);
    });

    test(`${name}: no em dash, no en dash, no NaN, no undefined`, () => {
      assert.ok(!/[–—]/.test(b), `${name} prints a banned dash`);
      assert.ok(!/\bNaN\b/.test(html), `${name} prints NaN`);
      assert.ok(!/\bundefined\b/.test(html), `${name} prints undefined`);
    });

    test(`${name}: no banned phrase, no product the builder does not sell`, () => {
      assert.ok(!/credit[\s-]*repair/i.test(b), name);
      assert.ok(!/Fundhub Academy/i.test(b), name);
    });
  }

  test("no table cell is left blank; an unknown reads '-'", () => {
    for (const [name, h] of Object.entries(PAGES)) {
      assert.ok(!/<td[^>]*><\/td>/.test(h), `${name} has a blank table cell`);
    }
    assert.ok(/Median Score<\/td><td[^>]*>-<\/td><td[^>]*>Set at your next pull<\/td>/
      .test(PAGES.empty), "the empty file's median reads -");
  });

  test("no state or address on the file: no sentence with a hole in it", () => {
    const h = PAGES.empty;
    assert.ok(h.includes("<li>File your LLC online with the Secretary of State.</li>"));
    assert.ok(!h.includes("File your LLC in  online"));
    assert.ok(!h.includes("Use your address at ."));
    // A file that carries them still prints both, unchanged.
    assert.ok(PAGES.jordan.includes("<li>File your LLC in Texas online with the Secretary of "
      + "State for $300.</li><li>Use your address at 5815 Knoll Krest St, San Antonio, TX "
      + "78242.</li>"));
  });

  test("academy: no Jordan Sample leftovers", () => {
    for (const leak of ["Jordan", "SYNCB", "SIGNET BANK", "San Antonio", "Knoll Krest"]) {
      assert.ok(!PAGES.academy.includes(leak), `academy leaked ${leak}`);
    }
  });

  test("the gold look adds no number the file does not carry", () => {
    // The lenders the gold pack names for Jordan are not on any file here.
    for (const [name, h] of Object.entries(PAGES)) {
      for (const invented of ["Capital One Spark Cash", "Kabbage", "OnDeck", "Navy Federal",
        "$12,000-$15,000", "725 (holding steady)", "2-3 (reduced)", "10-15 unlocked",
        "Pro tip", "annualcreditreport.com"]) {
        assert.ok(!h.includes(invented), `${name} prints ${invented}`);
      }
    }
  });
});

/* Second pass, 2026-09-17: one test per gap the independent check found. */
describe("gold roadmap: nothing the file does not state (fix pass)", () => {
  const b = (name) => body(PAGES[name]);
  /** The text of one table row, cells joined by " | ". */
  const row = (html, label) => {
    const m = new RegExp(`<tr><td[^>]*>${label}</td>((?:<td[^>]*>[^<]*</td>)+)</tr>`).exec(html);
    return m ? m[1].replace(/<\/td><td[^>]*>/g, " | ").replace(/<[^>]+>/g, "") : null;
  };
  const rows = (html, label) => html.match(new RegExp(
    `<tr><td[^>]*>${label}</td>(?:<td[^>]*>[^<]*</td>)+</tr>`, "g")) || [];

  test("gap 1: no Experian projection the file does not make, in the chart or the strip", () => {
    for (const [name, h] of Object.entries(PAGES)) {
      assert.ok(!/EX 6\d\d-6\d\d/.test(h), `${name} prints the Jordan Sample's EX projection`);
      assert.ok(!h.includes('class="mex"'), `${name} prints a month note`);
    }
    // The month plan itself still prints, drawn or as the strip.
    assert.ok(PAGES.academy.includes("EIN, DUNS<br>Net-30 vendors"));
    assert.ok(PAGES.jordan.includes(">Net-30 vendors</text>"));
  });

  test("gap 2: month-6 score targets are the file's own, never the Jordan Sample's", () => {
    // Jordan's file states them; the 07 table prints them as the 01 table does.
    assert.equal(row(PAGES.jordan, "Experian Score").split(" | ")[1], "690+");
    assert.equal(rows(PAGES.jordan, "TransUnion Score").filter((r) =>
      r.includes(">725+ (already strong)</td>")).length, 2);
    // No other file states one: every month-6 score cell says so, in both tables.
    for (const name of ["repair", "academy", "noLimit", "zeroLimit", "empty"]) {
      for (const label of ["Median Score", "Experian Score", "Equifax Score", "TransUnion Score"]) {
        const found = rows(PAGES[name], label);
        assert.equal(found.length, 2, `${name} ${label}`);
        for (const r of found) assert.ok(r.includes(">Set at your next pull</td>"), `${name}: ${r}`);
      }
      for (const invented of [">680-710<", ">690+<", ">670+<", ">725+<", "680-710 projected"]) {
        assert.ok(!PAGES[name].includes(invented), `${name} prints ${invented}`);
      }
    }
    // The academy's 762 is not "projected" down to 690+.
    assert.ok(!/762<\/td><td[^>]*>6\d\d/.test(PAGES.academy));
  });

  test("gap 3: one card, one row, one checklist line per real account", () => {
    const one = oneRowPerAccount(CLIENTS.repair.revolving);
    assert.equal(one.length, 3, "8 bureau rows are 3 accounts");
    assert.deepEqual(one.find((r) => r[0] === "Credit One Bank").slice(1, 2),
      ["TransUnion, Experian, Equifax"]);
    // Two identical rows on the SAME bureau are two accounts, not one.
    const twin = ["CARD", "Experian", 100, 1000, "10%", "", "MONITOR"];
    assert.equal(oneRowPerAccount([twin, [...twin]]).length, 2);
    assert.equal(oneRowPerAccount([twin, [...twin.slice(0, 1), "Equifax", ...twin.slice(2)]]).length, 1);

    const r = PAGES.repair;
    const cards = (r.match(/<div class="c4t">[^<]*<\/div>/g) || []).map((c) => c.replace(/<[^>]+>/g, ""));
    assert.deepEqual(cards, ["Synchrony Bank / Care Credit", "Credit One Bank", "Capital One Platinum"]);
    assert.ok(r.includes('<span class="k">BUREAU</span><span class="v">TransUnion, Experian, Equifax</span>'));
    assert.ok(r.includes("Total paydown to reach 10% utilization: $6,160."), "2,250 + 1,340 + 2,570");
    assert.ok(r.includes("3 cards carrying high balances"));
    assert.equal(r.match(/<tr><td[^>]*>Credit One Bank<\/td>/g).length, 1, "one table row");
    const a = PAGES.academy;
    assert.ok(a.includes("Total paydown to reach 10% utilization: $3,350."));
    assert.equal(rows(a, "American Express Blue Business Cash Utilization").length, 1);
    assert.equal(a.split("<li>Pay American Express Blue Business Cash from $4,800 down to $2,500</li>")
      .length - 1, 1, "one checklist line");
    // A file with no duplicates prints exactly what it did.
    assert.ok(PAGES.jordan.includes("Total paydown to reach 10% utilization: $2,008."));
  });

  test("gap 4: no made-up zero for a business pre-approval or today's lenders", () => {
    for (const name of Object.keys(PAGES)) {
      assert.equal(row(PAGES[name], "Business Pre-Approval").split(" | ")[0], "-", name);
    }
    // A flat lender list does not say how many are open today.
    for (const name of ["jordan", "repair", "academy"]) {
      assert.equal(row(PAGES[name], "Lenders on this shortlist"), "- | 15", name);
      assert.equal(row(PAGES[name], "Lenders Available"), "- | 15 unlocked", name);
    }
    // A file that splits them does, and a real count prints.
    assert.equal(row(PAGES.noLimit, "Lenders on this shortlist"), "5 | 15");
    assert.equal(row(PAGES.noLimit, "Lenders Available"), "5 | 15 unlocked");
  });

  test("gap 8: no dangling dash on an Equifax item, and engine codes print as words", () => {
    const r = b("repair");
    assert.ok(!/ - <\/li>/.test(r), "a bullet ends in ' - '");
    assert.ok(r.includes("<li><b>Portfolio Recovery Associates</b> - Collection or charge-off</li>"));
    assert.ok(r.includes("<li>Capital One Platinum - 30 days late - $2,870.</li>"));
    assert.ok(!/\b(Late30Days|CollectionOrChargeOff|ChargeOff)\b/.test(r), "a raw code prints");
    // A file whose items carry a `why` prints it, unchanged.
    assert.ok(b("jordan").includes("<li><b>CONNECTICUT CHILD SU</b> - 28 late payments."));
  });

  test("gap 9: no sentence with a hole in it, and no rise or approval that is not there", () => {
    for (const name of ["empty", "repair"]) {
      const h = b(name);
      assert.ok(!h.includes("Up from"), `${name}: "Up from - today" / "a $0 increase"`);
      assert.ok(!h.includes("You qualify for a personal loan right now"), name);
      assert.ok(!h.includes("pre-approval estimate: -"), name);
      assert.ok(!h.includes("climbs toward $0") && !h.includes("climbs toward -"), name);
      assert.ok(h.includes("<h3>Step 6: Secure Your Personal Loan NOW</h3><p>Do NOT open any new "
        + "credit cards or accounts before you lock this in"), name);
    }
    assert.ok(b("repair").includes("TransUnion holding at or above 595.</p>"));
    assert.ok(b("repair").includes('<div class="bigstat"><div class="bs-val">$0</div></div>'));
    // A file with a real rise keeps all three, word for word.
    const j = b("jordan");
    assert.ok(j.includes('<div class="bs-sub">Up from $7,936 today - a $11,905 increase</div>'));
    assert.ok(j.includes("You qualify for a personal loan right now, before any repairs. Current "
      + "pre-approval estimate: $7,936. Do NOT open"));
    assert.ok(j.includes("Pre-approval estimate climbs toward $19,841.</p>"));
  });

  test("gap 10: the negative-item targets agree with each other", () => {
    const j = PAGES.jordan;
    assert.equal(rows(j, "Negative items").map((r) => r.replace(/<[^>]+>/g, "|")).length, 2);
    for (const r of rows(j, "Negative items")) assert.ok(r.includes(">reduced</td>"), r);
    assert.equal(row(j, "Experian Negatives"), "1 | 0");
    assert.equal(row(j, "Equifax Negatives"), "7 | reduced");
    assert.equal(row(PAGES.repair, "Negative items"), "9 | reduced");
    // A bureau with no negatives aims at 0, and nothing on a clean file is "reduced".
    for (const name of ["academy", "noLimit", "zeroLimit"]) {
      assert.equal(row(PAGES[name], "Equifax Negatives"), "0 | 0", name);
      assert.equal(row(PAGES[name], "Equifax negatives"), "0 | 0", name);
      assert.equal(row(PAGES[name], "Negative items"), "0 | 0", name);
      assert.ok(!PAGES[name].includes(">reduced<"), name);
    }
    // No bureau row on the file, no count: "-", not 0.
    assert.equal(row(PAGES.empty, "Experian Negatives"), "- | 0");
    assert.equal(row(PAGES.empty, "Equifax Negatives"), "- | 0");
  });

  test("gap 11: the business cells read the file's business record", () => {
    for (const name of ["jordan", "repair", "academy"]) {
      assert.equal(row(PAGES[name], "LLC Formed"), "- | Yes (4-6 months old)", name);
      assert.equal(row(PAGES[name], "Business Credit Profile"), "- | Active (Paydex building)", name);
    }
    // hasEntity false is the mapper's "no company row, no business" (F15).
    for (const name of ["noLimit", "zeroLimit", "empty"]) {
      assert.equal(row(PAGES[name], "LLC Formed").split(" | ")[0], "No", name);
      assert.equal(row(PAGES[name], "Business Credit Profile").split(" | ")[0], "None", name);
    }
    const withLlc = page({ ...CLIENTS.noLimit, business: { hasEntity: true, ageMonths: 14, name: "X LLC" } });
    assert.equal(row(withLlc, "LLC Formed").split(" | ")[0], "Yes");
    assert.equal(row(withLlc, "Business Credit Profile").split(" | ")[0], "-");
  });

  test("gap 12: an empty file's Step 1 says there is nothing to pay down", () => {
    const h = b("empty");
    assert.ok(h.includes("<h3>Step 1: The Paydown Plan</h3><p>There are no open revolving cards "
      + "on this file to pay down.</p>"));
    assert.ok(!h.includes("Lenders see your utilization"));
    // A file with cards keeps the lever sentence.
    assert.ok(b("jordan").includes("Lenders see 97% utilization and they slow down."));
  });

  test("gap 13: 'nothing to pay down' is never said beside a card with a balance", () => {
    for (const name of ["noLimit", "academy", "zeroLimit"]) {
      assert.ok(!b(name).includes("nothing on this file to dispute or pay down"), name);
    }
    // A file that truly has nothing still says so.
    assert.ok(b("empty").includes("Client, there is nothing on this file to dispute or pay down"));
    // A file with things holding it back still names them.
    assert.ok(b("jordan").includes("Jordan, the two things holding you back right now are 2 cards"));
  });
});

describe("the old look is untouched", () => {
  for (const [name, c] of Object.entries(CLIENTS)) {
    test(`${name}: no opts, empty opts and a non-gold look print the same bytes`, () => {
      const plain = buildRoadmap(c);
      assert.equal(buildRoadmap(c, {}), plain);
      assert.equal(buildRoadmap(c, { look: "classic" }), plain);
      for (const goldOnly of ['class="card4"', "fh-ul", "fh-check", "mquote", "bigstat",
        "Score timeline", "Month 2 Action Items"]) {
        assert.ok(!plain.includes(goldOnly), `${name}: ${goldOnly} leaked into the old look`);
      }
    });
  }
});
