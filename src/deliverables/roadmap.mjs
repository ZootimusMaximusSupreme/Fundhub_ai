// DOCUMENT 4 — 6-Month Business Readiness Roadmap (optimization roadmap).
// Ported from scripts/black-reports/fundhub_gen.py:1309-1574. Nine numbered
// sections: projection, month 1, months 2-3, month 4, month 5, month 6,
// transformation, checklist, call to action.
//
// TWO LOOKS, ONE SET OF WORDS (2026-09-17). buildRoadmap(client) with no opts
// prints the fundhub_gen.py markup byte for byte (port-parity.test.mjs pins it).
// buildRoadmap(client, { look: "gold" }) draws the gold pack
// (docs/workflows/gold-deliverables-v5/optimization_roadmap.pdf): the gold
// cover and closing panel, the timeline and dispute-clock charts, a card per
// revolving card that has a balance to pay, gold lists, callouts and tables.
// Every sentence the old look prints, the gold look prints too. The gold look
// adds only plain sub-headings and lists built from this client's own file;
// it never adds a number, a lender or a promise the file does not carry.

import { esc } from "./escape.mjs";
import { usd, median, spaced, parseMoney } from "./format.mjs";
import { rankedRevolving, targetText, paydownAmt, bureauStatus, heroCard, fastestWins,
  lenderBuckets, utilTotalsKnown, cardsWithNoTarget, openRevolving, noTargetCell,
  noTargetCellCap, noTargetReason, fileFactSentences, holdingYouBack,
  payDownCardsLine, plainRating } from "./derive.mjs";
import { cover, ctaPage, section, table, PB, isGold, BOOK_CALL_URL } from "./chrome.mjs";
import { svgProjection, svgDisputeFlow } from "./charts.mjs";
import { timeline, disputeClock } from "./gold-charts.mjs";

/**
 * The month strip. `body` carries literal <br> markup, so it is a module
 * literal and goes in raw — nothing from a client reaches it.
 */
const MONTHS = Object.freeze([
  ["month 1", "Launch", "Paydowns<br>Round 1 disputes<br>File LLC", ""],
  ["month 2", "Results", "Balances report<br>Dispute results", ""],
  ["month 3", "Results", "Round 2 escalation<br>Goodwill letters", "EX 650-665"],
  ["month 4", "Final push", "Round 3, CFPB<br>Settlement", ""],
  ["month 5", "Business", "EIN, DUNS<br>Net-30 vendors", "EX 665-680"],
  ["month 6", "Reveal", "Re-pull all three<br>Reapply", ""]
]);

/**
 * The old look's month-6 median range: printed in its 07 table and labelling
 * its projection chart. It is the Jordan Sample's figure, so a gold page never
 * prints it; gold reads the file's own `score_targets.median` instead.
 */
const PROJECTED_MEDIAN = "680-710";

function firstName(client) {
  const raw = String(client?.applicant || "").trim() || "Client";
  return raw.split(/\s+/)[0];
}

/* ------------------------------------------------------------ gold look -- */

/** A month's quote: the gold mono line with curly marks, or the old one. */
function monthQuote(text, gold) {
  return gold
    ? `<div class="mquote">&#8220;${text}&#8221;</div>`
    : `<p class="mono small">"${text}"</p>`;
}

/**
 * Where client.booking_url was printed, a gold page links the booking page
 * instead. The Jordan fixture's booking_url is a dead template address.
 */
function bookLink() {
  return `<a href="${esc(BOOK_CALL_URL)}">`
    + `${esc(BOOK_CALL_URL.replace(/^https:\/\//, ""))}</a>`;
}

/**
 * The gold timeline (DIAGRAM_SPEC 4.11): today's median to the month-6 range
 * THIS FILE states (`score_targets.median`, the same field the 01 table prints),
 * drawn on the same six months as the old month strip.
 *
 * Suppressed (DIAGRAM_SPEC section 6, "no stated month 6 range") when the file
 * states no range, when there is no median to start from, and when the median
 * is already at or above the bottom of the stated range: the band would then
 * show a score that may fall, which is not what the plan projects.
 *
 * No month carries a note. MONTHS holds "EX 650-665" and "EX 665-680" for the
 * old look; they are the Jordan Sample's Experian projections, on no file, and
 * the spec says months 2 through 5 carry no value because the roadmap states
 * none. A gold page prints neither, in the chart or in the strip.
 */
function goldTimeline(med, stated) {
  const range = /(\d{3})\s*-\s*(\d{3})/.exec(String(stated || ""));
  if (!range) return "";
  const [lo, hi] = [Number(range[1]), Number(range[2])];
  if (typeof med !== "number" || !Number.isFinite(med) || med >= lo) return "";
  const months = MONTHS.map(([k, t, b]) =>
    [Number(k.replace(/\D/g, "")), t, b.split("<br>").join(" · "), null]);
  return timeline(months, med, lo, hi);
}

