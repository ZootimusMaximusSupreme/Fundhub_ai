// DOCUMENT 3 — Capital Partner Shortlist (bank & lender match list).
// Ported from scripts/black-reports/fundhub_gen.py:1208-1303. Four numbered
// sections: available now, shortlist, application order, at a glance.
//
// GOLD LOOK (2026-09-17). With `opts.look === "gold"` the same words are drawn
// the way the gold pack draws them (ops/workflows/gold-deliverables-v5/
// lender_match_list.pdf): the unlock ladder chart in 01, gold lender cards in
// 02, the application order chart in 03, and a fifth numbered section, 04
// STRATEGY, that spells the five order rules out as sentences. At a glance
// moves to 05. Without opts the output is the Python printer's, byte for byte
// (port-parity.test.mjs).
//
// The gold look also stops the page saying what the file does not support
// (fix pass, 2026-09-17): no invented $0 range, no promise of a ladder that is
// not drawn, no "0 open today" on a file that never split its lenders, no
// "critical" on a low utilization, no projection for a score it cannot raise,
// and a personal lender as the first target (rule 5).

import { esc } from "./escape.mjs";
import { usd, median, moneyRange, spaced, parsePct } from "./format.mjs";
import { targetText, heroCard, lenderBuckets } from "./derive.mjs";
import { cover, ctaPage, section, table, PB, isGold } from "./chrome.mjs";
import { svgScoreRuler, svgShotgun } from "./charts.mjs";
import { unlockLadder, applicationOrder } from "./gold-charts.mjs";

const CAT_NOTES = Object.freeze({
  "Personal Loans": "(No business required. These are your fastest path.)",
  "Personal Cards": "(No business required.)",
  "Business Cards": "(Requires LLC or corporation first.)",
  "Business Lines of Credit": "(Requires LLC + revenue documentation.)",
  "Business Term Loans": ""
});

/* The ladder draws a shortlist with more precision than the list has
   (DIAGRAM_SPEC 4.8), so its caption says what a floor is and is not. */
const LADDER_CAP = "YOUR SHORTLIST BY SCORE FLOOR · A FLOOR IS THE MINIMUM, NOT AN APPROVAL";

function firstName(client) {
  const raw = String(client?.applicant || "").trim() || "Client";
  return raw.split(/\s+/)[0];
}

const missing = (v) => v === null || v === undefined || v === "";
/** Gold look: an unknown prints "-", never "" and never 0. */
const shown = (v) => (missing(v) ? "-" : v);

/* The builder's own sentences, held once so both looks print the same words. */
const NONE_TODAY = "No lenders are matched for immediate funding right now.";
const LADDER_PROMISE = "You are not far off. The score ladder below shows exactly how many points "
  + "stand between you and each one.";
const NOT_FAR = "<p>But here's the good news. You are not far off. Weeks, not years.</p>";
const WRONG_ORDER = "The wrong order costs you money and time.";

/* The mapper marks a card CRITICAL at 80% or more (utilStatus() in
   src/underwrite/black-report-client.mjs). The gold look calls the overall
   figure critical on the same line, not on any figure at all. */
const CRITICAL_UTIL = 80;

/* "680-700 projected" is the builder's fixed after-optimization median. The
   gold look prints it only for a known median under 680: for no score it is a
   guess, and for 680 or more it projects no gain or a drop. */
const PROJECTED = "680-700 projected";
const PROJECTED_FROM = 680;

/* Gold look: moneyRange() reads a missing end as 0 (Number(null) is 0), so a
   lender with no range printed "$0K-$0K". A missing end prints "-". */
function goldMoneyRange(lo, hi) {
  if (missing(lo) && missing(hi)) return "-";
  if (!missing(lo) && !missing(hi)) return moneyRange(lo, hi);
  const end = (v) => {
    if (missing(v)) return "-";
    const n = Number(v);
    if (!Number.isFinite(n)) return usd(v);
    return n % 1000 === 0 ? `$${Math.trunc(n / 1000)}K` : usd(n);
  };
  return `${end(lo)} - ${end(hi)}`;
}

const isPersonal = (r) => /^personal/i.test(String(r?.[1] || r?.[2] || ""));
const hasFloor = (r) => !missing(r?.[5]) && Number.isFinite(Number(r[5]));

/* Gold look, rules 2 and 5 together. The first target is the lowest score
   floor among the personal lenders, a lender open today before one that is
   not; a business lender is named only when no personal lender has a floor on
   file. A lender with no floor is never "the lowest" (Number(null) is 0). */
function firstTarget(now, after) {
  const pool = [...now.map((r) => [r, 0]), ...after.map((r) => [r, 1])]
    .filter(([r]) => hasFloor(r));
  const key = ([r, later]) => [isPersonal(r) ? 0 : 1, later, Number(r[5])];
  pool.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return pool.length ? pool[0][0] : null;
}

