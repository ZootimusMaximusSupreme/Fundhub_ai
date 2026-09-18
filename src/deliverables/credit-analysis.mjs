// DOCUMENT 1 — Financial Profile Assessment (credit analysis report).
// Ported from scripts/black-reports/fundhub_gen.py:811-1094. Eight numbered
// sections: bureaus, scores, utilization, au accounts, negatives, inquiries,
// personal data, bottom line.

//
// TWO LOOKS (2026-09-17). buildCreditAnalysis(client, opts). With no opts it
// prints the older fundhub_gen.py markup byte for byte (port-parity.test.mjs
// pins it). With { look: "gold" } it draws the gold pack
// (docs/workflows/gold-deliverables-v5/credit_analysis_report.pdf): gold
// blocks (.lead, .co, .mrow/.mc, table.fh with chips) and the six gold charts
// from gold-charts.mjs in place of the three old ones. The words are the same
// in both looks. Where a gold chart draws a sentence the page also prints right
// beside it, the page copy is left out so it is not said twice; where a chart
// is not drawn, the page copy prints exactly as before.

import { esc } from "./escape.mjs";
import { usd, median, spaced, parsePct, parseMoney } from "./format.mjs";
import { rankedRevolving, targetBal, targetText, paydownAmt, paydownSentence, bureauStatus,
  heroCard, utilTotalsKnown, accountFactSentences, payDownCardsLine, cleanBureaus,
  openRevolving, limitState, paydownCards } from "./derive.mjs";
import { cover, ctaPage, section, table, utilBar, chip, isGold, BOOK_CALL_URL, PB } from "./chrome.mjs";
import { svgTwoTrack, svgPaydownBars, svgSeverity } from "./charts.mjs";
import { journeyMap, scoreLineup, utilizationTank, utilizationBars, severityScale,
  moneyChain } from "./gold-charts.mjs";

const BUREAU_LABEL = Object.freeze({
  experian: "Experian",
  equifax: "Equifax",
  transunion: "TransUnion"
});

function firstName(client) {
  const raw = String(client?.applicant || "").trim() || "Client";
  return raw.split(/\s+/)[0];
}

/**
 * What "full repair" means ON THIS FILE. The literal it replaces read
 * "charge-offs removed, lates addressed, utilization under 10%" for every
 * client, including files carrying no charge-off and no late at all.
 */
function fullRepairMeans(client) {
  const c = client || {};
  const bits = [];
  const kinds = (c.negatives || []).map((n) => String(n.type || "").toLowerCase());
  if (kinds.some((k) => k.includes("charge"))) bits.push("charge-offs removed");
  if (kinds.some((k) => k.includes("late"))) bits.push("lates addressed");
  if (kinds.length && !bits.length) bits.push("the negative items on this file addressed");
  if (utilTotalsKnown(c)) bits.push("utilization under 10%");
  return bits.join(", ");
}

/** Bureau keys ordered lowest score first, the way the Python ranks them. */
function rankedScoreKeys(scores) {
  return Object.entries(scores || {})
    .filter(([, v]) => Number.isFinite(Number(v)))
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([k]) => k);
}

/* ------------------------------------------------------------ gold look -- */

/* The gold sheet's three chip weights (fundhub_pdf_template.py SOLID / MID /
   OUTLINE). Anything else is an outline chip. */
const CHIP_SOLID = new Set(["DIRTY", "CRITICAL", "URGENT"]);
const CHIP_MID = new Set(["HIGH", "MEDIUM"]);

/** A status cell as a gold chip. No status prints "-", not an empty chip. */
function goldChip(text) {
  const up = String(text ?? "").trim().toUpperCase();
  if (!up) return "-";
  return chip(up, CHIP_SOLID.has(up) ? "solid" : (CHIP_MID.has(up) ? "mid" : "line"));
}

/**
 * How many characters a rail label may take with `k` items on the rail. Labels
 * alternate above and below, so a label shares its side with every second dot.
 * Geometry is severityScale's: a 488-unit rail, dots from 4% to 96% of it,
 * labels pulled 28 units in from each end; about 4.7 units per bold character.
 * Seven items (the gold sample) keep the old 22; nine get 16, so two labels on
 * the same side never run into each other.
 */
function railBudget(k) {
  if (k < 2) return 22;
  const sameSide = (2 * 0.92 * 488) / (k - 1);
  return Math.max(8, Math.min(22, Math.floor((sameSide - 34) / 4.7)));
}

/**
 * A creditor name short enough for a rail label. The old rail cut at 22
 * characters wherever that fell ("STUDENT LOAN MARKETI ("); this backs off to
 * the last whole word. The full name is in the table the dot number points to.
 */