/**
 * ONE ROW PER ACCOUNT (F43, src/underwrite/black-report-client.mjs). A
 * tri-merge file lists each card once per bureau that reports it, so a gold
 * page printed one real card as two or three cards, three table rows and three
 * checklist lines, and the paydown total counted it three times (repair:
 * $16,230 for $6,160 of real balances). Rows merge only when every column but
 * the bureau matches and the bureau is new to the group; the kept row names
 * every bureau that reports it. Two identical rows on the SAME bureau are two
 * accounts and stay two.
 *
 * Not the same rule as oneRowPerAccount() in funding-snapshot.mjs, which only
 * drops exact repeats: this one merges bureau copies and names every bureau.
 */
export function oneRowPerAccount(rows) {
  const out = [];
  const groups = new Map();
  for (const r of rows || []) {
    if (!Array.isArray(r)) { out.push(r); continue; }
    const key = JSON.stringify(r.filter((_, i) => i !== 1));
    const bureau = String(r[1] || "");
    const list = groups.get(key) || [];
    const into = bureau ? list.find((g) => !g.bureaus.includes(bureau)) : null;
    if (into) {
      into.bureaus.push(bureau);
      into.row[1] = into.bureaus.join(", ");
      continue;
    }
    const row = [...r];
    list.push({ row, bureaus: bureau ? [bureau] : [] });
    groups.set(key, list);
    out.push(row);
  }
  return out;
}

/** A bureau's negative count from its own row, or null when the file has no row for it. */
function bureauCount(client, label) {
  const row = (client?.bureaus || []).find((r) =>
    Array.isArray(r) && String(r[0] || "").toLowerCase() === label.toLowerCase());
  return row ? row[2] : null;
}

/** A whole-value number, dollar amount, percent or "-": set in mono. */
const NUMERIC = /^(?:-|\$?\d[\d,]*(?:\.\d+)?%?)$/;

/**
 * One card per open revolving account with a balance to pay (gold page 4).
 * Every figure is the same one the paydown table prints; a card with no 10%
 * target says why in the shared words, and prints "-" where the table does.
 */
function paydownCards(c) {
  const rows = rankedRevolving(c).filter((row) =>
    row[6] !== "CLOSED" && (parseMoney(row[2]) || 0) > 0);
  return rows.map((row) => {
    const tgt = targetText(row);
    const pd = paydownAmt(row);
    const kv = [
      ["bureau", row[1] || "-"],
      ["balance", usd(row[2])],
      ["limit", usd(row[3])],
      ["utilization", row[4] || "-"],
      ["pay down to", tgt !== null ? tgt : "-"],
      ["amount to pay", pd !== null ? usd(pd) : "-"]
    ].map(([k, v]) => {
      const val = String(v ?? "-");
      return `<div class="kv"><span class="k">${esc(spaced(k))}</span>`
        + `<span class="v${NUMERIC.test(val) ? " m" : ""}">${esc(val)}</span></div>`;
    }).join("");
    const why = tgt === null
      ? `<ul class="fh-ul" style="margin-top:6pt"><li>${esc(noTargetReason(row))}, `
        + "so there is no 10% target to pay down to.</li></ul>"
      : "";
    return `<div class="card4"><div class="c4t">${esc(row[0])}</div>${kv}${why}</div>`;
  }).join("");
}

/** Honest empty on a gold table: a cell the file leaves blank reads "-". */
const dash = (v) => (v === null || v === undefined || v === "" ? "-" : v);

/** The Month 2 checklist items. Section 03 lists them too on a gold page. */
function month2Items(hero) {
  const month2 = ["Check dispute results (30-45 days after sending)",
    "Document every deletion and every verification"];
  if (hero) month2.push(`Keep ${hero[0]} balance low`);
  return month2;
}