/* Gold look. A file the matcher never split into lenders_now / lenders_after
   (derive.mjs lenderBuckets(): no split puts every lender in "after") says
   nothing about who is open today. "0 today" holds only when every lender on
   it asks for more than the median; otherwise today's count is unknown. */
function todayUnknown(c, after, medNum) {
  const split = c.lenders_now != null || c.lenders_after != null;
  if (split || !after.length) return false;
  if (!Number.isFinite(medNum)) return true;
  return after.some((r) => !hasFloor(r) || Number(r[5]) <= medNum);
}

/* Gold look: each dollar figure in a card value is set in mono, as the gold
   sheet's rich() did. It runs on already-escaped text; "$", digits, commas and
   "/" pass through esc() unchanged, so nothing escaped is split. */
const MONEY = /(\$[\d,]+(?:\.\d+)?[KM]?\+?(?:\/year|\/month)?)/g;
const monoMoney = (escaped) => escaped.replace(MONEY, '<span class="m">$1</span>');

/** Gold lender card: fundhub_pdf_template.py r_lender(). */
function goldLender(nm, kvs, why) {
  const kvHtml = kvs.map(([k, v]) =>
    `<div class="kv"><span class="k">${esc(spaced(k))}</span>`
    + `<span class="v">${monoMoney(esc(v))}</span></div>`).join("");
  // The matcher's reasons often end in a full stop; the sentence adds its own.
  const reason = String(why ?? "").trim().replace(/\.+$/, "");
  const fit = reason ? `<div class="fit">${esc(nm)} fits you because ${esc(reason)}.</div>` : "";
  return `<div class="lender"><div class="lname">${esc(nm)}</div>`
    + `<div class="kvrow">${kvHtml}</div>${fit}</div>`;
}