function railName(name, max = 22) {
  const full = String(name || "");
  if (full.length <= max) return full;
  const cut = full.slice(0, max + 1);
  const sp = cut.lastIndexOf(" ");
  const out = (sp > 0 ? cut.slice(0, sp) : full.slice(0, max)).replace(/[\s(/&,-]+$/, "");
  return out || full.slice(0, max);
}

/**
 * A card name that fits left of a utilization bar (148 units at 9pt bold):
 * about 28 mixed-case or 22 capital characters. "American Express Blue
 * Business Cash" ran under the bar. The full name is in the table above.
 */
function barLabel(name) {
  const full = String(name ?? "");
  return railName(full, /[a-z]/.test(full) ? 28 : 22);
}

/**
 * One card that several bureaus report is ONE card. The mapper wrote a row per
 * bureau copy (the repair and academy files carry each card three times), so
 * the top two by utilization were often the same card twice: two identical
 * bars, "$2,300 + $2,300" in the money chain, the same Step 1 row twice.
 * The key is the mapper's own F43 fallback for a line with no account number:
 * creditor, balance and limit. The first copy in the list is kept.
 */
function cardKey(row) {
  return [String(row?.[0] ?? "").trim().toLowerCase(),
    String(parseMoney(row?.[2]) ?? ""), String(parseMoney(row?.[3]) ?? "")].join("|");
}
function distinctCards(rows) {
  const seen = new Set();
  return (rows || []).filter((r) => {
    const k = cardKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* Gold: a table with no rows says so in one line, the same line the funding
   snapshot uses. Column headings over nothing read as a broken page. */
const NONE_ON_FILE = "<p>None on file.</p>";

/* The most dots the severity rail can carry with every label readable.
   Measured in Chromium at 900px with Jordan's longest labels ("Charge-Off
   (Medical)", "120+ Day Lates (4x)"): ten draw clear, eleven overlap at the
   left end, where the first label is pulled in from the edge. Past this the
   rail is left out and the page copy says the count instead. */
const RAIL_MAX = 10;

/**
 * Does this report rank its own negative items? DIAGRAM_SPEC 4.3: the rail's
 * order "comes from the report's own severity ranking". An authored report
 * says why each item sits where it does (Jordan: item 1 is "Worst item on
 * your PRIMARY bureau"). The mapper numbers items in the order the bureaus
 * sent them and gives no reason for any of them (why ""), so on a mapper file
 * the rail would call a 30-day late the worst item on the file. No reason
 * given, no ranking, no rail.
 */
function reportRanksNegatives(negatives) {
  return negatives.length > 0 && negatives.every((n) => String(n?.why ?? "").trim() !== "");
}

/** Owner-set 2026-09-17: the booking link on every gold page. */
function bookLink() {
  return `<a href="${esc(BOOK_CALL_URL)}">${esc(BOOK_CALL_URL.replace(/^https:\/\//, ""))}</a>`;
}

/** Unknown prints "-" on a gold page, never a blank and never 0. */
function orDash(v) {
  return v === null || v === undefined || v === "" ? "-" : v;
}

/** A gold stat card (fundhub_pdf_template.py r_metrics). `body` is already HTML. */
function metricCard(label, value, verdict, body) {
  return `<div class="mc"><div class="mlab">${esc(spaced(label))}</div>`
    + `<div class="mval">${esc(orDash(value))}</div>`
    + `<div class="mver">${esc(spaced(verdict))}</div><div class="mnote">${body}</div></div>`;
}

/**
 * What the opening may truly say, and the fundability journey map (DIAGRAM_SPEC
 * 4.5 and 6). Gold only.
 *
 *   moneyToday  the file shows money today: a known pre-approval above $0 and
 *               an outcome that is not REPAIR_ONLY. Only then does the lead say
 *               "You qualify for funding today".
 *   twoTrack    money today AND negative items to dispute. Only then do the
 *               "two tracks" lines and "BOTH TRACKS ARE ALREADY IN THIS PLAN"
 *               print. The old look printed them for every file, including a
 *               repair-only file at $0 and a file with nothing to repair.
 *   map         the two-track map when twoTrack and a clean bureau (W2's rule
 *               for Track 1); the one-track "Your plan starts with repair." map
 *               when the file says there is no money today (REPAIR_ONLY, or $0)
 *               and there are items to dispute; else "". With the two-track
 *               lines gone on those files the one-track map contradicts
 *               nothing. A file with nothing to dispute gets no map: its rounds
 *               would be invented.
 */
function goldPlan(c) {
  const nowN = parseMoney(c.preapproval_now);
  const repairOnly = String(c.outcome ?? "").trim().toUpperCase() === "REPAIR_ONLY";
  const moneyToday = !repairOnly && nowN !== null && nowN > 0;
  const noMoneyToday = repairOnly || (nowN !== null && nowN <= 0);
  const negs = (c.negatives || []).length > 0;
  const twoTrack = moneyToday && negs;
  const hasClean = cleanBureaus(c).length > 0;
  let map = "";
  if ((twoTrack && hasClean) || (noMoneyToday && negs)) {
    // Three rounds: the map the older printer drew for every file. The CLIENT
    // dict carries no round count, so none is made up here.
    map = journeyMap({
      now: usd(c.preapproval_now),
      after: usd(c.preapproval_after),
      rounds: 3,
      hasCleanBureau: hasClean,
      outcome: c.outcome
    });
    // The map's own headline must say what this page says, or it is left out.
    const want = twoTrack ? "Your plan runs on two tracks at the same time." : "Your plan starts with repair.";
    if (!map.includes(`aria-label="${want}"`)) map = "";
  }
  return { moneyToday, twoTrack, map };
}

/**
 * The projected pre-approval card's body, gold. The shared payDownCardsLine()
 * counts every open tradeline: Jordan's two $0 DISCOVERCARD lines and his paid
 * SYNCB (old), and each bureau copy of one card (academy "9 open revolving
 * cards" for three cards). Here it counts the distinct open cards with a
 * balance, and of those, the ones with something to pay down to their 10%
 * target when any have one, so the count matches the money chain below it.
 * The same shared sentence prints; only the list it counts is honest.
 * "That alone moves your pre-approval." is left off when there is nothing to
 * pay down, or when the file shows projected at or below current.
 */
function goldPayDownLine(c, nowKnown, afterKnown) {
  const cards = paydownCards(distinctCards(openRevolving(c)));
  const line = esc(payDownCardsLine({ revolving: cards }));
  const flat = nowKnown !== null && afterKnown !== null && afterKnown <= nowKnown;
  return cards.length && !flat ? `${line} That alone moves your pre-approval.` : line;
}

/**
 * The note under each score in the line-up (DIAGRAM_SPEC 4.1).
 *
 * The page's own note is the negative count ("1 negative item"). Lined up
 * lowest score first, a count that goes UP with the score reads backwards to a
 * beginner (Jordan: Experian 630 with 1 item, Equifax 636 with 7). So:
 *   1. the count, when no higher score carries more items than a lower one;
 *   2. else clean or not, when no clean bureau scores below one with items;
 *   3. else the same neutral line under all three.
 * The counts stay in the 01 table and the cards below, where they sit beside
 * their own bureau and cannot be read as a ranking.
 */
function lineupNotes(c, keys, scores, countNote) {
  const count = (k) => {
    const [st, cnt] = bureauStatus(c, BUREAU_LABEL[k]);
    if (!st) return null; // not on the file: no count, and not clean either
    if (st === "CLEAN" || cnt === 0) return 0;
    const n = Number(cnt);
    return Number.isFinite(n) ? n : null;
  };
  const rows = keys.map((k) => ({ k, score: Number(scores[k]), n: count(k) }))
    .sort((a, b) => a.score - b.score);
  const backwards = (val) => rows.some((lo, i) => rows.slice(i + 1).some((hi) =>
    hi.score > lo.score && val(hi) > val(lo)));
  if (rows.every((r) => r.n !== null) && !backwards((r) => r.n)) {
    return Object.fromEntries(keys.map((k) => [k, countNote(BUREAU_LABEL[k])]));
  }
  if (rows.every((r) => r.n !== null) && !backwards((r) => (r.n > 0 ? 1 : 0))) {
    return Object.fromEntries(rows.map((r) =>
      [r.k, r.n > 0 ? "Negative items on it" : "Nothing negative on it"]));
  }
  return Object.fromEntries(keys.map((k) => [k, "From your tri-merge report"]));
}

export function buildCreditAnalysis(client, opts = {}) {
  const gold = isGold(opts);
  const c = client || {};
  const s = c.scores || {};
  const scoreVals = Object.values(s).map(Number).filter(Number.isFinite);
  const med = median(s);
  const spread = scoreVals.length ? Math.max(...scoreVals) - Math.min(...scoreVals) : "";
  const h = [cover(c, "credit analysis report", "Financial Profile Assessment", opts)];
  // Gold callouts are the template's .co panel; the old look's is .callout.bar.
  const callout = gold ? '<div class="co">' : '<div class="callout bar">';

  // Shared with the roadmap's opening paragraph — one derivation, not two.
  const haveTxt = accountFactSentences(c).join(" ") || "You have real credit activity.";
  const first = esc(firstName(c));
  const plan = gold ? goldPlan(c) : null;
  // Gold: "You qualify for funding today" only on a file that shows money today.
  h.push(`<p${gold ? ' class="lead"' : ""}>${first}, let me be straight with you. ${esc(haveTxt)}
    This report breaks down exactly what is on this file: scores, cards, and what to do next.${
  !gold || plan.moneyToday ? `
    You qualify for funding today based on the numbers in this pack.` : ""}</p>`);
  const twoTrackLines = '<p><b>You do not wait for repair to finish before you get money. Both tracks run '
    + 'at the same time.</b><br><span style="font-size:9pt">Each dispute round makes the '
    + "next application round stronger.</span></p>";
  if (!gold) {
    h.push("<p><b>Your plan runs on two tracks at the same time.</b></p>");
    h.push(svgTwoTrack(usd(c.preapproval_now), usd(c.preapproval_after)));
    h.push(twoTrackLines);
  } else if (plan.map) {
    // The map draws its headline, the bold line and the line under it itself.
    h.push(plan.map);
  } else if (plan.twoTrack) {
    h.push("<p><b>Your plan runs on two tracks at the same time.</b></p>");
    h.push(twoTrackLines);
  }
  const outcomeTxt = String(c.outcome || "").toLowerCase();
  h.push(`<div class="note">YOUR OUTCOME: ${esc(gold ? orDash(outcomeTxt) : outcomeTxt)}`
    + `${!gold || plan.twoTrack ? " · BOTH TRACKS ARE ALREADY IN THIS PLAN" : ""}</div>`);

  // 01 bureaus
  h.push(section("01", "bureaus", "Bureau Health Summary"));
  const bureauRows = (c.bureaus || []).map(([name, status, neg, note]) => {
    if (gold) return [esc(name), goldChip(status), esc(neg), esc(note)];
    const cls = status === "DIRTY" ? "tag solid" : "tag";
    return [esc(name), `<span class="${cls}">${esc(status)}</span>`, esc(neg), esc(note)];
  });
  h.push(gold && !bureauRows.length ? NONE_ON_FILE
    : table(["bureau", "status", "negative items", "notes"], bureauRows, [], opts));
  const [exStatus, exCount] = bureauStatus(c, "Experian");
  if (exStatus === "DIRTY") {
    h.push(`${callout}Experian is the primary bureau lenders pull first. `
      + `It has ${esc(exCount)} negative item${exCount !== 1 ? "s" : ""} sitting on it `
      + "right now. That is job one for repair.</div>");
  } else if (gold && exStatus !== "CLEAN") {
    /* Gold, honest empty: a file that does not list Experian at all got "On
       this file it is clean." Only a file that says CLEAN is called clean. */
    h.push(`${callout}Experian is the primary bureau lenders pull first.</div>`);
  } else {
    h.push(`${callout}Experian is the primary bureau lenders pull first. `
      + "On this file it is clean.</div>");
  }

  // 02 scores
  h.push(section("02", "scores", "Score Breakdown by Bureau"));
  const lineupKeys = ["experian", "equifax", "transunion"];
  const scoreSub = (label) => {
    const [st, cnt] = bureauStatus(c, label);
    if (st === "CLEAN" || cnt === 0) return "Nothing negative on it";
    return `${cnt} negative item${cnt !== 1 ? "s" : ""}`;
  };
  let lineup = "";
  const known = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  if (gold && lineupKeys.every((k) => known(s[k]))) {
    const notes = lineupNotes(c, lineupKeys, s, scoreSub);
    lineup = scoreLineup(lineupKeys.map((k) => [BUREAU_LABEL[k], Number(s[k]), notes[k]]));
  }
  // The line-up draws "You do not have one credit score. You have three." itself.
  if (!lineup) h.push("<p><b>You do not have one credit score. You have three.</b></p>");
  const ranked = rankedScoreKeys(s);
  const lowK = ranked[0];
  const midK = ranked.length === 3 ? ranked[1] : undefined;
  const scoreTag = (key) => {
    if (key === midK) return "YOUR MIDDLE SCORE";
    if (key === lowK) return "LOWEST";
    return "HIGHEST";
  };
  const scoreBox = (key) => {
    const label = BUREAU_LABEL[key];
    return `<div class="scorebox${midK === key ? " hl" : ""}"><div class="sl">${esc(spaced(label))}</div>`
      + `<div class="sn">${esc(s[key] ?? "")}</div>\n    `
      + `<div class="ss">${esc(scoreSub(label))}</div><div class="sb">${esc(scoreTag(key))}</div></div>`;
  };
  if (!gold) {
    h.push(`
<div class="midlabel">LENDERS PICK THE MIDDLE SCORE</div>
<div class="midarrow">&#8595;</div>
<div class="cards" style="margin-top:0">
  ${scoreBox("experian")}
  ${scoreBox("equifax")}
  ${scoreBox("transunion")}
</div>
<p><b>Line them up from lowest to highest. Lenders use the middle one. Yours is ${esc(med)}.</b><br>
<span style="font-size:9pt">They do not match because not every company reports to all three
bureaus. Your best and worst are ${esc(spread)} points apart. Closing that gap is the job.</span></p>
<div class="note">SCORES FROM YOUR TRI-MERGE REPORT · DETAILS IN THE CARDS BELOW</div>`);
  } else if (lineup) {
    /* The line-up replaces the score boxes and their "LENDERS PICK THE MIDDLE
       SCORE" label, and draws the two lines under it. With no gap between the
       best and worst score it leaves out "Closing that gap is the job", which
       would be false. */
    h.push(lineup);
    h.push('<div class="note">SCORES FROM YOUR TRI-MERGE REPORT · DETAILS IN THE CARDS BELOW</div>');
  } else {
    /* Fewer than three scores: no line-up, because there is no middle to
       point at. The cards below still show each score, "-" where it is
       missing. */
    h.push(`<p><b>Line them up from lowest to highest. Lenders use the middle one. Yours is ${esc(orDash(med))}.</b><br>
<span style="font-size:9pt">They do not match because not every company reports to all three
bureaus. Your best and worst are ${esc(orDash(spread))} points apart. Closing that gap is the job.</span></p>
<div class="note">SCORES FROM YOUR TRI-MERGE REPORT · DETAILS IN THE CARDS BELOW</div>`);
  }

  const cardCopy = (label) => {
    const [st, cnt, note] = bureauStatus(c, label);
    /* Gold, honest empty: bureauStatus() answers ["", 0, ""] for a bureau the
       file does not list, and 0 read as "STRONG / Your cleanest bureau on this
       file." A bureau the file does not show is not called clean. */
    if (gold && !st) return ["-", ""];
    if (st === "CLEAN" || cnt === 0) return ["STRONG", "Your cleanest bureau on this file."];
    return ["NEEDS WORK", note || `${cnt} negative item${cnt !== 1 ? "s" : ""} on this bureau.`];
  };
  const [tuTag, tuBody] = cardCopy("TransUnion");
  const [eqTag, eqBody] = cardCopy("Equifax");
  const [exTag, exBody] = cardCopy("Experian");
  const cards = [
    ["transunion", s.transunion ?? "", tuTag, tuBody],
    ["equifax", s.equifax ?? "", eqTag, eqBody],
    ["experian", s.experian ?? "", exTag, exBody],
    ["median score", med, "MIDDLE SCORE LENDERS USE",
      "This is the number most lenders read. Your other two scores sit around it."]
  ];
  if (gold) {
    h.push('<div class="mrow">' + cards.map(([k, v, t, b]) => metricCard(k, v, t, esc(b))).join("")
      + "</div>");
  } else {
    h.push('<div class="cards">' + cards.map(([k, v, t, b]) =>
      `<div class="card"><div class="lbl">${esc(spaced(k))}</div><div class="big">${esc(v)}</div>`
      + `<div class="sub">${esc(spaced(t))}</div><div class="body">${esc(b)}</div></div>`).join("")
      + "</div>");
  }
  if (scoreVals.length) {
    const best = ranked[ranked.length - 1];
    const worst = ranked[0];
    const titleCase = (k) => BUREAU_LABEL[k] || k;
    h.push(`${callout}There is a ${esc(spread)}-point spread between your best bureau `
      + `(${esc(titleCase(best))} ${esc(s[best])}) and your worst `
      + `(${esc(titleCase(worst))} ${esc(s[worst])}). Close that gap and your funding `
      + "picture changes dramatically.</div>");
  }

  // 03 utilization
  h.push(PB);
  h.push(section("03", "utilization", "Primary Revolving Cards - Utilization Analysis"));
  const revRows = (c.revolving || []).map(([cr, br, bal, lim, util, tgt, st]) => {
    const cls = st === "CRITICAL" ? "tag solid" : (st === "HIGH" ? "tag grey" : "tag open");
    // util and tgt are the empty string when no limit is reported. A dash says
    // "we do not know"; a blank cell says "nothing to do here".
    return [esc(cr), esc(br), esc(usd(bal)), esc(usd(lim)), esc(util || "-"), esc(tgt || "-"),
      gold ? goldChip(st) : `<span class="${cls}">${esc(st)}</span>`];
  });
  h.push(gold && !revRows.length ? NONE_ON_FILE : table(["creditor", "bureau", "balance", "limit", "utilization",
    "target balance", "status"], revRows, [], opts));
  const hero = heroCard(c);
  /* The two highest-utilization cards, for the bars, the money chain and the
     Step 1 rows. Gold counts a card once however many bureaus report it. */
  const topCards = (gold ? distinctCards(rankedRevolving(c)) : rankedRevolving(c)).slice(0, 2);
  // Gold: the utilization bars as one chart. Rows are [label, pct, detail].
  const barRows = [];
  const highBalance = "A high balance on a revolving card is what lenders read first.";
  let tankDrawn = false;
  if (hero) {
    const hTgt = targetBal(hero);
    const hPay = paydownAmt(hero);
    const heroLine = `Your ${esc(hero[0])} card holds ${esc(usd(hero[3]))}. Right now it is `
      + `${esc(hero[4] || "unknown")} full.`;
    /* Gold: the tank (DIAGRAM_SPEC 4.2) on the worst card with a known limit.
       It says "A nearly full card tells every lender 'I am maxed out.'", so it
       is drawn only for a card this report itself marks CRITICAL (80% or more
       in the mapper). And it draws the sentence above from its own sums; if
       those do not print the same words the table gave, the tank is left out
       rather than disagree with the table. */
    let tank = "";
    if (gold && String(hero[6] ?? "").toUpperCase() === "CRITICAL") {
      tank = utilizationTank(hero[0], parseMoney(hero[3]), parseMoney(hero[2]), hTgt, hPay);
      if (!tank.includes(heroLine)) tank = "";
    }
    if (tank) {
      /* The tank draws "Get it under the dotted line ..." itself, and its
         source note goes right under it, as gold p. 4. "A high balance ..."
         moves down to open the utilization paragraph: between the tank and its
         note it read as a heading for the bars. */
      h.push(tank);
      tankDrawn = true;
    } else {
      h.push(`<p><b>${heroLine}</b></p>`);
      if (!gold) h.push(svgPaydownBars(usd(hero[2]), hPay !== null ? usd(hPay) : "-", usd(hTgt)));
      h.push(`<p><b>${highBalance}</b><br>`
        + "<span style='font-size:9pt'>Get it under the dotted line and your score jumps. "
        + "Your pre-approval jumps with it.</span></p>");
    }
    h.push(`<div class="note">YOUR NUMBERS FROM THE TABLE ABOVE · ${esc(String(hero[0]).toUpperCase())} `
      + `ON ${esc(String(hero[1] || "").toUpperCase())}</div>`);
    for (const row of topCards) {
      const pct = parsePct(row[4]);
      if (pct === null) continue;
      const tgt = targetText(row);
      // F52. No target, no bar. The bar's whole caption is "pay down to <x>".
      if (tgt === null) continue;
      if (gold) barRows.push([barLabel(row[0]), pct, `${usd(row[2])} of ${usd(row[3])} · pay down to ${tgt}`]);
      else h.push(utilBar(row[0], `${usd(row[2])} of ${usd(row[3])} · pay down to ${tgt}`, pct));
    }
  }
  /* F52. An overall bar needs an overall percentage AND an overall target. On a
     file whose cards report no limit the engine gives neither, and drawing the
     bar anyway put it at 0% next to "pay down to under $0". */
  const overallPct = parsePct(c.util_pct);
  if (overallPct !== null && utilTotalsKnown(c)) {
    const overallSub = `${usd(c.util_total_balance)} of ${usd(c.util_total_limit)} · `
      + `pay down to under ${usd(c.util_target_balance)}`;
    /* Gold (DIAGRAM_SPEC 6): a single measured card gets no aggregate row. The
       total over one card with a known limit is that card again. */
    const measured = distinctCards(openRevolving(c)).filter((r) => limitState(r) === "known").length;
    if (!gold) h.push(utilBar("Overall revolving", overallSub, overallPct));
    else if (measured > 1) barRows.push(["Overall revolving", overallPct, overallSub]);
  }
  const dashedNote = `<div class="note">${esc(spaced("dashed line marks the 10% utilization threshold lenders look for"))}</div>`;
  if (!gold) h.push(dashedNote);
  else {
    // Unknown-limit cards never reach barRows; no known row, no chart, and no
    // caption about a dashed line that is not drawn.
    const bars = utilizationBars(barRows);
    if (bars) h.push(bars + dashedNote);
  }
  const utilPara = hero && utilTotalsKnown(c) && c.util_pct;
  if (tankDrawn && !utilPara) h.push(`<p><b>${highBalance}</b></p>`);
  if (utilPara) {
    // heroCard() only returns a card with a known target, so this never ends the
    // sentence at "Get that card to ."
    h.push(`<p>${tankDrawn ? `<b>${highBalance}</b> ` : ""}Right now you are using ${esc(c.util_pct)} of your available revolving credit -
      ${esc(usd(c.util_total_balance))} in balances against ${esc(usd(c.util_total_limit))} in limits.
      ${esc(hero[0])} is the highest-utilization card at ${esc(hero[4])}. Get that card to
      ${esc(targetText(hero))}. This is the fastest win on your
      entire report.</p>`);
  }
  if (utilTotalsKnown(c) && c.util_pct) {
    h.push(`${callout}TARGET: Get total revolving balances from `
      + `${esc(usd(c.util_total_balance))} down to under ${esc(usd(c.util_target_balance))}. `
      + `That moves you from ${esc(c.util_pct)} utilization to under 10%. That one move alone `
      + "can add 40-80 points to your score.</div>");
  }

  // 04 AU
  const au = c.au_account || {};
  h.push(section("04", "au accounts", "Authorized User (AU) Accounts"));
  /* F53. "But this one is not hurting you either. Leave it alone." was printed
     under an EMPTY table for every client with no authorized-user account. No
     AU row, no sentence about an AU row. */
  if (au.creditor) {
    h.push(table(["creditor", "bureau", "limit", "balance", "utilization", "age", "impact"],
      [[esc(au.creditor), esc(au.bureau), esc(usd(au.limit)), esc(usd(au.balance)),
        esc(au.util), esc(au.age), gold ? goldChip("NEUTRAL") : '<span class="tag open">NEUTRAL</span>']],
      [], opts));
    h.push("<p>AU accounts cannot help you get funded - lenders do not count them in funding "
      + "decisions. But this one is not hurting you either. Leave it alone.</p>");
  } else {
    h.push("<p>No authorized user accounts are listed on this file.</p>");
  }

  // 05 negatives
  h.push(PB);
  h.push(section("05", "negatives", "Negative Items - One by One"));
  const negatives = c.negatives || [];
  // Gold: no items, no empty table; the line under it says there are none.
  if (!gold || negatives.length) {
    h.push(table(["#", "creditor", "bureau", "type", "balance", "why it matters"],
      negatives.map((n) => [esc(n.n), esc(n.creditor), esc(n.bureau), esc(n.type),
        esc(n.balance), esc(n.why)]), [], opts));
  }
  if (negatives.length) {
    const sev = [...negatives].reverse()
      .map((n) => [n.n, String(n.creditor || "").slice(0, 22), n.type || "on file"]);
    /* Gold: the severity rail (DIAGRAM_SPEC 4.3). Each dot carries the item's
       own number in the table above. Position comes from this report's own
       ranking: the last item furthest left (hurts less), item one furthest
       right (fix first). Labels alternate above and below, strictly. No rail
       when: fewer than three items, more than RAIL_MAX (labels collide), an
       item with no number to match the table by, or a report that does not
       rank its items (reportRanksNegatives). */
    let rail = "";
    if (gold && sev.length <= RAIL_MAX && reportRanksNegatives(negatives)
      && sev.every(([num]) => num !== null && num !== undefined && num !== "")) {
      const k = sev.length;
      const byNum = [...negatives].reverse();
      rail = severityScale(sev.map(([num, , note], i) =>
        [num, railName(byNum[i].creditor, railBudget(k)), note, k > 1 ? 0.04 + (0.92 * i) / (k - 1) : 0.5,
          i % 2 === 0 ? "a" : "b"]));
    }
    // The rail draws "Your N negative items are not equally bad." itself.
    if (!rail) {
      h.push(`<p><b>Your ${esc(negatives.length)} negative item`
        + `${negatives.length !== 1 ? "s are" : " is"} not equally bad.</b></p>`);
    }
    if (rail) h.push(rail);
    else if (!gold && sev.length >= 2) h.push(svgSeverity(sev));
    const firstNeg = negatives[0];
    /* Gold: the rail draws "Start on the right. <item 1> hurts the most. Fix it
       first." itself, so "Start with ..." prints only when there is no rail,
       and the note about dot numbers only when there are dots. */
    if (!rail) h.push(`<p><b>Start with ${esc(firstNeg.creditor)} on ${esc(firstNeg.bureau)}.</b></p>`);
    if (!gold || rail) h.push('<div class="note">DOT NUMBERS MATCH THE TABLE ABOVE · ORDER FOLLOWS THIS REPORT</div>');
    for (const n of negatives) {
      const detail = n.detail || n.why || "This item is on the file. Dispute it first.";
      const head = `ITEM ${esc(n.n)} - ${esc(n.creditor)} - ${esc(n.type)} - `
        + `${esc(n.balance)} - ${esc(n.bureau)}`;
      // Gold: each item is its own panel, heading and paragraph, as gold p. 7-8.
      if (gold) h.push(`<div class="co"><h4 style="margin-top:0">${head}</h4><p>${esc(detail)}</p></div>`);
      else h.push(`<h3>${head}</h3><p>${esc(detail)}</p>`);
    }
  } else {
    h.push("<p><b>No derogatory items are listed on this file.</b></p>");
  }

  // 06 inquiries
  h.push(PB);
  h.push(section("06", "inquiries", "Inquiries - Cleanup Only. Zero Impact on Funding."));
  const important = "<b>IMPORTANT:</b> Inquiries do NOT affect your ability to get funded through "
    + "FundHub. This section is cleanup only.";
  // Gold: the note is the white bordered panel (.co.info), as gold p. 8.
  h.push(gold ? `<div class="co info">${important}</div>` : `<p>${important}</p>`);
  const inquiries = c.inquiries || [];
  h.push(gold && !inquiries.length ? NONE_ON_FILE : table(["bureau", "total inquiries", "priority for removal", "notes"],
    inquiries.map(([b, t, p, nt]) =>
      [esc(b), esc(t), gold ? goldChip(p) : `<span class="tag open">${esc(p)}</span>`, esc(nt)]),
    [], opts));
  /* Gold: a total summed from a list with no counts in it is not 0, it is
     unknown ("-"). The old look summed an empty list to 0. */
  const inqCounts = inquiries.filter((i) => known(i?.[1])).map((i) => Number(i[1]));
  const totalInq = gold && !inqCounts.length ? "-"
    : inquiries.reduce((sum, i) => sum + (Number(i[1]) || 0), 0);
  h.push(`<p>You have ${esc(totalInq)} total hard inquiries across the bureaus. Same-day clusters `
    + "are the easiest to dispute because creditors often cannot individually verify each "
    + "pull. Do not apply for new credit until your funding is secured.</p>");

  // 07 personal data
  h.push(section("07", "personal data", "Personal Data Cleanup"));
  const personal = c.personal_data || [];
  h.push(gold && !personal.length ? NONE_ON_FILE : table(["item", "issue", "action required", "priority"],
    personal.map(([i, iss, act, pr]) =>
      [esc(i), esc(iss), esc(act),
        gold ? goldChip(pr) : `<span class="tag ${pr === "HIGH" ? "solid" : "grey"}">${esc(pr)}</span>`]),
    [], opts));
  const highPd = personal.filter((p) => p[3] === "HIGH");
  if (highPd.length) {
    // Gold: the issue text carries no full stop, so the old callout ran on
    // into "Clean this up". One is added when the issue does not end a sentence.
    const issue = String(highPd[0][1] ?? "");
    const stop = gold && !/[.!?]\s*$/.test(issue) ? "." : "";
    h.push(callout + "URGENT - " + esc(issue) + stop
      + " Clean this up before you apply. Mismatched identity data can flag a file.</div>");
  }

  // 08 bottom line
  const now = Number(c.preapproval_now);
  const after = Number(c.preapproval_after);
  const delta = Number.isFinite(now) && Number.isFinite(after) ? after - now : null;
  h.push(PB);
  h.push(section("08", "bottom line", "The Bottom Line - Where You Are vs. Where You Are Going"));
  /* F52. "Your utilization penalty () is cutting your base approval hard" is
     an accusation built on a figure the file does not have. No percentage, no
     penalty sentence. */
  const nowBody = "This is what you qualify for right now."
    + (c.util_pct
      ? ` Your utilization penalty (${esc(c.util_pct)}) is cutting your base approval hard.`
      : "");
  /* Gold: Number(null) is 0, so the old look's delta turns two unknown
     amounts into "+$0". Unknown on either side is "-" here. */
  const nowKnown = parseMoney(c.preapproval_now);
  const afterKnown = parseMoney(c.preapproval_after);
  const goldDelta = nowKnown !== null && afterKnown !== null ? afterKnown - nowKnown : null;
  /* F53. "your two revolving cards" for a file that shows one, or five. */
  const afterBody = gold ? goldPayDownLine(c, nowKnown, afterKnown)
    : `${esc(payDownCardsLine(c))} That alone moves your pre-approval.`;
  const deltaBody = "Additional funding power. Just by moving balances.";
  if (gold) {
    h.push('<div class="mrow">'
      + metricCard("current pre-approval", usd(c.preapproval_now), "personal loan - starter band", nowBody)
      + metricCard("projected pre-approval", usd(c.preapproval_after), "after utilization fix", afterBody)
      + metricCard("the delta", goldDelta === null ? "-" : `+${usd(goldDelta)}`,
        "gained by paying down cards", deltaBody)
      + "</div>");
  } else {
    h.push('<div class="cards">' + [
      `<div class="card"><div class="lbl">${esc(spaced("current pre-approval"))}</div>`
      + `<div class="big">${esc(usd(c.preapproval_now))}</div>`
      + `<div class="sub">${esc(spaced("personal loan - starter band"))}</div>`
      + `<div class="body">${nowBody}</div></div>`,
      `<div class="card"><div class="lbl">${esc(spaced("projected pre-approval"))}</div>`
      + `<div class="big">${esc(usd(c.preapproval_after))}</div>`
      + `<div class="sub">${esc(spaced("after utilization fix"))}</div>`
      + `<div class="body">${afterBody}</div></div>`,
      `<div class="card"><div class="lbl">${esc(spaced("the delta"))}</div>`
      + `<div class="big">+${esc(usd(delta))}</div>`
      + `<div class="sub">${esc(spaced("gained by paying down cards"))}</div>`
      + `<div class="body">${deltaBody}</div></div>`
    ].join("") + "</div>");
  }

  const topTwo = topCards;
  const payBits = topTwo.map(paydownAmt).filter((v) => v !== null).map(usd);
  const payTotal = topTwo.reduce((sum, r) => sum + (paydownAmt(r) || 0), 0);
  const howLine = `How ${esc(payTotal ? usd(payTotal) : "a targeted paydown")} becomes `
    + `${esc(usd(delta))} more funding.`;
  const teach = "You are not paying to make the debt disappear. You are paying to change what lenders see.";
  const moneyNote = '<div class="note">EVERY FIGURE COMES FROM SECTIONS 03 AND 08 OF THIS REPORT</div>';
  if (gold) {
    /* Gold: the money chain (DIAGRAM_SPEC 4.4) in place of the HTML flow row,
       same four panels, same words. It draws the "How ..." line above it and
       the "You are not paying ..." line under it. Suppressed (DIAGRAM_SPEC 6)
       when projected is not above current, either is unknown, or no card has
       a paydown to its 10% target: then STEP 1 would read "see table" and
       "Cards drop under 10%" would describe a target the table says does not
       exist. Suppressed, the "How ..." line is its headline and goes with it,
       the source note too; the teaching line prints as page copy. */
    // A card already under its target pays down $0: not a step, not a "+ $0".
    const goldBits = topTwo.map(paydownAmt).filter((v) => v !== null && v > 0).map(usd);
    const chain = nowKnown !== null && afterKnown !== null && afterKnown > nowKnown && goldBits.length
      ? moneyChain([
        ["STEP 1", "Pay down cards", goldBits.join(" + ")],
        ["WHAT CHANGES", "Cards drop under 10%",
          c.util_pct ? `utilization falls from ${c.util_pct}` : "utilization falls"],
        ["WHAT LENDERS SEE", "Score jumps", "+40 to 80 points"],
        ["WHAT YOU GET", "Pre-approval jumps",
          `${usd(c.preapproval_now)} becomes ${usd(c.preapproval_after)}`]
      ], `How ${usd(payTotal)} becomes ${usd(goldDelta)} more funding.`, teach)
      : "";
    if (chain) h.push(chain + moneyNote);
    else h.push(`<p><b>${teach}</b></p>`);
  } else {
    h.push(`<p><b>${howLine}</b></p>`);
    h.push(`
<div class="flowrow">
  <div class="flowbox"><div class="fl">STEP 1</div><div class="ft">Pay down cards</div>
      <div class="fs">${esc(payBits.length ? payBits.join(" + ") : "see table")}</div></div>
  <div class="flowarrow">&#10132;</div>
  <div class="flowbox"><div class="fl">WHAT CHANGES</div><div class="ft">Cards drop under 10%</div>
      <div class="fs">${c.util_pct ? `utilization falls from ${esc(c.util_pct)}` : "utilization falls"}</div></div>
  <div class="flowarrow">&#10132;</div>
  <div class="flowbox"><div class="fl">WHAT LENDERS SEE</div><div class="ft">Score jumps</div>
      <div class="fs">+40 to 80 points</div></div>
  <div class="flowarrow">&#10132;</div>
  <div class="flowbox hl"><div class="fl">WHAT YOU GET</div><div class="ft">Pre-approval jumps</div>
      <div class="fs">${esc(usd(c.preapproval_now))} becomes ${esc(usd(c.preapproval_after))}</div></div>
</div>
<p><b>${teach}</b></p>
${moneyNote}`);
  }

  const stages = [
    ["Right Now", "Apply for personal loan funding", "None needed",
      `${usd(c.preapproval_now)} available today`]
  ];
  for (const row of topCards) {
    stages.push([
      "Step 1 - Fast Win",
      // F52. This used to end at "from $5,200 to " for a card with no limit.
      paydownSentence(row),
      "Utilization drop",
      `Pre-approval target ${usd(c.preapproval_after)}`
    ]);
  }
  for (const n of negatives.slice(0, 3)) {
    /* Gold: the item's type is not a score impact and its "why it matters" is
       not a funding impact. The file states neither impact, so both cells read
       "-". The type and the why are in the negatives table in section 05. */
    stages.push([
      "Step 2 - Repair",
      `Dispute ${n.creditor} on ${n.bureau}`,
      gold ? "-" : n.type || "If removed",
      gold ? "-" : n.why || "Cleans the file"
    ]);
  }
  if (personal.length) {
    stages.push([
      "Step 3 - Polish",
      "Clean up identity mismatches across bureaus",
      "Prevents denial flags",
      "Removes application friction"
    ]);
  }
  stages.push([
    "After Funding", "Form LLC and build business credit profile", "N/A personal",
    "Unlocks business funding"
  ]);
  h.push(table(["stage", "action", "score impact", "funding impact"],
    stages.map((r) => r.map(esc)), [], opts));
  // F53. Only the repairs this file actually needs are named as repairs.
  const repairMeans = fullRepairMeans(c);
  if (gold) {
    /* Gold p. 11: the after-repair paragraph in the spectrum-edged panel, the
       call to action in the white bordered one. The booking link is the real
       page (owner-set 2026-09-17), never client.booking_url, which on the
       sample file is the dead www.fundhubbookingurl.template. */
    /* Each claim prints only where this file does not contradict it. "moves
       from X toward 700+" needs a known Experian score under 700 and something
       for "full repair" to mean (academy's 762 and no-limit's 700 read "moves
       from 762 toward 700+"). "At that level ... up to $40,000+" rides on that
       sentence and is left out on a file already pre-approved for $40,000 or
       more (academy: $199,350 on the same page). The last two sentences hold
       for every file. The words themselves are unchanged. */
    const expN = known(s.experian) ? Number(s.experian) : null;
    const toward = Boolean(repairMeans) && expN !== null && expN < 700;
    const unlock = toward && ![nowKnown, afterKnown].some((v) => v !== null && v >= 40000);
    h.push(`<div class="co up">${toward ? `After full repair - ${esc(repairMeans)} - your Experian score
      moves from ${esc(expN)} toward 700+. ` : ""}${unlock ? `At that level you unlock
      premium cards, SBA 7(a) loans, and personal loans up to $40,000+. ` : ""}The gap between where you
      are and where you could be is not years of waiting. It is targeted action on a short list.</div>
      <div class="co info">Ready to move? Book your strategy call at ${bookLink()}.</div>`);
  } else {
    h.push(`<p>After full repair${repairMeans ? ` - ${esc(repairMeans)}` : ""} - your Experian score
      moves from ${esc(s.experian ?? "")} toward 700+. At that level you unlock
      premium cards, SBA 7(a) loans, and personal loans up to $40,000+. The gap between where you
      are and where you could be is not years of waiting. It is targeted action on a short list.</p>
      <p>Ready to move? Book your strategy call at ${esc(c.booking_url)}.</p>`);
  }

  h.push(ctaPage(c, opts));
  return h.join("");
}