// What this client actually has, read off their own file. This paragraph used to
// assert a mortgage, paid-off auto loans and a clean TransUnion for everybody,
// which was false for anyone who had none of them. Say nothing rather than guess.
export function buildRoadmap(client, opts = {}) {
  const gold = isGold(opts);
  const c = client || {};
  /* Everything this page says about revolving cards reads `cv`: on a gold page
     one row per real account, on the old page the file as it is (its bytes are
     pinned by port-parity). */
  const cv = gold ? { ...c, revolving: oneRowPerAccount(c.revolving) } : c;
  const med = median(c.scores || {});
  const now = Number(c.preapproval_now);
  const after = Number(c.preapproval_after);
  const delta = Number.isFinite(now) && Number.isFinite(after) ? after - now : null;
  const first = firstName(c);
  const negatives = c.negatives || [];
  const h = [cover(c, "credit optimization roadmap",
    `${first}'s 6-Month Business Readiness Roadmap`, opts)];

  /* F53. This paragraph used to assert a mortgage, paid-off auto loans and a
     clean TransUnion for EVERY client, whatever the file said. It now says only
     what this file carries, and on a file that carries none of it, it says that
     instead of inventing something. */
  const facts = fileFactSentences(c);
  const factsTxt = facts.length
    ? `${facts.join(" ")} You are not starting from zero.`
    : "There is not much on this file yet, and that is the starting point we work from.";
  h.push((gold
    ? '<div class="co info"><p class="lead" style="margin:0">'
    : '<div class="callout"><p style="margin:0">')
    + `A note before we dive in: ${esc(first)}, `
    + `I have looked at every inch of your credit file. ${esc(factsTxt)} `
    + "What we are doing over the next 6 months is clearing the road so the money can "
    + "flow.</p></div>");

  // 01 projection
  h.push(section("01", "projection", "Your Projected Pre-Approval"));
  /* Honest empty, gold only. Number(null) is 0, so a file with neither
     pre-approval figure printed "a $0 increase", a zero nobody measured. The
     old look keeps its bytes (port-parity); the gold page prints "-". */
  const known = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  /* Gold: "Up from X today - a Y increase" only when both figures are on the
     file and the projection is higher. With either missing it read "Up from -
     today - a - increase", a sentence made of holes (the F54 rule); with $0 and
     $0 (repair) it read "Up from $0 today - a $0 increase", an "up" that is not
     one. The big number stays; "-" is the house mark for an unknown figure. */
  const rises = known(c.preapproval_now) && known(c.preapproval_after)
    && Number(c.preapproval_after) > Number(c.preapproval_now);
  const upFrom = `Up from ${esc(usd(c.preapproval_now))} today - a ${esc(usd(delta))} `
    + "increase";
  h.push(gold
    ? `<div class="bigstat"><div class="bs-val">${esc(usd(c.preapproval_after))}</div>`
      + (rises ? `<div class="bs-sub">${upFrom}</div>` : "") + "</div>"
    : `<div class="hero"><div class="amount">${esc(usd(c.preapproval_after))}</div>`
      + `<div class="small">${upFrom}</div></div>`);

  // A gold strip carries no month note (see goldTimeline).
  const monthStrip = '<div class="mrow">' + MONTHS.map(([k, t, b, ex], i) =>
    `<div class="mcol"><div class="circ">${i + 1}</div><div class="mk">${esc(spaced(k))}</div>`
    + `<div class="mt">${t}</div><div class="mb">${b}</div>`
    + (ex && !gold ? `<div class="mex">${ex}</div>` : "") + "</div>").join("") + "</div>";
  const rangeNote = `<div class="note">${esc(spaced("projected median score range · anchored at month 1 and month 6 targets"))}</div>`;
  if (!gold) {
    h.push(svgProjection(med, PROJECTED_MEDIAN));
    h.push(monthStrip);
    h.push(rangeNote);
  } else {
    /* The timeline draws the six months itself, so the HTML strip is its
       duplicate. With no chart (no median, or one already in the stated
       range) the strip stays so the month-by-month plan still prints, and
       the range caption goes with the range it captions. */
    const tl = goldTimeline(med, c.score_targets?.median);
    h.push(tl ? tl + rangeNote : monthStrip);
  }

  h.push("<h3>Where You Stand Right Now vs. Where You're Going</h3>");
  /* F55. `score_targets` is initialised to four empty strings in
     src/underwrite/black-report-client.mjs:32 and, like `llc_fee`, is never
     assigned anywhere in this repository — grep returns the initialiser and the
     fixtures and nothing else. So the whole "month 6" column of this table was
     four BLANK cells on every real client, which reads as a broken document
     rather than as an unknown. A dash is what every other cell in these four
     documents uses for "the file does not say" - and the Node printer already
     answers this exact field in words rather than with a blank
     (src/underwrite/black-report-node.mjs afterScore()). Its words are used
     here so the three printers say the same thing about the same gap. */
  const NO_SCORE_TARGET = "Set at your next pull";
  const st = c.score_targets || {};
  const stand = [
    ["Median Score", med, st.median || NO_SCORE_TARGET],
    ["Experian Score", c.scores?.experian ?? "", st.experian || NO_SCORE_TARGET],
    ["TransUnion Score", c.scores?.transunion ?? "", st.transunion || NO_SCORE_TARGET],
    ["Equifax Score", c.scores?.equifax ?? "", st.equifax || NO_SCORE_TARGET]
  ];
  for (const row of rankedRevolving(cv).slice(0, 2)) {
    const tgt = targetText(row);
    // F52. No reported limit means no "$X / $Y" and no 10% target. Both cells
    // say what the file actually holds instead of implying a limit it does not.
    stand.push(tgt !== null
      ? [`${row[0]} Utilization`, `${row[4]} (${usd(row[2])} / ${usd(row[3])})`,
        `Under 10% (${tgt})`]
      : [`${row[0]} Utilization`, `${usd(row[2])} owed, ${noTargetCell(row)}`,
        `${noTargetCellCap(row)} - no target`]);
  }
  // F45. lenders_now are open TODAY. Printing 0 told a client with five matches
  // that nobody would lend to him.
  const [lendersNow, lendersAfter] = lenderBuckets(c);
  /* Gold: a file that does not split its lenders into now and later (only the
     flat `lenders` list) does not say how many are open today, so lenderBuckets'
     empty "now" is unknown, not none. It reads "-", as F45 asks. */
  const lendersToday = gold && c.lenders_now == null && c.lenders_after == null
    ? "-" : lendersNow.length;
  /* Gold: the negative-item targets agree with each other. The old table aimed
     every item at 0 while aiming Equifax at "reduced", and aimed a bureau with
     no negatives at "reduced". A bureau with items keeps "reduced", so the
     total does too; a bureau with none, and a file with none, aim at 0. A
     bureau the file has no row for has no count: "-", not 0. */
  const [, exC] = bureauStatus(c, "Experian");
  const [, eqC] = bureauStatus(c, "Equifax");
  const exBefore = gold ? dash(bureauCount(c, "Experian")) : exC;
  const eqBefore = gold ? dash(bureauCount(c, "Equifax")) : eqC;
  const eqAfter = !gold ? "reduced" : Number(eqC) > 0 ? "reduced" : 0;
  const negAfter = !gold ? 0 : negatives.length && eqAfter === "reduced" ? "reduced" : 0;
  stand.push(["Overall Utilization", c.util_pct || "-", "Under 10%"]);
  stand.push(["Negative items", negatives.length, negAfter]);
  stand.push(["Pre-Approval Estimate", usd(c.preapproval_now), usd(c.preapproval_after)]);
  stand.push(["Lenders on this shortlist", lendersToday,
    lendersNow.length + lendersAfter.length]);
  h.push(table(["", "today", "month 6"],
    stand.map((r) => r.map((v) => esc(gold ? dash(v) : v))), [], opts));

  // 02 month 1
  h.push(PB);
  h.push(section("02", "month 1", "Month 1 - Launch"));
  h.push(monthQuote("We fire on all cylinders. Everything starts now.", gold));
  h.push("<h3>Step 1: The Paydown Plan</h3>");
  /* Gold: with no open card on the file, "Lenders see your utilization" is
     about a utilization that is not there, and the step stopped at that one
     line. It says what the credit analysis and funding snapshot say instead. */
  h.push(gold && !openRevolving(cv).length
    ? `<p>${esc(payDownCardsLine(cv))}</p>`
    : `<p>This is your single biggest score lever. Lenders see ${esc(c.util_pct || "your")} `
      + "utilization and they slow down.</p>");
  if (gold) h.push(paydownCards(cv));
  const payRows = rankedRevolving(cv).map((row) => {
    const tgt = targetText(row);
    const pd = paydownAmt(row);
    /* A blank cell reads as "nothing to do here". A dash reads as "we do not
       know", which is the truth for a card with no reported limit, and is what
       both other printers put in the same two cells. */
    return [row[0], usd(row[2]), usd(row[3]),
      tgt !== null ? tgt : "-",
      pd !== null ? usd(pd) : "-"];
  });
  /* A gold page skips the table only when it has no rows: headings over an
     empty table read as a broken page, and there is nothing in it to say. */
  if (!gold || payRows.length) {
    if (gold) h.push("<h4>Every revolving account on this file</h4>");
    h.push(table(["account", "balance", "limit", "pay down to", "amount to pay"],
      payRows.map((r) => r.map(esc)), [], opts));
  }
  const totalPd = rankedRevolving(cv).reduce((sum, r) => sum + (paydownAmt(r) || 0), 0);
  const hero = heroCard(cv);
  const start = hero
    ? `Even getting ${hero[0]} down first moves your score.`
    : "Start with the highest card.";
  /* F52. THE PAYDOWN TOTAL IS A CLAIM AND HAS TO BE EARNED.
     util_target_balance used to be 10% of a total limit the engine reports as 0
     when no open card states one, so this line printed "$0" — telling a client
     who owes $5,200 that he owes nothing — while the Node printer's version of
     the same line printed his ENTIRE balance. Three cases now, and the middle
     one is the one that is easy to miss: some cards report a limit and some do
     not, so the total is real for the cards it covers and says what it cannot
     cover. */
  if (!openRevolving(cv).length) {
    // No open revolving cards at all is not "no limit reported" — there is
    // simply no paydown plan to describe, so nothing is said about one.
  } else if (!utilTotalsKnown(cv)) {
    /* F52b. "reports a credit limit" was false for a card whose limit IS
       reported, as $0. "above $0" is true in both cases and is the same
       sentence in all three printers. */
    h.push("<p><b>No open card on this file reports a credit limit above $0, so there is no "
      + "10% total to work back to.</b> Keep the balances moving down and we will set a target "
      + "as soon as a limit reports.</p>");
  } else {
    const missing = cardsWithNoTarget(cv);
    const tail = missing
      ? " That covers the cards that report a limit above $0. "
        + `${missing} card${missing === 1 ? "" : "s"} on this file `
        + `${missing === 1 ? "has" : "have"} no 10% target, so nothing for `
        + `${missing === 1 ? "it" : "them"} is in this number.`
      : "";
    const total = `<b>Total paydown to reach 10% utilization: ${esc(usd(totalPd))}.</b>${esc(tail)}`;
    const noRush = `You do not have to do this all at once. ${esc(start)}`;
    h.push(gold
      ? `<p>${total}</p><div class="co info"><p>${noRush}</p></div>`
      : `<p>${total} ${noRush}</p>`);
  }

  // The gold lists; the old look keeps its class, quoting included.
  const UL = gold ? '<ul class="fh-ul">' : '<ul class="plain">';
  h.push("<h3>Step 2: Round 1 Dispute Letters - Experian First</h3>");
  const exNegs = negatives.filter((n) => String(n.bureau || "").toLowerCase() === "experian");
  if (exNegs.length) {
    if (gold) h.push("<h4>Round 1 targets on Experian</h4>");
    // Gold prints an engine code ("Late30Days") in plain words.
    h.push(UL + exNegs.map((n) =>
      `<li>${esc(n.creditor)} - ${esc(gold ? plainRating(n.type || "") : n.type || "")} - `
      + `${esc(n.balance || "")}.</li>`).join("")
      + "</ul>");
  } else {
    h.push("<p>No Experian negatives are listed on this file.</p>");
  }
  const personal = c.personal_data || [];
  if (personal.length) {
    if (gold) h.push("<h4>Personal information on file</h4>");
    h.push(UL + personal.map((p) =>
      `<li>${esc(p[0])} - ${esc(p[1])}</li>`).join("") + "</ul>");
  }
  h.push("<h3>Step 3: Round 1 Dispute Letters - Equifax</h3>");
  const eqNegs = negatives.filter((n) => n.bureau === "Equifax");
  if (gold && !eqNegs.length) {
    // The old look prints an empty list here; a gold page says so in the
    // Experian step's own words rather than leave a heading over nothing.
    h.push("<p>No Equifax negatives are listed on this file.</p>");
  } else if (gold) {
    /* An item with no `why` on the file printed "<b>name</b> - " with nothing
       after the dash. Gold says the file's own type instead, in plain words,
       and prints no dash when the file carries neither. */
    h.push(UL + eqNegs.map((n) => {
      const note = String(n.why || "").trim() || plainRating(n.type || "").trim();
      return `<li><b>${esc(n.creditor)}</b>${note ? ` - ${esc(note)}` : ""}</li>`;
    }).join("") + "</ul>");
  } else {
    h.push(UL + eqNegs.map((n) =>
      `<li><b>${esc(n.creditor)}</b> - ${esc(n.why)}</li>`).join("") + "</ul>");
  }
  h.push("<h3>Step 4: Inquiry Removal Letters - Experian</h3>");
  h.push("<p>Inquiries do NOT affect your funding. But clean is clean. Send removal letters "
    + "for duplicates and for any inquiry that did not result in an open account.</p>");
  if (gold) {
    /* Gold names the removal candidates. This file carries one summary row per
       bureau (bureau, count, priority, note), so the list is that row, in the
       file's own words, and only when Experian shows an inquiry at all. */
    const exInq = (c.inquiries || []).find((r) =>
      Array.isArray(r) && String(r[0] || "").toLowerCase() === "experian");
    const n = exInq ? parseMoney(exInq[1]) : null;
    if (n !== null && n > 0) {
      h.push("<h4>Inquiries on your Experian file</h4>"
        + `<ul class="fh-ul"><li>${esc(`${n} ${n === 1 ? "inquiry" : "inquiries"} on Experian.`
          + (exInq[3] ? ` ${exInq[3]}` : ""))}</li></ul>`);
    }
  }
  /* F54. `llc_fee` is initialised to null in
     src/underwrite/black-report-client.mjs:29 and is never assigned anywhere in
     this repository, so usd() rendered "-" and every real client read "with the
     Secretary of State for -." A dash inside a sentence is not an honest
     rendering of unknown. No fee on the file, no fee in the sentence. */
  const llcFee = parseMoney(c.llc_fee);
  h.push(`<h3>Step 5: Form Your LLC</h3>${gold ? UL : "<ul class='plain'>"}`
    /* Gold only: no state or address on the file, no blank inside the
       sentence (the F54 rule for the fee, applied to the two fields beside it). */
    + `<li>File your LLC ${gold && !c.state ? "" : `in ${esc(c.state)} `}online with the Secretary of State`
    + `${llcFee === null ? "" : ` for ${esc(usd(llcFee))}`}.</li>`
    + (gold && !c.address ? "" : `<li>Use your address at ${esc(c.address)}.</li>`)
    + "<li>Once filed, the clock starts. LLC age matters for lenders.</li>"
    + "<li>Open a dedicated business checking account. Even $100 in it is fine to start.</li></ul>");
  /* Gold: "You qualify for a personal loan right now" is said only when the
     file carries a pre-approval above $0. With none on the file it read
     "Current pre-approval estimate: -." (a dash inside a sentence, the F54
     rule); with $0 it told the client he qualifies for nothing, as a yes. */
  const qualifies = !gold || (known(c.preapproval_now) && Number(c.preapproval_now) > 0);
  h.push("<h3>Step 6: Secure Your Personal Loan NOW</h3><p>"
    + (qualifies
      ? "You qualify for a personal loan right now, before any repairs. Current "
        + `pre-approval estimate: ${esc(usd(c.preapproval_now))}. `
      : "")
    + "Do NOT open any new credit "
    + "cards or accounts before you lock this in - new accounts lower your average "
    + "account age and trigger hard inquiries. Get the funding first. Build the credit "
    + "profile after.</p>");

  // 03 months 2-3
  h.push(PB);
  h.push(section("03", "months 2-3", "Months 2-3 - Results"));
  h.push(monthQuote("The work starts paying off. Numbers move.", gold));
  if (gold) {
    // The clock draws its own heading and both sentences under it, word for
    // word, so the HTML copies of them would print each line twice.
    h.push(disputeClock());
  } else {
    h.push("<h3>Why disputes take rounds, not days.</h3>");
    h.push(svgDisputeFlow());
    h.push("<p><b>One round rarely clears everything. Three rounds is normal.</b><br>"
      + "<span style='font-size:9pt'>The 30 day clock is set by law. That is why this takes "
      + "months, not days.</span></p>");
  }
  h.push('<div class="note">THE PROCESS BEHIND EVERY DISPUTE ROUND IN THIS PLAN</div>');
  h.push("<h3>What to Expect in Month 2</h3>");
  h.push("<p>Utilization paydowns hit your score first - balance updates report within 30-45 "
    + "days. Estimated score movement from utilization alone: <b>+25 to +45 points</b>. "
    + "Dispute results start coming back at day 30-45.</p>");
  if (gold) {
    // Gold's Month 2 action list: this roadmap's own Month 2 checklist items.
    h.push("<h3>Month 2 Action Items</h3>"
      + `<ul class="fh-ul">${month2Items(hero).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
  }
  h.push("<h3>What to Expect in Month 3</h3>");
  h.push("<p>Round 2 escalation letters go out for anything that came back verified. Round 2 "
    + "requests the method of verification, cites specific FCRA violations where the "
    + "process was improper, and escalates the charge-off.</p>");
  if (gold && negatives.length) {
    // Gold's Round 2 targets: the items on this file, by name and bureau.
    h.push("<h4>Round 2 targets, if still on the file after Round 1</h4>"
      + `<ul class="fh-ul">${negatives.map((n) =>
        `<li>${esc([n.creditor, n.bureau].filter(Boolean).join(" - "))}</li>`).join("")}</ul>`);
  }
  /* F53. This read "TransUnion holding at 725" for every client, which states a
     score this file may not carry, and "$12,000-$15,000" regardless of the
     pre-approval already on the file. The projection now names only the bureaus
     this file actually scores, and the pre-approval figure is this client's. */
  const projBits = [];
  for (const [label, key] of [["Experian", "experian"], ["Equifax", "equifax"],
    ["TransUnion", "transunion"]]) {
    const v = Number(c.scores?.[key]);
    if (!Number.isFinite(v)) continue;
    projBits.push(`${label} holding at or above ${v}`);
  }
  if (projBits.length) {
    // Gold: "climbs toward $0" (repair) is not a climb. Said only when it rises.
    h.push(`<p><b>Month 3 score projection:</b> ${esc(projBits.join(", "))}.`
      + (!gold || rises
        ? ` Pre-approval estimate climbs toward ${esc(usd(c.preapproval_after))}.`
        : "")
      + "</p>");
  }

  // 04 month 4
  h.push(PB);
  h.push(section("04", "month 4", "Month 4 - Final Push"));
  h.push(monthQuote("We go after what's left. No item gets a free pass.", gold));
  // Gold heads this list as Round 3; the Month 4 checklist item is Round 3 too.
  if (gold) h.push("<h3>Round 3 Dispute Letters</h3>");
  h.push(`${UL}
      <li>CFPB complaints filed alongside disputes - bureaus respond faster when regulators are watching.</li>
      <li>Direct creditor disputes, not just bureau disputes.</li>
      <li>Procedural challenges where a bureau took longer than 30 days to respond.</li>
      </ul>`);
  const charge = negatives.find((n) => String(n.type || "").toLowerCase().includes("charge")) || null;
  if (charge) {
    const bal = parseMoney(charge.balance);
    const low = bal ? Math.round(bal * 0.4) : null;
    const high = bal ? Math.round(bal * 0.6) : null;
    h.push(`<h3>Settlement Negotiation - ${esc(charge.creditor)}</h3>`);
    if (gold) h.push("<h4>Your settlement script</h4>");
    h.push(`<div class="${gold ? "co" : "callout"}">"I am calling to discuss this account. `
      + "I am prepared to settle. I can only do so if you agree in "
      + 'writing to delete this account from all three credit bureaus upon payment."</div>');
    if (low !== null) {
      h.push(`<p><b>Your offer range: ${esc(usd(low))} to ${esc(usd(high))} `
        + `(40%-60% of the ${esc(usd(bal))} balance).</b></p>`);
    }
    if (gold) h.push("<h4>Rules for this negotiation</h4>");
    h.push(`${UL}
          <li>Do NOT pay without a written pay-for-delete agreement first.</li>
          <li>Get the agreement via email or certified mail.</li>
          <li>Do NOT give bank account numbers over the phone - use a money order or prepaid card.</li>
          <li>Once they confirm deletion in writing, pay and keep the receipt.</li>
          </ul>`);
  }
  const childSources = [
    ...negatives.map((n) => `${n.creditor || ""} ${n.type || ""}`),
    ...(c.public_obligations || []).map((r) => `${r[0] || ""} ${r[1] || ""}`)
  ];
  const child = childSources.some((s) => s.toLowerCase().includes("child"));
  if (child) {
    h.push("<h3>Child Support Accounts - Strategic Note</h3>");
    h.push("<p>Government child support accounts are harder to delete and rarely do "
      + "pay-for-delete. What works: get current so no new lates are added, request a "
      + "payment plan in writing confirmed as current, and dispute individual late payment "
      + "dates for accuracy.</p>");
  }

  // 05 month 5
  h.push(PB);
  h.push(section("05", "month 5", "Month 5 - Business Milestone"));
  if (gold) h.push("<h3>Business Credit Profile Setup</h3>");
  h.push(`${UL}
      <li>Get your EIN from the IRS - free at IRS.gov.</li>
      <li>Register with Dun &amp; Bradstreet for your DUNS number.</li>
      <li>Open a dedicated business checking account under your LLC name.</li>
      <li>Get net-30 vendor accounts (Uline, Quill, Grainger) and start building Paydex.</li>
      </ul>`);
  if (gold) h.push("<h3>Why This Month Matters for Lenders</h3>");
  h.push("<p>Most business lenders require 6-12 months of business age. By Month 5 you are "
    + "halfway to the 12-month threshold that unlocks the larger lines of credit.</p>");

  // 06 month 6
  h.push(PB);
  h.push(section("06", "month 6", "Month 6 - The Reveal"));
  if (gold) h.push("<h3>Re-Pull All Three Bureaus</h3>");
  h.push("<p>Pull a fresh tri-merge report and compare it side by side with Month 1.</p>");
  const reveal = [];
  for (const n of negatives) {
    reveal.push([`${n.creditor} ${gold ? plainRating(n.type) : n.type}`, n.balance || "showing",
      "Deleted or settled"]);
  }
  for (const row of rankedRevolving(cv).slice(0, 2)) {
    /* A card with no reported limit has no utilization today and no 10% to
       reach by month 6. "Under 10%" beside a blank cell is a target the client
       cannot check themselves against. Same rows as
       scripts/black-reports/fundhub_gen.py:1686-1692. */
    if (targetText(row) === null) {
      reveal.push([`${row[0]} balance`, usd(row[2]),
        `Lower - ${noTargetCell(row)}, so no 10% target`]);
      continue;
    }
    reveal.push([`${row[0]} utilization`, row[4], "Under 10%"]);
  }
  reveal.push(["Overall utilization", c.util_pct || "-", "Under 10%"]);
  reveal.push(["Experian negatives", exBefore, 0]);
  reveal.push(["Equifax negatives", eqBefore, eqAfter]);
  h.push(table(["item", "month 1", "month 6 (target)"], reveal.map((r) => r.map(esc)), [], opts));
  if (gold) {
    h.push("<h3>Your New Pre-Approval Number</h3>"
      + `<div class="bigstat"><div class="bs-lab">${esc(spaced("projected personal loan pre-approval"))}</div>`
      + `<div class="bs-val">${esc(usd(c.preapproval_after))}</div></div>`);
  } else {
    h.push('<div class="hero"><div class="mono small">'
      + `${esc(spaced("projected personal loan pre-approval"))}</div>`
      + `<div class="amount">${esc(usd(c.preapproval_after))}</div></div>`);
  }

  // 07 transformation
  //
  // The Python heading reads "Before &amp; After Transformation Table" and is
  // then passed through esc(), so it prints the literal "&amp;". The designed
  // PDF at docs/workflows/gold-deliverables-v5/optimization_roadmap.pdf:541
  // reads "Before & After Transformation Table". The designed output wins.
  h.push(PB);
  h.push(section("07", "transformation", "Before & After Transformation Table"));
  /* Gold: the month-6 score column is the file's own `score_targets`, the same
     field and the same words as the 01 table ("Set at your next pull" when the
     file states none). The old look's 680-710 / 690+ / 670+ / 725+ are the
     Jordan Sample's targets, printed for everyone: a 762 read "762 -> 690+",
     a fall. The business "before" cells read the file's `business` record: no
     record, "-". There is no business pre-approval figure on any file, so its
     "before" is "-", not "$0". */
  const scoreAfter = (key, old) => (gold ? st[key] || NO_SCORE_TARGET : old);
  const biz = c.business && typeof c.business === "object" ? c.business : null;
  const llcBefore = !gold ? "No" : !biz ? "-" : biz.hasEntity === true ? "Yes" : "No";
  // No entity, no business credit profile. With an entity, no business credit
  // report is bought, so the file cannot say.
  const bizCreditBefore = !gold ? "None" : biz && biz.hasEntity === false ? "None" : "-";
  h.push(table(["category", "before", "after (month 6)"], [
    ["Median Score", med, scoreAfter("median", PROJECTED_MEDIAN)],
    ["Experian Score", c.scores?.experian ?? "", scoreAfter("experian", "690+")],
    ["Equifax Score", c.scores?.equifax ?? "", scoreAfter("equifax", "670+")],
    ["TransUnion Score", c.scores?.transunion ?? "", scoreAfter("transunion", "725+")],
    ["Overall Utilization", c.util_pct || "-", "Under 10%"],
    ["Negative items", negatives.length, negAfter],
    ["Experian Negatives", exBefore, 0],
    ["Equifax Negatives", eqBefore, eqAfter],
    ["Identity mismatches", personal.length, 0],
    ["Personal Pre-Approval", usd(c.preapproval_now), usd(c.preapproval_after)],
    ["Business Pre-Approval", gold ? "-" : "$0", "$5K-$20K (LLC dependent)"],
    ["Lenders Available", lendersToday,
      `${lendersNow.length + lendersAfter.length} unlocked`],
    ["LLC Formed", llcBefore, "Yes (4-6 months old)"],
    ["Business Credit Profile", bizCreditBefore, "Active (Paydex building)"]
  ].map((r) => r.map((v) => esc(gold ? dash(v) : v))), [], opts));

  // 08 checklist
  h.push(PB);
  h.push(section("08", "checklist", "Your 6-Month Checklist"));
  const month1 = fastestWins(cv);
  if (negatives.length) month1.push("Send Round 1 dispute letters for items on this file");
  month1.push("Send inquiry removal letters for duplicate pulls");
  month1.push(c.state ? `File LLC in ${c.state}` : "File LLC");
  month1.push("Open business checking account");
  month1.push("Apply for personal loan pre-approval NOW");
  const month2 = month2Items(hero);
  const month4 = ["Send Round 3 letters + CFPB complaints for stubborn items"];
  if (charge) month4.push(`Negotiate pay-for-delete with ${charge.creditor} if still showing`);
  const checklist = [
    ["Month 1", month1],
    ["Month 2", month2],
    ["Month 3", ["Send Round 2 escalation letters for any verified items",
      "Pull updated scores and compare to Month 1"]],
    ["Month 4", month4],
    ["Month 5", ["Get EIN from IRS.gov",
      "Register with Dun & Bradstreet for DUNS number",
      "Open net-30 vendor accounts",
      "Pull scores and check milestone progress"]],
    ["Month 6", ["Pull fresh tri-merge report",
      "Compare to Month 1 baseline",
      "Submit for updated pre-approval",
      "Apply for business funding if LLC is 6+ months old"]]
  ];
  for (const [m, items] of checklist) {
    h.push(gold
      ? `<h4>${esc(m)}</h4><ul class="fh-check">`
        + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>"
      : `<h3>${esc(m)}</h3>`
        + items.map((i) => `<div class="check">${esc(i)}</div>`).join(""));
  }

  // 09 call to action
  h.push(PB);
  h.push(section("09", "call to action", "Your Call to Action"));
  /* F53. This named maxed-out cards and old negatives for every client. On a
     file with neither it was simply untrue, so the count and the kind now come
     off the file, and a file with neither gets no such sentence at all. */
  const back = holdingYouBack(cv);
  /* Gold: "nothing on this file to dispute or pay down" is said only when no
     open card carries a balance. holdingYouBack() counts only cards at 50% or
     more, so a $5,200 card with no limit (no-limit) or three cards under 20%
     (academy) got this sentence while Step 1 on the same page told the client
     to pay them down. Then nothing is said here rather than something false. */
  const owes = openRevolving(cv).some((r) => (parseMoney(r[2]) || 0) > 0);
  const opening = gold && !back && owes ? "" : `<p>${esc(first)}, ${esc(back
    || "there is nothing on this file to dispute or pay down, so the six months ahead are "
      + "about building the business side rather than repairing the personal one.")}</p>`;
  h.push(gold
    // The booking link, never client.booking_url (W1 rule): gold page 14 sets
    // this line in its own panel.
    ? `${opening}<div class="co info"><p>Book your strategy call at ${bookLink()}.</p></div>`
    : `${opening}
      <p>Book your strategy call at ${esc(c.booking_url)}.</p>`);
  h.push('<p class="small">This roadmap was prepared by your FundHub advisor based on your '
    + "current credit profile. Projected scores and pre-approval amounts are estimates "
    + "based on historical outcomes. Individual results may vary.</p>");
  h.push(ctaPage(c, opts));
  return h.join("");
}
