// The eleven gold-pack charts (gold-charts.mjs, a port of
// docs/workflows/gold-deliverables-v5/fh_charts.py). Jordan Sample inputs are
// the ones DIAGRAM_SPEC section 4 names, filled in from the gold pack's own
// text layer (docs/workflows/gold-deliverables-v5/compare/gold-*.txt).
// Then one test per DIAGRAM_SPEC section 6 edge case, the escaping, and the
// proportion checks that are cheap without a rasterizer.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  scoreLineup, utilizationTank, severityScale, moneyChain, journeyMap, disputeClock,
  applicationOrder, waterfall, unlockLadder, utilizationBars, timeline
} from "./gold-charts.mjs";

/* ------------------------------------------------ Jordan Sample inputs */

const LINEUP = [
  ["TransUnion", 725, "Nothing negative on it"],
  ["Experian", 630, "1 negative item"],
  ["Equifax", 636, "7 negative items"]
];
const TANK = ["SYNCB/LEVITZ", 1894, 1762, 189, 1573];
// Rail positions are test inputs; the report's own ranking supplies them live.
const SEVERITY = [
  [7, "STUDENT LOANS (x2)", "an error to clean up", 0.04, "a"],
  [5, "SALLIE MAE", "one late payment", 0.2, "b"],
  [6, "JC PENNEY", "old, fading every month", 0.36, "a"],
  [4, "MEDICAL", "small but still a charge-off", 0.52, "b"],
  [3, "CHILD SUPPORT (VT)", "recent and severe", 0.68, "a"],
  [2, "CHILD SUPPORT (CT)", "hurting you every month", 0.82, "b"],
  [1, "SIGNET BANK", "worst item, fix first", 0.96, "a"]
];
const CHAIN = [
  ["STEP 1", "Pay two cards", "$1,573 + $367"],
  ["WHAT CHANGES", "Cards drop under 10%", "utilization falls from 97%"],
  ["WHAT LENDERS SEE", "Score jumps", "+40 to 80 points"],
  ["WHAT YOU GET", "Pre-approval jumps", "$7,936 becomes $19,841"]
];
const CHAIN_HEAD = "How $1,940 of paydown becomes $11,905 more funding.";
const CHAIN_TEACH = "You are not paying to make the debt disappear. You are paying to change what lenders see.";
const JOURNEY = { now: "$7,936", after: "$19,841", rounds: 3, hasCleanBureau: true, outcome: "FUNDING_PLUS_REPAIR" };
const ORDER = [
  ["Fix utilization first", "PAY SYNCB/LEVITZ DOWN TO $189"],
  ["Lowest score floor first", "NAVY FEDERAL AT 650 · KABBAGE AT 640"],
  ["One at a time", "WAIT FOR THE DECISION"],
  ["Work up the list", "CHASE AND AMEX ONLY AT 700+"],
  ["Personal before business", "LOCK PERSONAL · THEN FORM THE LLC"]
];
const WATERFALL = [
  ["Today", "Current pre-approval", 7936, "base"],
  ["Utilization fix", "Pay down two cards", 11905, "gain"],
  ["Projected", "After optimization", 19841, "total"]
];
const LADDER = [
  [640, ["Kabbage (Amex)"]],
  [650, ["Navy Federal Credit Union", "Credibly"]],
  [660, ["Marcus by Goldman Sachs", "OnDeck"]],
  [680, ["Capital One Spark Cash", "Fundbox", "SBA 7(a) Loan"]],
  [700, ["Lending Club", "SoFi", "Chase Sapphire Preferred", "Amex Gold",
    "Chase Ink Preferred", "Amex Blue Business Plus", "Bluevine"]]
];
const BARS = [
  ["SYNCB/LEVITZ", 93, "$1,762 of $1,894 · pay down to $189 or less"],
  ["CITIBANK SD NA", 69, "$429 of $624 · pay down to $62 or less"],
  ["Overall revolving", 97, "$2,430 of $2,518 · pay down to under $252"]
];
const MONTHS = [
  [1, "Launch", "Paydowns · Round 1 disputes · File LLC", null],
  [2, "Results", "Balances report · Dispute results", null],
  [3, "Results", "Round 2 escalation · Goodwill letters", "EX 650-665"],
  [4, "Final push", "Round 3, CFPB · Settlement", null],
  [5, "Business", "EIN, DUNS · Net-30 vendors", "EX 665-680"],
  [6, "Reveal", "Re-pull all three · Reapply", null]
];