export function buildLenderList(client, opts = {}) {
  const gold = isGold(opts);
  const c = client || {};
  const med = median(c.scores || {});
  /* Gold look: median() returns "" for a file with no scores, and Number("")
     is 0, a real-looking score. The gold look reads that as unknown. */
  const medNum = gold && missing(med) ? NaN : Number(med);
  /* F45. The matcher answers in two buckets. This document read only the
     flattened list, so it told every client that nothing was open to him today
     and showed his own available lenders as locked. */
  const [now, after] = lenderBuckets(c);
  const unknownToday = gold && todayUnknown(c, after, medNum);
  const anyLender = now.length + after.length > 0;
  const h = [cover(c, "bank & lender match list", "Capital Partner Shortlist", opts)];

  // the score ladder, worked out first: the gold callout names it only if it is drawn
  const tiers = new Map();
  for (const [nm, , , , , sc] of after) {
    /* scoreLadder() in src/underwrite/black-report-client.mjs:776-789 drops any
       floor at or below the median: a lender the client already clears on score
       is locked by something else, and "+-45 PTS" is not a gap. */
    if (!Number.isFinite(medNum) || !Number.isFinite(Number(sc)) || Number(sc) <= medNum) continue;
    if (!tiers.has(sc)) tiers.set(sc, []);
    tiers.get(sc).push(nm);
  }
  const floors = [...tiers.keys()].sort((a, b) => Number(a) - Number(b));
  const ladder = floors.map((sc) => {
    const names = tiers.get(sc);
    const gap = Number.isFinite(medNum) ? Number(sc) - medNum : "";
    return [
      `<span class="tag solid mono">${esc(sc)}</span>`,
      `<span class="mono small">+${esc(gap)} PTS</span>`,
      `<b>${esc(names.join(", "))}</b>`,
      esc(names.length)
    ];
  });
  let goldLadder = "";
  if (gold) {
    /* The unlock ladder replaces the ruler and the ladder table: it draws both.
       Its tiers are the table's tiers, so a lender the client already clears on
       score is never drawn as UNLOCKED (the rule above). No median or no tier:
       no chart (DIAGRAM_SPEC 6, lender set empty). */
    const chart = unlockLadder(medNum, floors.map((sc) => [sc, tiers.get(sc)]),
      undefined, undefined, LADDER_CAP);
    if (chart) goldLadder = chart;
    else if (ladder.length) {
      goldLadder = table(["score", "gap", "lenders that unlock", "count"], ladder, [3], opts);
    }
  }

  // 01 available now
  h.push(section("01", "available now", "Available Right Now"));
  /* F52. With no reported limit anywhere there is no overall utilization, and
     "your utilization is at - that's critical" is a verdict on a figure the file
     does not have. Gold look: "critical" only at the mapper's CRITICAL line. */
  const critical = !gold || (parsePct(c.util_pct) ?? -1) >= CRITICAL_UTIL;
  const utilLead = c.util_pct
    ? ` And your utilization is at ${esc(c.util_pct)}${critical ? " - that's critical." : "."}`
    : " No open card on this file reports a credit limit above $0, so there is no overall"
      + " utilization figure to read.";
  const experian = gold ? shown(c.scores?.experian) : (c.scores?.experian ?? "");
  const medShown = gold ? shown(med) : med;
  h.push(`<p><b>${esc(firstName(c))}, here's the honest truth.</b></p>
      <p>Your Experian score sits at ${esc(experian)}. Your median score is ${esc(medShown)}.${utilLead}</p>`);
  if (now.length) {
    h.push(table(["lender", "type", "est. range", "score floor"],
      now.map(([nm, cat, typ, lo, hi, sc]) =>
        [esc(nm), esc(typ || cat), esc(gold ? goldMoneyRange(lo, hi) : moneyRange(lo, hi)),
          esc(gold ? shown(sc) : sc)]), [], opts));
    h.push(`<div class="callout bar">${esc(now.length)} lender${now.length === 1 ? " is" : "s are"} `
      + "open to you today. Work them in the order in section 03 - one at a time, lowest score "
      + "floor first.</div>");
  } else if (!gold) {
    h.push(`<div class="callout bar">${NONE_TODAY} ${LADDER_PROMISE}</div>`);
  } else if (!unknownToday) {
    /* Gold look: the ladder sentence only when the ladder is on the page. A
       file that never split its lenders gets no "none today" claim at all. */
    h.push(`<div class="callout bar">${NONE_TODAY}${goldLadder ? ` ${LADDER_PROMISE}` : ""}</div>`);
  }
  const hero = heroCard(c);
  if (hero) {
    h.push("<p>But here's the good news. You are not far off. Fix the utilization on "
      + `${esc(hero[0])} and your score moves fast. Weeks, not years.</p>`);
  } else if (!gold || (Number.isFinite(medNum) && anyLender)) {
    // Gold look: "not far off" needs a score to measure from and a lender to reach.
    h.push(NOT_FAR);
  }

  if (gold) {
    if (goldLadder) h.push(goldLadder);
  } else {
    // The ruler plots the median on a fixed 615-712 axis. With no median there is
    // nothing to plot, and a zero would read as a real score.
    if (Number.isFinite(medNum)) h.push(svgScoreRuler(medNum));
    if (ladder.length) h.push(table(["score", "gap", "lenders that unlock", "count"], ladder, [3]));
  }
  h.push(`<div class="note">${esc(spaced("business products additionally require an llc and time in business"))}</div>`);

  // 02 the shortlist. Gold look: a file with no lender at all has no shortlist
  // to show, and "every lender the matcher knows is already open" would be false.
  if (!gold || anyLender) {
    h.push(PB);
    h.push(section("02", "shortlist", "After Optimization - Your Shortlist"));
  }
  if (after.length) {
    /* Gold look: on a file that never split its lenders, "unlock once you
       repair the key items" is not known to be true. */
    const lead = unknownToday ? ""
      : `These ${esc(after.length)} lenders unlock once you repair the key items. `;
    h.push(`<p>${lead}Here is who fits you and why.</p>`);
  } else if (!gold || now.length) {
    h.push("<p>Nothing on this list is out of reach. Every lender the matcher knows is "
      + "already open to you.</p>");
  }
  const seen = [];
  for (const [nm, cat, typ, lo, hi, sc, tib, rev, why] of after) {
    if (!seen.includes(cat)) {
      seen.push(cat);
      if (gold) {
        const note = CAT_NOTES[cat] || "";
        if (!missing(cat)) h.push(`<h3>${esc(cat)}</h3>`);
        if (note) h.push(`<p class="small">${esc(note)}</p>`);
      } else {
        h.push(`<h3>${esc(cat)}</h3><p class="small">${esc(CAT_NOTES[cat] || "")}</p>`);
      }
    }
    const range = gold && missing(lo) && missing(hi) ? "-" : `${usd(lo)} - ${usd(hi)}`;
    const kvs = [["type", gold ? shown(typ) : typ], ["range", range],
      ["score needed", gold ? shown(sc) : sc]];
    if (tib) kvs.push(["time in business", tib]);
    if (rev) kvs.push(["revenue", rev]);
    const gap = Number.isFinite(medNum) ? Number(sc) - medNum : null;
    if (gap !== null && gap > 0) {
      kvs.push(["you need", `${gap} more points on your median score`]);
    }
    if (gold) {
      h.push(goldLender(nm, kvs, why));
      continue;
    }
    const kvHtml = kvs.map(([k, v]) =>
      `<div class="kv"><span class="k">${esc(spaced(k))}</span>`
      + `<span>${esc(v)}</span></div>`).join("");
    h.push(`<div class="lender"><div class="nm">${esc(nm)}</div>${kvHtml}`
      + `<div class="why">${esc(nm)} fits you because ${esc(why)}.</div></div>`);
  }

  // 03 application order
  h.push(PB);
  h.push(section("03", "application order", "Application Order Warning"));
  h.push("<p>Applying to the wrong lender first can burn hard inquiries AND trigger automatic "
    + "declines that follow you to the next application.</p>");
  /* Each step is [rule, the chart's mono instance, the same words as a
     sentence]. The sentence is what 04 prints in the gold look. */
  let utilLine = "PAY DOWN THE HIGHEST CARD FIRST";
  let utilSentence = "Pay down the highest card first.";
  // heroCard() only returns a card with a known target, so this never ends at
  // "PAY AMEX PLATINUM (NPSL) DOWN TO ".
  if (hero) {
    utilLine = `PAY ${String(hero[0]).toUpperCase()} DOWN TO ${targetText(hero)}`;
    utilSentence = `Pay ${hero[0]} down to ${targetText(hero)}.`;
  }
  let lowest;
  if (gold) {
    lowest = firstTarget(now, after);
  } else {
    lowest = after.length
      ? [...after].sort((a, b) => Number(a[5]) - Number(b[5]))[0]
      : null;
  }
  const lowestLine = lowest
    ? `${String(lowest[0]).toUpperCase()} ASKS FOR ${lowest[5]}. THAT IS YOUR FIRST TARGET`
    : "START WITH THE LOWEST SCORE FLOOR ON THIS LIST";
  const lowestSentence = lowest
    ? `${lowest[0]} asks for ${lowest[5]}. That is your first target.`
    : "Start with the lowest score floor on this list.";
  const order = [
    ["Fix utilization first", utilLine, utilSentence],
    ["Lowest score floor first", lowestLine, lowestSentence],
    ["One at a time", "WAIT FOR THE DECISION", "Wait for the decision."],
    ["Work up the list", "HIGHER-FLOOR LENDERS ONLY AFTER THE SCORE MOVES",
      "Higher-floor lenders only after the score moves."],
    ["Personal before business", "LOCK PERSONAL · THEN FORM THE LLC",
      "Lock personal. Then form the LLC."]
  ];
  /* Gold look: the application order chart draws the numbered path, the crossed
     out shotgun, and two of this section's sentences ("The order protects your
     score. Follow it exactly." and "The same five applications in the wrong
     order get declined."), so the page does not print those two twice. */
  const orderChart = gold ? applicationOrder(order.map(([t, d]) => [t, d])) : "";
  if (orderChart) {
    h.push(orderChart);
  } else {
    h.push("<p><b>The order protects your score. Follow it exactly.</b></p>");
    const stepsHtml = '<div class="steps">' + order.map(([t, d], i) =>
      `<div class="step"><div class="n">${i + 1}</div><div><div class="t">${esc(t)}</div>`
      + `<div class="d">${esc(d)}</div></div></div>`).join("") + "</div>";
    h.push(`<div class="side"><div class="grow">${stepsHtml}</div>`
      + `<div style="width:200px">${svgShotgun()}</div></div>`);
    h.push("<p><b>The same five applications in the wrong order get declined. "
      + `${WRONG_ORDER}</b></p>`);
  }

  /* 04 strategy (gold look only). The gold pack spells the rules out as a
     square-bullet list of sentences under the chart, then closes on one bold
     line. The chart already prints each rule in mono capitals, so this list
     prints the same words as sentences, and the builder's own closing line
     ends the section. No new words, no Academy advert. */
  if (gold) {
    h.push(section("04", "strategy", "The Order, Spelled Out"));
    h.push('<ul class="fh-ul">' + order.map(([t, , s]) =>
      `<li><b>${esc(t)}.</b> ${esc(s)}</li>`).join("") + "</ul>");
    // Without the chart, 03 has already printed this line.
    if (orderChart) h.push(`<p><b>${WRONG_ORDER}</b></p>`);
  }

  // 04 at a glance (05 in the gold look)
  h.push(section(gold ? "05" : "04", "at a glance", "Your Numbers at a Glance"));
  const projected = !gold || (Number.isFinite(medNum) && medNum < PROJECTED_FROM) ? PROJECTED : "-";
  h.push(table(["", "today", "after optimization"], [
    ["Median Score", gold ? shown(med) : med, projected],
    ["Utilization", c.util_pct || "-", "Under 10% target"],
    ["Personal Loan Pre-Approval", usd(c.preapproval_now), usd(c.preapproval_after)],
    // F45. "0" said nobody would lend to this client today. Five would.
    // Gold look: "-" when the file never said who is open today.
    ["Lenders Available", unknownToday ? "-" : now.length, now.length + after.length]
  ].map((r) => r.map(esc)), [], opts));
  h.push(ctaPage(c, opts));
  return h.join("");
}
