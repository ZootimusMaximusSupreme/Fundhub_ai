// The Capital Partner Shortlist in the gold look (W4b, 2026-09-17).
//
// What a buyer holding the gold pack looks for: the cover, five numbered
// sections in the gold order, the unlock ladder in 01, gold lender cards in 02,
// the application order chart in 03, the order rules spelled out in 04, the
// numbers at a glance in 05, and the honest closing panel. Every sentence the
// builder printed before the gold look still prints. Nothing is invented for
// a file that does not have it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderDeliverableHtml } from "./index.mjs";
import { buildLenderList } from "./lender-list.mjs";
import { CLOSING_CTA_URL, GOLD } from "./chrome.mjs";
import { lenderBuckets } from "./derive.mjs";
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
const WITH_SCORES = ["jordan", "repair", "academy", "no-limit", "zero-limit"];

// fontsHref keeps the base64 font payload out of the page; "NaN" occurs inside it.
const page = (client) =>
  renderDeliverableHtml({ client, doc: "lender_match", fontsHref: "/assets/fonts" }).html;
const gold = (client) => buildLenderList(client, { look: GOLD });
const noStyle = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "");
const text = (html) => noStyle(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const SECTIONS = [
  ["01", "AVAILABLE NOW", "Available Right Now"],
  ["02", "SHORTLIST", "After Optimization - Your Shortlist"],
  ["03", "APPLICATION ORDER", "Application Order Warning"],
  ["04", "STRATEGY", "The Order, Spelled Out"],
  ["05", "AT A GLANCE", "Your Numbers at a Glance"]
];
const LADDER = 'aria-label="Score ladder: your median score';
const ORDER = 'aria-label="The order protects your score. Follow it exactly."';

describe("gold lender list: every gold section, in the gold order", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    // The empty file has no lender at all, so it has no shortlist (02) to show.
    const expected = name === "empty" ? SECTIONS.filter(([num]) => num !== "02") : SECTIONS;
    test(`${name}: cover, ${expected.map(([n]) => n).join(" ")}, closing panel`, () => {
      const html = page(client);
      let at = html.indexOf('<div class="cover">');
      assert.ok(at >= 0, "the cover");
      for (const [num, label, heading] of expected) {
        const eyebrow = `<div class="eyebrow">${num} / ${label}</div><h2>${heading}</h2>`;
        const next = html.indexOf(eyebrow);
        assert.ok(next > at, `${num} ${heading} missing or out of order`);
        at = next;
      }
      assert.ok(html.indexOf('<div class="cta-page">') > at, "the closing panel comes last");
      assert.equal((html.match(/<div class="eyebrow">\d\d \//g) || []).length, expected.length);
    });
  }

  test("the default look still has four sections (the parity look is untouched)", () => {
    const html = buildLenderList(CLIENTS.jordan);
    assert.equal((html.match(/<div class="eyebrow">\d\d \//g) || []).length, 4);
    assert.ok(!html.includes("STRATEGY"));
    for (const c of Object.values(CLIENTS)) {
      assert.equal(buildLenderList(c), buildLenderList(c, {}));
    }
  });
});

describe("gold lender list: the two charts", () => {
  test("Jordan: the unlock ladder in 01 and the application order in 03", () => {
    const html = page(CLIENTS.jordan);
    const s01 = html.indexOf("01 / AVAILABLE NOW");
    const s02 = html.indexOf("02 / SHORTLIST");
    const s03 = html.indexOf("03 / APPLICATION ORDER");
    const s04 = html.indexOf("04 / STRATEGY");
    const ladder = html.indexOf(LADDER);
    const order = html.indexOf(ORDER);
    assert.ok(ladder > s01 && ladder < s02, "unlock ladder sits in 01");
    assert.ok(order > s03 && order < s04, "application order sits in 03");
    assert.ok(html.includes(`${LADDER} 636`), "the ladder marks the median, 636");
  });

  test("Jordan: the gold charts replace the old ruler, ladder table, steps and shotgun", () => {
    const html = page(CLIENTS.jordan);
    assert.ok(!html.includes('<svg class="diagram" viewBox="0 0 700 60"'), "old score ruler");
    assert.ok(!html.includes('<svg viewBox="0 0 200 190"'), "old shotgun");
    assert.ok(!html.includes('<div class="steps">'), "old steps list");
    assert.ok(!html.includes("LENDERS THAT UNLOCK"), "old ladder table");
  });

  test("Jordan: the ladder's tiers are the builder's own shortlist, every lender once", () => {
    const html = page(CLIENTS.jordan);
    const [, after] = lenderBuckets(CLIENTS.jordan);
    const chart = html.slice(html.indexOf(LADDER), html.indexOf("</svg>", html.indexOf(LADDER)));
    const shown = text(chart);
    for (const [nm] of after) assert.ok(shown.includes(nm.replace(/&/g, "&amp;")), `${nm} is on the ladder`);
    for (const [floor, gap] of [[640, 4], [650, 14], [660, 24], [680, 44], [700, 64]]) {
      assert.ok(shown.includes(`${floor}`) && shown.includes(`+${gap} PTS`), `tier ${floor}`);
    }
  });

  test("the ladder's caption says a floor is not an approval", () => {
    assert.ok(page(CLIENTS.jordan).includes("A FLOOR IS THE MINIMUM, NOT AN APPROVAL"));
  });

  test("no file is ever told a shortlisted lender is UNLOCKED", () => {
    // The builder drops floors at or under the median: those lenders are held
    // back by something other than score, so UNLOCKED would be false.
    for (const [name, client] of Object.entries(CLIENTS)) {
      assert.ok(!page(client).includes("UNLOCKED"), name);
    }
  });

  test("the ladder is suppressed when there is nothing honest to draw", () => {
    assert.ok(!page(CLIENTS.empty).includes(LADDER), "empty file: no scores, no lenders");
    assert.ok(!page(CLIENTS.academy).includes(LADDER), "every floor is at or under the median");
    const noLenders = { ...CLIENTS.jordan, lenders: [], lenders_now: [], lenders_after: [] };
    assert.ok(!page(noLenders).includes(LADDER), "lender set empty (DIAGRAM_SPEC 6)");
    const noScores = { ...CLIENTS.jordan, scores: {} };
    assert.ok(!page(noScores).includes(LADDER), "no median: nothing to mark");
  });

  test("the application order chart is drawn for every file (five steps, always)", () => {
    for (const [name, client] of Object.entries(CLIENTS)) {
      assert.ok(page(client).includes(ORDER), name);
    }
  });
});

describe("gold lender list: the blocks", () => {
  test("every shortlisted lender is a gold card: name, key-value rows, why it fits", () => {
    for (const name of WITH_SCORES) {
      const client = CLIENTS[name];
      const [, after] = lenderBuckets(client);
      const html = page(client);
      const cards = html.match(/<div class="lender"><div class="lname">/g) || [];
      assert.equal(cards.length, after.length, name);
      assert.equal((html.match(/<div class="kvrow">/g) || []).length, after.length, name);
      assert.ok(!html.includes('<div class="why">') && !html.includes('<div class="nm">'), name);
    }
  });

  test("Jordan's Navy Federal card carries TYPE, RANGE, SCORE NEEDED, YOU NEED", () => {
    const html = page(CLIENTS.jordan);
    const at = html.indexOf('<div class="lname">Navy Federal Credit Union</div>');
    const card = html.slice(at, html.indexOf('<div class="lender">', at + 1));
    for (const k of ["TYPE", "RANGE", "SCORE NEEDED", "YOU NEED"]) {
      assert.ok(card.includes(`<span class="k">${k}</span>`), k);
    }
    assert.ok(card.includes("14 more points on your median score"));
    assert.ok(card.includes('<span class="m">$5,000</span> - <span class="m">$15,000</span>'));
    assert.ok(card.includes('<div class="fit">Navy Federal Credit Union fits you because'));
  });

  test("a business lender shows TIME IN BUSINESS and REVENUE", () => {
    const html = page(CLIENTS.jordan);
    assert.ok(html.includes('<span class="k">TIME IN BUSINESS</span>'));
    assert.ok(html.includes('<span class="k">REVENUE</span>'));
  });

  test("a category with no note prints no empty note line", () => {
    const html = page(CLIENTS.jordan);
    assert.ok(html.includes("<h3>Business Term Loans</h3>"));
    assert.ok(!html.includes('<p class="small"></p>'));
  });

  test("04 spells out the chart's five rules as sentences, the same words, not the mono capitals", () => {
    const html = page(CLIENTS.jordan);
    const s04 = html.slice(html.indexOf("04 / STRATEGY"), html.indexOf("05 / AT A GLANCE"));
    const chart = html.slice(html.indexOf(ORDER), html.indexOf("</svg>", html.indexOf(ORDER)));
    const rules = [
      ["Fix utilization first", "PAY SYNCB/LEVITZ DOWN TO $189", "Pay SYNCB/LEVITZ down to $189."],
      ["Lowest score floor first", "NAVY FEDERAL CREDIT UNION ASKS FOR 650. THAT IS YOUR FIRST TARGET",
        "Navy Federal Credit Union asks for 650. That is your first target."],
      ["One at a time", "WAIT FOR THE DECISION", "Wait for the decision."],
      ["Work up the list", "HIGHER-FLOOR LENDERS ONLY AFTER THE SCORE MOVES",
        "Higher-floor lenders only after the score moves."],
      ["Personal before business", "LOCK PERSONAL · THEN FORM THE LLC", "Lock personal. Then form the LLC."]
    ];
    assert.ok(s04.includes('<ul class="fh-ul">'), "a square-bullet list, as the gold page draws it");
    assert.equal((s04.match(/<li>/g) || []).length, 5);
    for (const [rule, caps, sentence] of rules) {
      assert.ok(s04.includes(`<li><b>${rule}.</b> ${sentence}</li>`), `04 spells out ${rule}`);
      assert.ok(!s04.includes(caps), `04 does not print the chart's "${caps}" a second time`);
      assert.equal(sentence.toUpperCase().replace(/\.$/, ""), caps.replace(" · ", ". "),
        "the sentence carries exactly the chart's words");
      assert.ok(chart.includes(rule) && chart.includes(caps), `the chart still has ${rule}`);
    }
    assert.ok(!s04.includes("mono small"), "no mono capitals line in 04");
    assert.ok(!/academy/i.test(s04), "no Academy advert in the strategy section");
  });

  test("04 ends on the builder's bold line, printed once on the page", () => {
    const html = page(CLIENTS.jordan);
    const s03 = html.slice(html.indexOf("03 / APPLICATION ORDER"), html.indexOf("04 / STRATEGY"));
    const s04 = html.slice(html.indexOf("04 / STRATEGY"), html.indexOf("05 / AT A GLANCE"));
    assert.ok(/<\/ul><p><b>The wrong order costs you money and time\.<\/b><\/p>/.test(s04));
    assert.ok(!s03.includes("The wrong order costs you money and time."));
    assert.equal(text(html).split("The wrong order costs you money and time.").length - 1, 1);
  });

  test("05 at a glance is a gold table", () => {
    const html = page(CLIENTS.jordan);
    const s05 = html.slice(html.indexOf("05 / AT A GLANCE"));
    assert.ok(s05.includes('<table class="fh">'));
    assert.ok(/Median Score<\/td><td class="m">636<\/td>/.test(s05));
    assert.ok(/Lenders Available<\/td><td class="m">0<\/td><td class="m">15<\/td>/.test(s05));
  });
});

describe("gold lender list: the words did not change", () => {
  /* Every paragraph, heading, callout, note, step and reason the default look
     prints must still print in the gold look. A chart may carry a sentence
     instead of the HTML, so the check reads the page's text, SVG included.
     Only the matcher's own trailing full stop before the sentence's full stop
     is folded ("..") because the gold card does not print it twice. */
  const FRAGMENTS = [
    /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g,
    /<h3>([\s\S]*?)<\/h3>/g,
    /<div class="callout bar">([\s\S]*?)<\/div>/g,
    /<div class="note">([\s\S]*?)<\/div>/g,
    /<div class="why">([\s\S]*?)<\/div>/g,
    /<div class="t">([\s\S]*?)<\/div>/g,
    /<div class="d">([\s\S]*?)<\/div>/g
  ];
  const norm = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/\.\.+/g, ".").trim();

  /* The fix pass (2026-09-17) corrects a few default lines in the gold look
     because they said what the file does not support. Each is listed here with
     exactly what the gold page prints instead (null: left out). Anything not
     listed must still print word for word. */
  const TARGET = (who) => ({
    "KABBAGE (AMEX) ASKS FOR 640. THAT IS YOUR FIRST TARGET": `${who}. THAT IS YOUR FIRST TARGET`
  });
  // 03 keeps the first sentence under the chart; 04 now ends on the second.
  const SPLIT = {
    "The same five applications in the wrong order get declined. The wrong order costs you money and time.":
      "The same five applications in the wrong order get declined."
  };
  const CORRECTED = {
    jordan: { ...TARGET("NAVY FEDERAL CREDIT UNION ASKS FOR 650"), ...SPLIT },
    repair: { ...TARGET("NAVY FEDERAL* ASKS FOR 650"), ...SPLIT },
    academy: {
      ...TARGET("NAVY FEDERAL* ASKS FOR 650"), ...SPLIT,
      "Your Experian score sits at 762. Your median score is 762. And your utilization is at 17% - that's critical.":
        "Your Experian score sits at 762. Your median score is 762. And your utilization is at 17%.",
      ["No lenders are matched for immediate funding right now. You are not far off. The score ladder below "
        + "shows exactly how many points stand between you and each one."]: null,
      "These 15 lenders unlock once you repair the key items. Here is who fits you and why.":
        "Here is who fits you and why."
    },
    "no-limit": { ...TARGET("MARCUS BY GOLDMAN SACHS ASKS FOR 660"), ...SPLIT },
    "zero-limit": { ...TARGET("MARCUS BY GOLDMAN SACHS ASKS FOR 660"), ...SPLIT }
  };

  for (const name of WITH_SCORES) {
    test(`${name}: every default sentence is on the gold page, or its listed correction is`, () => {
      const client = CLIENTS[name];
      const before = buildLenderList(client);
      const body = before.slice(0, before.indexOf('<div class="cta-page">'));
      const after = norm(text(gold(client)));
      const fixes = CORRECTED[name];
      const used = new Set();
      let checked = 0;
      for (const rx of FRAGMENTS) {
        for (const m of body.matchAll(rx)) {
          const frag = norm(m[1]);
          if (!frag) continue;
          checked += 1;
          if (Object.hasOwn(fixes, frag)) {
            used.add(frag);
            assert.ok(!after.includes(frag), `${name} still prints the corrected line: ${frag}`);
            if (fixes[frag] !== null) assert.ok(after.includes(fixes[frag]), `${name} lost: ${fixes[frag]}`);
            continue;
          }
          assert.ok(after.includes(frag), `${name} lost: ${frag}`);
        }
      }
      assert.ok(checked > 20, `${name}: only ${checked} fragments were checked`);
      assert.deepEqual([...used].sort(), Object.keys(fixes).sort(), `${name}: every listed correction was needed`);
    });
  }
});

describe("gold lender list: honest when the file is empty", () => {
  const html = page(CLIENTS.empty);

  test("a missing score prints '-', never blank and never 0", () => {
    assert.ok(html.includes("Your Experian score sits at -. Your median score is -."));
    assert.ok(/Median Score<\/td><td class="m">-<\/td>/.test(html));
    assert.ok(!html.includes("more points on your median score"), "no gap against an unknown median");
  });

  test("a lender with no floor or range on file prints '-' and is never 'the lowest floor'", () => {
    const client = JSON.parse(JSON.stringify(CLIENTS.jordan));
    const navy = client.lenders.find((r) => r[0] === "Navy Federal Credit Union");
    navy[3] = null;
    navy[4] = null;
    navy[5] = null;
    const out = page(client);
    const at = out.indexOf('<div class="lname">Navy Federal Credit Union</div>');
    const card = out.slice(at, out.indexOf('<div class="lender">', at + 1));
    assert.ok(card.includes('<span class="k">RANGE</span><span class="v">-</span>'));
    assert.ok(card.includes('<span class="k">SCORE NEEDED</span><span class="v">-</span>'));
    assert.ok(!card.includes("YOU NEED"));
    assert.ok(!out.includes("NAVY FEDERAL CREDIT UNION ASKS FOR"));
    // The next personal floor up, not Kabbage's lower business floor (rule 5).
    assert.ok(out.includes("MARCUS BY GOLDMAN SACHS ASKS FOR 660"));
    assert.ok(!/\bnull\b/.test(text(out)));
  });
});

/* Fix pass, 2026-09-17: one block per gap the independent checker found. The
   default look is untouched by every one of these (see "the default look still
   has four sections" and port-parity.test.mjs). */
const copy = (c) => JSON.parse(JSON.stringify(c));
const between = (html, from, to) => {
  const at = html.indexOf(from);
  const end = to ? html.indexOf(to, at) : -1;
  return html.slice(at, end < 0 ? undefined : end);
};
const glance = (html) => text(between(html, "05 / AT A GLANCE", '<div class="cta-page">'));
const PROMISE = "The score ladder below shows exactly how many points stand between you and each one.";

describe("fix pass 1: a lender open today with no range on file prints '-', not $0K", () => {
  const client = {
    ...copy(CLIENTS.jordan),
    lenders_now: [
      ["Lender A", "Personal Loans", "Personal Loan", null, null, null, null, null, "x"],
      ["Lender B", "Personal Loans", "Personal Loan", 5000, null, 600, null, null, "y"],
      ["Lender C", "Personal Loans", "Personal Loan", 3500, 40000, 660, null, null, "z"]
    ],
    lenders_after: []
  };
  const s01 = between(page(client), "01 / AVAILABLE NOW", "02 / SHORTLIST");

  test("no range at all: '-'", () => {
    assert.ok(/Lender A<\/td><td[^>]*>Personal Loan<\/td><td[^>]*>-<\/td><td[^>]*>-<\/td>/.test(s01));
  });
  test("one end missing: the known end, '-' for the other", () => {
    assert.ok(/Lender B<\/td><td[^>]*>Personal Loan<\/td><td[^>]*>\$5K - -<\/td>/.test(s01));
  });
  test("a full range prints as before", () => {
    assert.ok(s01.includes(">$3,500-$40K</td>"));
    assert.ok(!s01.includes("$0K"), "never an invented $0 end");
  });
});

describe("fix pass 2: the callout promises the ladder only when the ladder is drawn", () => {
  test("Jordan and repair: promise and ladder, both in 01", () => {
    for (const name of ["jordan", "repair"]) {
      const s01 = between(page(CLIENTS[name]), "01 / AVAILABLE NOW", "02 / SHORTLIST");
      assert.ok(s01.includes(PROMISE) && s01.includes(LADDER), name);
    }
  });

  test("scores, no lender open today, every locked floor already cleared: no ladder, no promise", () => {
    const client = { ...copy(CLIENTS.jordan), scores: { experian: 760, equifax: 762, transunion: 758 },
      lenders_now: [], lenders_after: copy(CLIENTS.jordan.lenders) };
    const s01 = between(page(client), "01 / AVAILABLE NOW", "02 / SHORTLIST");
    assert.ok(!s01.includes(LADDER));
    assert.ok(!s01.includes(PROMISE) && !s01.includes("You are not far off. The score ladder"));
    assert.ok(s01.includes('<div class="callout bar">No lenders are matched for immediate funding right now.</div>'));
  });

  test("lenders but no scores: no ladder, no promise", () => {
    const client = { ...copy(CLIENTS.jordan), scores: {}, lenders_now: [], lenders_after: copy(CLIENTS.jordan.lenders) };
    const html = page(client);
    assert.ok(!html.includes(LADDER) && !html.includes(PROMISE));
  });

  test("scores but no lenders, and the empty file: no promise", () => {
    const noLenders = { ...copy(CLIENTS.jordan), lenders: [], lenders_now: [], lenders_after: [] };
    for (const html of [page(noLenders), page(CLIENTS.empty)]) {
      assert.ok(!html.includes(PROMISE) && !html.includes(LADDER));
    }
  });

  test("academy: the page never promises a ladder it does not draw", () => {
    const html = page(CLIENTS.academy);
    assert.ok(!html.includes(PROMISE) && !html.includes(LADDER));
  });
});

describe("fix pass 3: the empty file does not contradict itself or promise a timeline", () => {
  const html = page(CLIENTS.empty);

  test("no lender at all: no shortlist section, no 'every lender is already open'", () => {
    assert.ok(!html.includes("02 / SHORTLIST"));
    assert.ok(!html.includes("Nothing on this list is out of reach"));
    assert.ok(html.includes("No lenders are matched for immediate funding right now."));
    assert.ok(/Lenders Available<\/td><td[^>]*>0<\/td><td[^>]*>0<\/td>/.test(html));
  });

  test("no score: no 'You are not far off. Weeks, not years.'", () => {
    assert.ok(!html.includes("You are not far off"));
    assert.ok(!html.includes("Weeks, not years"));
  });

  test("the sentence stays where it is true: lenders open today, none locked", () => {
    const client = { ...copy(CLIENTS["no-limit"]), lenders_after: [] };
    const out = page(client);
    assert.ok(out.includes("Nothing on this list is out of reach. Every lender the matcher knows is "
      + "already open to you."));
    assert.ok(out.includes("02 / SHORTLIST"));
  });

  test("scores but no lender: 'not far off' has nothing to be near", () => {
    const client = { ...copy(CLIENTS["no-limit"]), lenders: [], lenders_now: [], lenders_after: [] };
    assert.ok(!page(client).includes("You are not far off"));
  });
});

describe("fix pass 4: the projected median is printed only when it is a gain", () => {
  test("Jordan (636) and repair (595): 680-700 projected", () => {
    for (const [name, med] of [["jordan", "636"], ["repair", "595"]]) {
      assert.ok(glance(page(CLIENTS[name])).includes(`Median Score ${med} 680-700 projected`), name);
    }
  });

  test("no score, 700, 762, and a 690 median: '-', never a projection", () => {
    const at690 = { ...copy(CLIENTS.jordan), scores: { experian: 690, equifax: 688, transunion: 700 } };
    for (const [name, client, med] of [["empty", CLIENTS.empty, "-"], ["no-limit", CLIENTS["no-limit"], "700"],
      ["zero-limit", CLIENTS["zero-limit"], "700"], ["academy", CLIENTS.academy, "762"], ["690", at690, "690"]]) {
      const g = glance(page(client));
      assert.ok(g.includes(`Median Score ${med} - Utilization`), `${name}: ${g}`);
      assert.ok(!g.includes("projected"), name);
    }
  });
});

describe("fix pass 5: the first target is a personal lender (rule 5), open today first", () => {
  const target = (html) => (text(html).match(/([A-Z0-9*().&; ]+) ASKS FOR (\d+)\. THAT IS YOUR FIRST TARGET/) || [])
    .slice(1).join(" ");

  test("Jordan: Navy Federal at 650, the gold pack's first personal target, not Kabbage at 640", () => {
    const html = page(CLIENTS.jordan);
    assert.equal(target(html).trim(), "NAVY FEDERAL CREDIT UNION 650");
    assert.ok(!html.includes("KABBAGE (AMEX) ASKS FOR"));
    assert.ok(html.includes("<li><b>Lowest score floor first.</b> Navy Federal Credit Union asks for 650. "
      + "That is your first target.</li>"), "04 names the same lender as the chart");
  });

  test("no-limit and zero-limit: Marcus at 660, open today, not a locked lender", () => {
    for (const name of ["no-limit", "zero-limit"]) {
      const html = page(CLIENTS[name]);
      assert.equal(target(html).trim(), "MARCUS BY GOLDMAN SACHS 660", name);
      const [now] = lenderBuckets(CLIENTS[name]);
      assert.ok(now.some((r) => r[0] === "Marcus by Goldman Sachs"), "Marcus is in the open-today table");
    }
  });

  test("never a business lender while a personal one has a floor", () => {
    for (const name of WITH_SCORES) {
      const html = page(CLIENTS[name]);
      const [now, after] = lenderBuckets(CLIENTS[name]);
      const named = [...now, ...after].find((r) =>
        text(html).includes(`${String(r[0]).toUpperCase()} ASKS FOR ${r[5]}. THAT IS YOUR FIRST TARGET`));
      assert.ok(named && /^Personal/.test(named[1]), `${name} names ${named && named[0]}`);
    }
  });

  test("a file with only business lenders names the lowest business floor", () => {
    const client = copy(CLIENTS.jordan);
    client.lenders = client.lenders.filter((r) => !/^Personal/.test(r[1]));
    assert.ok(page(client).includes("KABBAGE (AMEX) ASKS FOR 640. THAT IS YOUR FIRST TARGET"));
  });
});

describe("fix pass 6: a file that never split its lenders is not told 0 are open today", () => {
  const html = page(CLIENTS.academy);

  test("academy (median 762, every floor 700 or less): today is '-', not 0", () => {
    assert.ok(/Lenders Available<\/td><td[^>]*>-<\/td><td[^>]*>15<\/td>/.test(html));
  });

  test("academy: no 'none matched today', no 'unlock once you repair'", () => {
    assert.ok(!html.includes("No lenders are matched for immediate funding right now"));
    assert.ok(!html.includes("unlock once you repair the key items"));
    assert.ok(html.includes("<p>Here is who fits you and why.</p>"));
  });

  test("Jordan (not split, every floor above 636): 0 today still holds, as in the gold pack", () => {
    const j = page(CLIENTS.jordan);
    assert.ok(/Lenders Available<\/td><td[^>]*>0<\/td><td[^>]*>15<\/td>/.test(j));
    assert.ok(j.includes("These 15 lenders unlock once you repair the key items."));
  });

  test("not split and no score: today is unknown too", () => {
    const client = { ...copy(CLIENTS.jordan), scores: {} };
    const out = page(client);
    assert.ok(/Lenders Available<\/td><td[^>]*>-<\/td><td[^>]*>15<\/td>/.test(out));
    assert.ok(!out.includes("No lenders are matched for immediate funding right now"));
  });

  test("a split file keeps the matcher's own count", () => {
    assert.ok(/Lenders Available<\/td><td[^>]*>5<\/td><td[^>]*>15<\/td>/.test(page(CLIENTS["no-limit"])));
  });
});

describe("fix pass 7: 'critical' only at the mapper's CRITICAL line (80%)", () => {
  const lead = (util) => text(between(page({ ...copy(CLIENTS.jordan), util_pct: util }),
    "01 / AVAILABLE NOW", "02 / SHORTLIST"));

  test("academy at 17%: the figure, no verdict", () => {
    const s01 = text(between(page(CLIENTS.academy), "01 / AVAILABLE NOW", "02 / SHORTLIST"));
    assert.ok(s01.includes("And your utilization is at 17%."));
    assert.ok(!s01.includes("critical"));
  });

  test("Jordan at 97% and repair at 98% keep 'that's critical'", () => {
    assert.ok(page(CLIENTS.jordan).includes("And your utilization is at 97% - that's critical."));
    assert.ok(page(CLIENTS.repair).includes("And your utilization is at 98% - that's critical."));
  });

  test("the line sits at 80: 80% is critical, 79% is not", () => {
    assert.ok(lead("80%").includes("And your utilization is at 80% - that's critical."));
    assert.ok(lead("79%").includes("And your utilization is at 79%."));
    assert.ok(!lead("79%").includes("critical"));
  });
});

describe("fix pass 8: 04 explains in sentences instead of repeating the chart", () => {
  // The two tests under "the blocks" pin the words; this one pins it for every file.
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: 04 is five square bullets, no mono capitals line`, () => {
      const s04 = between(page(client), "04 / STRATEGY", "05 / AT A GLANCE");
      assert.equal((s04.match(/<ul class="fh-ul">/g) || []).length, 1);
      assert.equal((s04.match(/<li><b>[^<]+\.<\/b> [^<]+\.<\/li>/g) || []).length, 5);
      assert.ok(!/[A-Z]{4,} [A-Z]{2,} [A-Z]{3,}/.test(text(s04).replace(/\bLLC\b|STRATEGY/g, "")),
        "no line in capitals");
    });
  }
});

describe("gold lender list: page-wide rules", () => {
  for (const [name, client] of Object.entries(CLIENTS)) {
    test(`${name}: booking link, no dead URL, no dash, no NaN, no banned phrase`, () => {
      const html = page(client);
      // This page's only booking link is the closing CTA (owner-set 2026-09-25).
      assert.ok(html.includes(`href="${CLOSING_CTA_URL}"`), "links to the booking page");
      assert.ok(!html.includes("fundhubbookingurl"), "the dead template URL");
      assert.ok(!/[–—]/.test(noStyle(html)), "an em or en dash");
      assert.ok(!/\bNaN\b|\bundefined\b/.test(html), "NaN or undefined");
      assert.ok(!/credit[\s-]*repair/i.test(html), "the banned phrase");
      assert.ok(!/fundhub academy/i.test(html), "an Academy advert");
    });
  }

  test("the Academy sample carries none of Jordan's data", () => {
    const html = page(CLIENTS.academy);
    for (const s of ["Jordan", "SYNCB", "SIGNET BANK", "San Antonio", "Knoll Krest"]) {
      assert.ok(!html.includes(s), s);
    }
  });
});