// name -> [call, key labels as they appear escaped in the SVG text]
const CHARTS = {
  scoreLineup: [() => scoreLineup(LINEUP), [
    "You do not have one credit score. You have three.", "LENDERS PICK THE MIDDLE SCORE",
    ">636<", ">630<", ">725<", "YOUR MIDDLE SCORE", "LOWEST", "HIGHEST", "EXPERIAN",
    "Yours is 636.", "Your best and worst are 95 points apart."]],
  utilizationTank: [() => utilizationTank(...TANK), [
    "Your SYNCB/LEVITZ card holds $1,894. Right now it is 93% full.", ">TODAY<", ">THE GOAL<",
    ">$1,762<", ">93% FULL<", ">$189<", "PAY DOWN $1,573", "THE SAFE ZONE · UNDER 10%",
    "&#39;I am maxed out.&#39;"]],
  severityScale: [() => severityScale(SEVERITY), [
    "Your 7 negative items are not equally bad.", "HURTS LESS · EASIER TO FIX",
    "HURTS MOST · FIX FIRST", ">SIGNET BANK<", ">STUDENT LOANS (x2)<", ">worst item, fix<", ">first<",
    "Start on the right. SIGNET BANK hurts the most. Fix it first."]],
  moneyChain: [() => moneyChain(CHAIN, CHAIN_HEAD, CHAIN_TEACH), [
    CHAIN_HEAD, CHAIN_TEACH, ">STEP 1<", ">WHAT YOU GET<", ">Pay two cards<", ">$7,936 becomes<",
    ">$19,841<"]],
  journeyMap: [() => journeyMap(JOURNEY), [
    "Your plan runs on two tracks at the same time.", "YOU ARE HERE", "TRACK 1 · FUND NOW",
    "Apply on your clean file", "$7,936 AVAILABLE TODAY", "TRACK 2 · REPAIR", ">ROUND 1<",
    ">ROUND 2<", ">ROUND 3<", ">RE-CHECK<", ">FRESH REPORT<", ">$19,841<", ">BIGGER APPROVALS<",
    "Both tracks run at the same time."]],
  disputeClock: [() => disputeClock(), [
    "Why disputes take rounds, not days.", ">Send letters<", ">The 30 day clock<",
    ">Results come back<", ">Still verified?<", "DELETED = OFF YOUR REPORT", "ROUND 2 · ROUND 3",
    "Three rounds is normal."]],
  applicationOrder: [() => applicationOrder(ORDER), [
    "The order protects your score. Follow it exactly.", ">Fix utilization first<",
    ">PAY SYNCB/LEVITZ DOWN TO $189<", ">Personal before business<", ">THE SHOTGUN<",
    "HARD INQUIRIES · AUTO-DECLINES", "The same five applications in the wrong order get declined.",
    ">5<"]],
  waterfall: [() => waterfall(WATERFALL), [
    ">$7,936<", ">+$11,905<", ">$19,841<", ">TODAY<", ">UTILIZATION FIX<", ">PROJECTED<",
    ">Current pre-approval<", ">Pay down two cards<"]],
  unlockLadder: [() => unlockLadder(636, LADDER), [
    "YOUR MEDIAN SCORE  636", ">+4 PTS<", ">+14 PTS<", ">+64 PTS<", ">Kabbage (Amex)<",
    ">Navy Federal Credit Union, Credibly<", ">7<"]],
  utilizationBars: [() => utilizationBars(BARS), [
    ">SYNCB/LEVITZ<", ">93%<", ">69%<", ">97%<", ">Overall revolving<", "TARGET  10%",
    "$1,762 of $1,894 · pay down to $189 or less"]],
  timeline: [() => timeline(MONTHS, 636, 680, 710), [
    ">636<", ">TODAY<", ">680-710<", ">PROJECTED<", ">MONTH 1<", ">MONTH 6<", ">Launch<",
    ">Reveal<", ">EX 650-665<", ">EX 665-680<", ">Round 3, CFPB<", ">Settlement<"]]
};

/** Widths of the ink fill bars in utilizationBars (height 13, fill ink). */
const inkBars = (svg) => [...svg.matchAll(/<rect x="148\.0" y="[^"]+" width="([\d.]+)" height="13" fill="#0C0C0D"\/>/g)]
  .map((m) => Number(m[1]));

function assertClean(out, name) {
  assert.ok(!/\bNaN\b/.test(out), `${name}: NaN`);
  assert.ok(!/undefined/.test(out), `${name}: undefined`);
  assert.ok(!/Infinity/.test(out), `${name}: Infinity`);
  assert.ok(!/[\u2013\u2014]/.test(out), `${name}: em or en dash`);
  assert.ok(!/credit repair/i.test(out), `${name}: banned phrase`);
}

/* ------------------------------------------------ the eleven, Jordan */

describe("gold charts: each of the eleven, Jordan Sample", () => {
  for (const [name, [call, labels]] of Object.entries(CHARTS)) {
    test(`${name} draws a chart`, () => {
      const out = call();
      assert.ok(out.startsWith('<div class="chart"><svg'), `${name} wrapper`);
      assert.ok(out.endsWith("</svg></div>"), `${name} close`);
    });

    test(`${name} is deterministic`, () => {
      assert.equal(call(), call());
    });

    test(`${name} carries its key labels`, () => {
      const out = call();
      for (const l of labels) assert.ok(out.includes(l), `${name} missing ${l}`);
    });

    test(`${name} prints no NaN, undefined, em dash or en dash`, () => {
      assertClean(call(), name);
    });

    test(`${name} is a web SVG: full width, same viewBox, 508pt cap, labelled`, () => {
      const out = call();
      assert.match(out, /<svg width="100%" viewBox="0 0 508 \d+" style="display:block;width:100%;height:auto;max-width:508pt" xmlns="http:\/\/www\.w3\.org\/2000\/svg" role="img" aria-label="[^"]+">/);
      assert.ok(!/\d+pt" height=/.test(out), `${name} still pins a pt height`);
      assert.ok(out.includes('font-family="JetBrains Mono"'), `${name} mono`);
      assert.ok(out.includes('font-family="Inter"') || name === "unlockLadder" || name === "waterfall",
        `${name} Inter`);
    });
  }

  test("a caption is drawn under the chart and grows the frame by 16", () => {
    const bare = waterfall(WATERFALL);
    const capped = waterfall(WATERFALL, "personal loan pre-approval band · underwriteiq");
    assert.match(bare, /viewBox="0 0 508 210"/);
    assert.match(capped, /viewBox="0 0 508 226"/);
    assert.ok(capped.includes(">personal loan pre-approval band · underwriteiq</text></svg>"));
  });

  test("every chart repeats the same gradient defs, and no other id", () => {
    const defs = new Set();
    for (const [name, [call]] of Object.entries(CHARTS)) {
      const out = call();
      const ids = [...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(ids, ["fhspec"], `${name} ids`);
      defs.add(out.match(/<defs>.*?<\/defs>/)[0]);
    }
    assert.equal(defs.size, 1, "identical <defs> in every chart, so a shared id is harmless");
  });

  test("the gradient is only ever a hairline (2 to 2.4 tall), never a fill", () => {
    for (const [name, [call]] of Object.entries(CHARTS)) {
      const out = call();
      for (const m of out.matchAll(/<rect [^>]*fill="url\(#fhspec\)"\/>/g)) {
        const h = Number((m[0].match(/height="([\d.]+)"/) || [])[1]);
        const w = Number((m[0].match(/width="([\d.]+)"/) || [])[1]);
        assert.ok((h >= 2 && h <= 2.4) || (w === 2), `${name}: ${m[0]}`);
      }
    }
  });
});

/* ------------------------------------------------ proportions */

describe("gold charts: bars measure what they say", () => {
  test("utilizationBars fill width / track width equals pct within 1%", () => {
    const widths = inkBars(utilizationBars(BARS));
    assert.equal(widths.length, 3);
    [93, 69, 97].forEach((pct, i) => {
      assert.ok(Math.abs(widths[i] / 314 - pct / 100) < 0.01, `${pct}% drew ${widths[i]}`);
    });
  });

  test("waterfall: base bar / total bar equals 7,936 / 19,841 within 1%", () => {
    const out = waterfall(WATERFALL);
    const ink = [...out.matchAll(/<rect [^>]*height="([\d.]+)" fill="#0C0C0D"\/>/g)].map((m) => Number(m[1]));
    assert.equal(ink.length, 2);
    assert.ok(Math.abs(ink[0] / ink[1] - 7936 / 19841) < 0.01, `${ink[0]} / ${ink[1]}`);
    const gain = Number(out.match(/<rect [^>]*height="([\d.]+)" fill="#F2F2F4"/)[1]);
    assert.ok(Math.abs(gain / ink[1] - 11905 / 19841) < 0.01, `gain ${gain}`);
  });

  test("utilizationTank: today's fill is 93% of the tank, the goal 10%", () => {
    const out = utilizationTank(...TANK);
    const fills = [...out.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="94\.6" height="([\d.]+)" fill="#0C0C0D"\/>/g)]
      .map((m) => Number(m[2]) + 0.7);
    assert.equal(fills.length, 2);
    assert.ok(Math.abs(fills[0] / 168 - 1762 / 1894) < 0.01, `today ${fills[0]}`);
    assert.ok(Math.abs(fills[1] / 168 - 189 / 1894) < 0.01, `goal ${fills[1]}`);
  });

  test("Python number formatting: an exact .x5 tie rounds half to even, as \"%.1f\" did", () => {
    // target 12.5% puts the dashed line at 148 + 314 * 0.125 = 187.25 exactly.
    // Python prints 187.2; JavaScript's toFixed(1) would print 187.3.
    const out = utilizationBars([["A", 50, "d"]], 12.5);
    assert.ok(out.includes('<line x1="187.2" y1="12.0" x2="187.2"'));
    assert.ok(out.includes(">TARGET  12.5%<"));
  });
});

/* ------------------------------------------------ section 6 edge cases */

describe("gold charts: DIAGRAM_SPEC section 6 edge cases", () => {
  test("projected <= current: waterfall suppresses itself", () => {
    const flat = [["Today", "", 7936, "base"], ["Projected", "", 7936, "total"]];
    const down = [["Today", "", 9000, "base"], ["Projected", "", 7936, "total"]];
    assert.equal(waterfall(flat), "");
    assert.equal(waterfall(down), "");
  });

  test("waterfall with no total step, or a missing value, is not drawn", () => {
    assert.equal(waterfall([["Today", "", 7936, "base"]]), "");
    assert.equal(waterfall([["Today", "", null, "base"], ["Projected", "", 19841, "total"]]), "");
    assert.equal(waterfall([["Today", "", NaN, "base"], ["Projected", "", 19841, "total"]]), "");
    assert.equal(waterfall([]), "");
  });

  test("moneyChain: the caller suppresses it; with fewer than 2 or too many panels it draws nothing", () => {
    assert.equal(moneyChain([CHAIN[0]], CHAIN_HEAD, CHAIN_TEACH), "");
    assert.equal(moneyChain([...CHAIN, ["X", "Y", "Z"]], CHAIN_HEAD, CHAIN_TEACH), "");
    assert.ok(moneyChain(CHAIN.slice(0, 3), CHAIN_HEAD, CHAIN_TEACH).startsWith('<div class="chart">'));
  });

  test("no clean bureau: journeyMap suppresses Track 1, never draws it empty", () => {
    const out = journeyMap({ ...JOURNEY, hasCleanBureau: false });
    assert.ok(out.startsWith('<div class="chart"><svg'));
    for (const gone of ["TRACK 1", "FUND NOW", "Apply on your clean file", "AVAILABLE TODAY",
      "two tracks", "Both tracks", "TRACK 2"]) {
      assert.ok(!out.includes(gone), `still says ${gone}`);
    }
    for (const kept of ["Your plan starts with repair.", "REPAIR FIRST", ">ROUND 1<", ">ROUND 3<",
      ">RE-CHECK<", "Repair comes first on this file."]) {
      assert.ok(out.includes(kept), `missing ${kept}`);
    }
    assertClean(out, "journeyMap repair-only");
  });

  test("outcome REPAIR_ONLY also suppresses Track 1, even if a bureau is flagged clean", () => {
    const out = journeyMap({ ...JOURNEY, outcome: "REPAIR_ONLY" });
    assert.ok(!out.includes("TRACK 1"));
    assert.ok(out.includes("REPAIR FIRST"));
  });

  test("journeyMap draws no bigger-number box it cannot back", () => {
    for (const after of [null, "$5,000", "$7,936", "-", "$19,841+"]) {
      const out = journeyMap({ ...JOURNEY, after });
      assert.ok(!out.includes("BIGGER APPROVALS"), `after=${after}`);
      assert.ok(out.includes(">RE-CHECK<"), `after=${after}`);
      assert.ok(!out.includes('x="436"'), `after=${after}: destination box`);
    }
  });

  test("journeyMap: a missing current amount prints '-', never $0, and claims nothing bigger", () => {
    const out = journeyMap({ ...JOURNEY, now: null });
    assert.ok(out.includes(">- AVAILABLE TODAY<"));
    assert.ok(!out.includes("$0"));
    assert.ok(!out.includes("BIGGER APPROVALS"));
  });

  test("journeyMap rounds: 1 to 4 drawn exactly; 0, 5 or not a whole number draws nothing", () => {
    const two = journeyMap({ ...JOURNEY, rounds: 2 });
    assert.ok(two.includes(">ROUND 2<") && !two.includes(">ROUND 3<"));
    const four = journeyMap({ ...JOURNEY, rounds: 4 });
    assert.ok(four.includes(">ROUND 4<"));
    assert.equal(journeyMap({ ...JOURNEY, rounds: 0 }), "");
    assert.equal(journeyMap({ ...JOURNEY, rounds: 5 }), "");
    assert.equal(journeyMap({ ...JOURNEY, rounds: 2.5 }), "");
    assert.equal(journeyMap({ ...JOURNEY, rounds: null }), "");
  });

  test("lender set empty: unlockLadder suppresses itself", () => {
    assert.equal(unlockLadder(636, []), "");
    assert.equal(unlockLadder(636, [[650, []], [700, [""]]]), "");
    assert.equal(unlockLadder(null, LADDER), "");
    assert.equal(unlockLadder(636, [[null, ["A"]]]), "");
  });

  test("current score above every tier: draw, every row UNLOCKED", () => {
    const out = unlockLadder(760, LADDER);
    assert.ok(out.startsWith('<div class="chart">'));
    assert.equal((out.match(/>UNLOCKED</g) || []).length, 5);
    assert.ok(!out.includes("PTS"));
  });

  test("tier threshold outside lo/hi: the rail widens so every tick and the marker sit on it", () => {
    const out = unlockLadder(600, [[590, ["Low Floor Bank"]], [730, ["High Floor Bank"]]]);
    const xs = [...out.matchAll(/<line x1="([\d.-]+)" y1="39\.0" x2="[\d.-]+" y2="52\.0"/g)].map((m) => Number(m[1]));
    assert.equal(xs.length, 2);
    for (const x of xs) assert.ok(x >= 26 && x <= 496, `tick at ${x}`);
    const fill = Number(out.match(/<rect x="26\.0" y="44\.0" width="([\d.-]+)" height="2\.4" fill="#0C0C0D"\/>/)[1]);
    assert.ok(fill >= 0 && fill <= 470, `marker fill ${fill}`);
    assert.ok(out.includes(">+130 PTS<") && out.includes(">UNLOCKED<"));
  });

  test("no revolving card with a known limit: utilizationTank and utilizationBars suppress", () => {
    for (const lim of [null, undefined, 0, -5, NaN, "Unknown", Infinity]) {
      assert.equal(utilizationTank("BENEFICIAL", lim, 239, 24, 215), "", `limit ${lim}`);
    }
    assert.equal(utilizationTank("BENEFICIAL", 1000, null, 100, 200), "");
    assert.equal(utilizationTank("BENEFICIAL", 1000, 900, null, 800), "");
    assert.equal(utilizationBars([["BENEFICIAL", null, "Unknown limit"]]), "");
    assert.equal(utilizationBars([]), "");
  });

  test("a card with an unknown limit is left out of the bars; the rest still draw", () => {
    const out = utilizationBars([BARS[0], ["BENEFICIAL", null, "limit unknown"], BARS[1]]);
    assert.ok(!out.includes("BENEFICIAL"));
    assert.equal(inkBars(out).length, 2);
  });

  test("single card only: one bar, no aggregate row invented", () => {
    const out = utilizationBars([BARS[0]]);
    assert.equal(inkBars(out).length, 1);
    assert.ok(!out.includes("Overall"));
  });

  test("utilization above 100%: fill clamps at 100%, the printed percent stays true", () => {
    const bars = utilizationBars([["MAXED CARD", 104.3, "$1,043 of $1,000"]]);
    assert.deepEqual(inkBars(bars), [314]);
    assert.ok(bars.includes(">104.3%<"));

    const tank = utilizationTank("MAXED CARD", 1000, 1100, 100, 1000);
    assert.ok(tank.includes("Right now it is 110% full."));
    assert.ok(tank.includes(">110% FULL<"));
    // clamped: the fill starts at the tank's top (46) and stops at its floor
    assert.ok(tank.includes('<rect x="40.7" y="46.0" width="94.6" height="167.3" fill="#0C0C0D"/>'));
  });

  test("fewer than 3 negative items: severityScale suppresses", () => {
    assert.equal(severityScale(SEVERITY.slice(0, 2)), "");
    assert.equal(severityScale([]), "");
    assert.equal(severityScale([...SEVERITY.slice(0, 2), [3, "X", "y", null, "a"]]), "");
  });

  test("severityScale says this file's count and worst item, not Jordan's", () => {
    const out = severityScale([
      [1, "ACME COLLECTIONS", "worst item", 0.9, "a"],
      [2, "BETA BANK", "one late", 0.5, "b"],
      [3, "GAMMA", "paperwork error", 0.1, "a"]
    ]);
    assert.ok(out.includes("Your 3 negative items are not equally bad."));
    assert.ok(out.includes("Start on the right. ACME COLLECTIONS hurts the most. Fix it first."));
    assert.ok(!out.includes("SIGNET"));
    assert.ok(!out.includes("7 negative"));
  });

  test("no stated month-6 range: timeline suppresses", () => {
    assert.equal(timeline(MONTHS, 636, null, 710), "");
    assert.equal(timeline(MONTHS, 636, 680, NaN), "");
    assert.equal(timeline(MONTHS, 636, 680, undefined), "");
    assert.equal(timeline(MONTHS, null, 680, 710), "");
    assert.equal(timeline(MONTHS, 636, 710, 680), "");
    assert.equal(timeline([], 636, 680, 710), "");
  });

  test("any figure that would be invented: suppress (score lineup without three scores)", () => {
    assert.equal(scoreLineup(LINEUP.slice(0, 2)), "");
    assert.equal(scoreLineup([LINEUP[0], LINEUP[1], ["Equifax", null, "no score"]]), "");
    assert.equal(scoreLineup([LINEUP[0], LINEUP[1], ["Equifax", "", "no score"]]), "");
  });

  test("a missing table number prints '-', never an invented number", () => {
    const out = severityScale([[null, "A", "a", 0.1, "a"], [2, "B", "b", 0.5, "b"], [3, "C", "c", 0.9, "a"]]);
    assert.ok(out.includes('fill="#FFFFFF" text-anchor="middle" letter-spacing="0">-</text>'));
  });
});

/* ------------------------------------------------ escaping and banned text */

describe("gold charts: caller text is escaped and kept clean", () => {
  const EVIL = '<script>alert("x")</script>';

  test("a creditor name with <script> is escaped, never live markup", () => {
    const outs = [
      utilizationBars([[EVIL, 50, EVIL]]),
      utilizationTank(EVIL, 1000, 900, 100, 800),
      unlockLadder(636, [[650, [EVIL]]]),
      severityScale([[1, EVIL, EVIL, 0.9, "a"], [2, "B", "b", 0.5, "b"], [3, "C", "c", 0.1, "a"]]),
      scoreLineup([[EVIL, 700, EVIL], LINEUP[1], LINEUP[2]]),
      applicationOrder([[EVIL, EVIL], ORDER[1]]),
      moneyChain([[EVIL, EVIL, EVIL], CHAIN[1]], EVIL, EVIL),
      waterfall([[EVIL, EVIL, 1, "base"], ["P", "", 2, "total"]]),
      // the range sits on the last column, which must be month 6
      timeline([[1, EVIL, EVIL, EVIL], [6, "b", "c", null]], 636, 680, 710),
      journeyMap({ ...JOURNEY, now: EVIL }),
      waterfall(WATERFALL, EVIL)
    ];
    outs.forEach((out, i) => {
      assert.ok(out.length > 0, `chart ${i} drew`);
      assert.ok(!out.includes("<script"), `chart ${i} has live markup`);
      assert.ok(out.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
        || out.includes("&lt;SCRIPT&gt;ALERT(&quot;X&quot;)&lt;/SCRIPT&gt;"), `chart ${i} escape`);
    });
  });

  test("an em or en dash in caller text becomes a hyphen", () => {
    const out = moneyChain(CHAIN, "From $7,936 \u2014 to $19,841", "Months 1\u20133");
    assert.ok(out.includes("From $7,936 - to $19,841"));
    assert.ok(out.includes("Months 1-3"));
    assertClean(out, "moneyChain dashes");
  });

  test("the banned phrase never reaches the page", () => {
    const out = moneyChain(CHAIN, "credit repair plan", CHAIN_TEACH);
    assert.ok(!/credit repair/i.test(out));
  });

  test("a NaN slipped into caller text never reaches the page", () => {
    assert.ok(!/NaN/.test(moneyChain(CHAIN, "$NaN", CHAIN_TEACH)));
    assert.ok(!/undefined/.test(applicationOrder([["undefined", "x"], ORDER[1]])));
  });
});

/* ------------------------------------------------ checker findings, 2026-09-17 */

describe("gold charts: regressions from the independent check", () => {
  /** The visible text of a chart: tags out, whitespace collapsed. */
  const shown = (svg) => svg.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

  test("timeline: inside 620-720 the axis is the Python's fixed one; outside it widens and stays in the band", () => {
    // 636 / 680-710 is the gold input: the Python's exact coordinates.
    const gold = timeline(MONTHS, 636, 680, 710);
    assert.ok(gold.includes('<polygon points="42.3,110.6 465.7,39.6 465.7,68.4" fill="#F2F2F4"/>'));
    assert.ok(gold.includes('<circle cx="42.3" cy="110.6" r="3.1"'));
    // 598 is under 620. The Python drew the TODAY dot at y=147.1, below the
    // month rail (y=142) and in among the month labels. Here it stays in the band.
    const low = timeline(MONTHS, 598, 680, 710);
    const pts = low.match(/<polygon points="([^"]+)" fill="#F2F2F4"\/>/)[1]
      .split(" ").map((p) => Number(p.split(",")[1]));
    for (const y of pts) assert.ok(y >= 30 && y <= 126, `band point at y=${y}`);
    const cy = Number(low.match(/<circle cx="42\.3" cy="([\d.]+)" r="3\.1"/)[1]);
    assert.ok(cy < 142, `TODAY dot at ${cy} is on or under the month rail`);
    assert.ok(low.includes(">598<"));
    // and above 720
    const high = timeline(MONTHS, 700, 730, 745);
    for (const p of high.match(/<polygon points="([^"]+)"/)[1].split(" ")) {
      const y = Number(p.split(",")[1]);
      assert.ok(y >= 30 && y <= 126, `band point at y=${y}`);
    }
  });

  test("journeyMap(null) or a non-object is no journey record: \"\", never a throw", () => {
    assert.doesNotThrow(() => journeyMap(null));
    assert.equal(journeyMap(null), "");
    assert.equal(journeyMap(null, "cap"), "");
    assert.equal(journeyMap("FUNDING_PLUS_REPAIR"), "");
    assert.equal(journeyMap(7936), "");
    assert.equal(journeyMap([]), "");
  });

  test("waterfall: the running total may never pass the total (spec 4.8, total is the largest)", () => {
    // a gain larger than the total: the bar started at y=-95.5, above the frame
    assert.equal(waterfall([["Today", "s", 7936, "base"], ["Fix", "s", 30000, "gain"],
      ["Projected", "s", 19841, "total"]]), "");
    // a gain smaller than the total whose running sum ($22,936) still beats it
    assert.equal(waterfall([["Today", "s", 7936, "base"], ["Fix", "s", 15000, "gain"],
      ["Projected", "s", 19841, "total"]]), "");
    // an unknown kind taller than the total is caught too
    assert.equal(waterfall([["Today", "s", 7936, "base"], ["Other", "s", 25000, "other"],
      ["Projected", "s", 19841, "total"]]), "");
    // exact sums still draw, float noise included (0.1 + 0.2 is 0.30000000000000004)
    assert.ok(waterfall(WATERFALL).startsWith('<div class="chart">'));
    assert.ok(waterfall([["A", "", 0.1, "base"], ["B", "", 0.2, "gain"], ["C", "", 0.3, "total"]])
      .startsWith('<div class="chart">'));
    // no bar is ever drawn above the frame
    for (const m of waterfall(WATERFALL).matchAll(/<rect [^>]*y="(-?[\d.]+)"/g)) {
      assert.ok(Number(m[1]) >= 0, `bar at y=${m[1]}`);
    }
  });

  test("timeline: the month-6 range is drawn only on a month-6 column", () => {
    const three = [[1, "Launch", "a", null], [2, "Results", "b", null], [3, "Results", "c", null]];
    assert.equal(timeline(three, 636, 680, 710), "");
    assert.equal(timeline([...MONTHS, [7, "Extra", "x", null]], 636, 680, 710), "");
    assert.equal(timeline([[1, "A", "a", null], ["month 6", "B", "b", null]], 636, 680, 710), "");
    assert.ok(timeline([[1, "A", "a", null], ["6", "B", "b", null]], 636, 680, 710)
      .startsWith('<div class="chart">'));
    assert.ok(timeline(MONTHS, 636, 680, 710).startsWith('<div class="chart">'));
  });

  test("journeyMap: $0 today is an empty FUND NOW track, so Track 1 is not drawn", () => {
    for (const now of [0, "$0", "$0.00", "0", -5]) {
      const out = journeyMap({ ...JOURNEY, now });
      assert.ok(out.startsWith('<div class="chart">'), `now=${now} drew`);
      for (const gone of ["TRACK 1", "FUND NOW", "Apply on your clean file", "AVAILABLE TODAY",
        "two tracks", "TRACK 2"]) {
        assert.ok(!out.includes(gone), `now=${now}: still says ${gone}`);
      }
      assert.ok(out.includes("REPAIR FIRST") && out.includes("Your plan starts with repair."), `now=${now}`);
    }
    // unknown is not zero: the track stays and says "-", the house mark for unknown
    const unknown = journeyMap({ ...JOURNEY, now: null });
    assert.ok(unknown.includes("TRACK 1 · FUND NOW") && unknown.includes(">- AVAILABLE TODAY<"));
  });

  test("the banned phrase is caught however it is spaced, hyphenated or wrapped", () => {
    const ch = (c) => String.fromCharCode(c);
    const variants = [
      "Our credit  repair plan", "Our credit\nrepair plan", "Our credit\trepair plan",
      `Our credit${ch(0xA0)}repair plan`, "Our credit-repair plan", "Our CREDIT - REPAIR plan",
      `Our credit${ch(0xAD)}repair plan`, `Our credit${ch(0x200B)}repair plan`,
      `Our credit${ch(0x2011)}repair plan`, "Our creditrepair plan"
    ];
    for (const h of variants) {
      assert.equal(moneyChain(CHAIN, h, CHAIN_TEACH), "", JSON.stringify(h));
    }
    assert.equal(utilizationTank("CREDIT-REPAIR CO", 1000, 900, 100, 800), "");
    // wrapped onto two lines: "Our credit" and "repair" are two <text> elements
    const wrapped = [["S", "Our credit repair", "b"], ["T", "c", "d"]];
    assert.equal(moneyChain(wrapped, "h", "t"), "");
    // the words apart are fine
    const ok = moneyChain(CHAIN, "Pay the credit card. Repair the file.", CHAIN_TEACH);
    assert.ok(ok.startsWith('<div class="chart">'));
  });

  test("moneyChain refuses a panel that says the money goes down or stays flat", () => {
    const down = [["STEP 1", "Pay two cards", "$1,573"],
      ["WHAT YOU GET", "Pre-approval drops", "$19,841 becomes $7,936"]];
    assert.equal(moneyChain(down, "h", "t"), "");
    const flat = [["STEP 1", "Pay two cards", "$1,573"],
      ["WHAT YOU GET", "Pre-approval", "$7,936 becomes $7,936"]];
    assert.equal(moneyChain(flat, "h", "t"), "");
    // up still draws (the gold chain ends "$7,936 becomes $19,841")
    assert.ok(moneyChain(CHAIN, CHAIN_HEAD, CHAIN_TEACH).startsWith('<div class="chart">'));
  });

  test("utilizationTank prints whole dollars, never float noise, and refuses figures that do not add up", () => {
    const cents = utilizationTank("X", 1894.5, 1762.35, 189.45, 1762.35 - 189.45);
    const text = shown(cents);
    assert.ok(text.includes("Your X card holds $1,894. Right now it is 93% full."), text);
    assert.ok(text.includes(" $1,762 ") && text.includes(" $189 ") && text.includes("PAY DOWN $1,572"), text);
    assert.ok(!/\d\.\d/.test(text.replace(/[\d.]+%/g, "")), `a decimal dollar printed: ${text}`);
    // a computed 10% target and its paydown
    const tenth = shown(utilizationTank("X", 1894, 1762, 1894 * 0.1, 1762 - 1894 * 0.1));
    assert.ok(tenth.includes(" $189 ") && tenth.includes("PAY DOWN $1,572") && !tenth.includes("$189.4"), tenth);
    // pay is balance - target (spec 4.2); anything else contradicts the picture
    assert.equal(utilizationTank("X", 1894, 1762, 189, 9999), "");
    assert.equal(utilizationTank("X", 1894, 1762, 189, 1000), "");
    // the balance is already under (or at) the target: nothing to pay down
    assert.equal(utilizationTank("X", 1000, 50, 100, 25), "");
    assert.equal(utilizationTank("X", 1000, 100, 100, 1), "");
    // a caller that rounded pay to the dollar still draws
    assert.ok(utilizationTank("X", 1894, 1762, 189.4, 1573).startsWith('<div class="chart">'));
  });

  test("a computed percent or score prints at most one decimal, on the page and in the label", () => {
    const bars = utilizationBars([["SYNCB/LEVITZ", 1762 / 1894 * 100, "x"]]);
    assert.ok(bars.includes(">93%<"));
    assert.ok(bars.includes('aria-label="Utilization by card: SYNCB/LEVITZ 93%. Target 10%"'));
    assert.ok(utilizationBars([["A", 50, "d"]], 10 / 3).includes(">TARGET  3.3%<"));
    const ladder = unlockLadder(636.123456789, [[640.26, ["K"]]]);
    assert.ok(ladder.includes(">YOUR MEDIAN SCORE  636.1<"));
    assert.ok(ladder.includes("your median score 636.1,"));
    assert.ok(ladder.includes(">640.3<") && !ladder.includes("640.26"));
    const tl = timeline([[1, "A", "b", null], [6, "B", "c", null]], 636.33333333, 680.1, 710.2);
    assert.ok(tl.includes(">636.3<") && tl.includes(">680.1-710.2<"));
    assert.ok(tl.includes('aria-label="Score timeline: 636.3 today, 680.1-710.2 projected"'));
    for (const out of [bars, ladder, tl]) assert.ok(!/\d\.\d{2,}(?=[%<"])/.test(shown(out) + out.match(/aria-label="[^"]*"/)[0]));
  });
});
