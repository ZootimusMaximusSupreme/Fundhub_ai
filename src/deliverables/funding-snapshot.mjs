// DOCUMENT 2 — Capital Readiness Snapshot (funding snapshot).
// Ported from scripts/black-reports/fundhub_gen.py:1100-1202. Six numbered
// sections: numbers, breakdown, costing you, not a factor, after optimization,
// next step.
//
// TWO LOOKS (2026-09-17). With no `opts` this prints the older printer's markup
// byte for byte (port-parity.test.mjs pins it). With `{ look: "gold" }` it draws
// the gold pack (docs/workflows/gold-deliverables-v5/funding_snapshot.pdf): the
// gold cover, closing panel and tables, the gold waterfall chart in 01, the
// numbered cost items in 03, the cleanup items in 04 and the callout in 06.
// The words are the same in both looks. Gold only changes the drawing.

import { esc } from "./escape.mjs";
import { usd, median, moneyRange, parsePct } from "./format.mjs";
import { rankedRevolving, targetText, fastestWins, lenderBuckets, utilTotalsKnown,
  payDownCardsLine, paydownAmt, openRevolving, paydownCards, plainRating } from "./derive.mjs";
import { cover, ctaPage, section, table, PB, isGold, BOOK_CALL_URL } from "./chrome.mjs";
import { svgWaterfall } from "./charts.mjs";
import { waterfall } from "./gold-charts.mjs";

/** Python str.title() — the status tag on each card in section 02. */
function titleCase(s) {
  return String(s ?? "").toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** The entity's own name when the file carries one, else a neutral noun. */
function entityName(client) {
  return String(client?.business?.name || "").trim() || "A business entity";
}

/* ------------------------------------------------------------ gold look -- */

/**
 * A dollar figure the file actually states, else null. Number(null) is 0 and
 * Number("") is 0, so an unknown pre-approval would otherwise draw as a real
 * $0 bar. Unknown is not zero.
 */
function knownNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * One line of the builder's text per sentence, the way the gold pack sets its
 * cost items. The split falls only between sentences — after a period that
 * closes a lowercase word, a number or a percent, before a capital, a digit or
 * a dollar sign — so no sentence is ever cut and no word changes. "U.S. Bank"
 * stays on one line.
 */
function sentences(s) {
  return String(s ?? "").split(/(?<=[a-z0-9%)]\.)\s+(?=[A-Z0-9$])/).filter(Boolean);
}

/**
 * The gold numbered cost item (fundhub_pdf_template.py r_cost): the number, a
 * bold title, then the lines. With no number it is the gold 04 cleanup item.
 * Lines are joined with a line break so the page text still reads as prose.
 */
function goldCost(num, title, lines) {
  const n = num === null ? "" : `<div class="cnum">${esc(num)}</div>`;
  return `<div class="cost">${n}<div class="cbody"><div class="ctitle">${esc(title)}</div>\n`
    + lines.map((l) => `<div class="cline">${esc(l)}</div>`).join("\n") + "</div></div>";
}

/* The gold sheet's three chip weights (fundhub_pdf_template.py SOLID / MID /
   OUTLINE). A status cell whose whole text is one of these is drawn as a chip.
   The text inside the chip is the cell's own text, unchanged. */
const CHIP_SOLID = new Set(["DIRTY", "CRITICAL", "URGENT", "CHARGE-OFF", "60-DAY LATES",
  "120-DAY LATES"]);
const CHIP_MID = new Set(["HIGH", "MEDIUM"]);
const CHIP_LINE = new Set(["CLEAN", "MONITOR", "CLOSED", "NEUTRAL", "OPEN", "PAID",
  "TRANSFERRED"]);

function goldCell(raw) {
  const s = String(raw ?? "");
  const up = s.trim().toUpperCase();
  const kind = CHIP_SOLID.has(up) ? "solid" : CHIP_MID.has(up) ? "mid"
    : CHIP_LINE.has(up) ? "line" : "";
  return kind ? `<span class="chip ${kind}">${esc(s.trim())}</span>` : esc(s);
}

/** An account table row (account, status, balance, notes), chips where gold has them. */
function goldAccountRow(r) {
  return r.map((cell, i) => (i === 1 || i === 3 ? goldCell(plainRating(cell)) : esc(cell)));
}

/**
 * ONE ROW PER ACCOUNT (F43, src/underwrite/black-report-client.mjs). A tri-merge
 * file carries every account once per bureau, so the tables, 03 and the wins
 * listed the same card two or three times, and the chart counted 9 cards for 3.
 * A row is dropped only when it matches an earlier row in every column but
 * `ignore` (the bureau, which none of these tables prints). Rows that differ in
 * anything the page shows are kept.
 */
function oneRowPerAccount(rows, ignore = -1) {
  const seen = new Set();
  return (rows || []).filter((r) => {
    if (!Array.isArray(r)) return true;
    const key = JSON.stringify(r.filter((_, i) => i !== ignore));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* A card's status flag is set by the mapper (black-report-client.mjs
   utilStatus): CLOSED only for a closed account, one of these for an open one. */
const OPEN_FLAGS = new Set(["CRITICAL", "HIGH", "MONITOR", "CLEAN"]);

/**
 * The gold Personal Cards row: STATUS is the account's state, UTILIZATION is the
 * percent with the flag beside it. The old row printed the flag in both columns.
 * The state is read from the file: CLOSED (or a utilization cell that says
 * closed) is "Closed", a flag only an open card gets is "Open", else "-".
 */
function goldCardRow([cr, , bal, lim, util, , st]) {
  const flag = String(st ?? "").trim().toUpperCase();
  const state = flag === "CLOSED" || /closed/i.test(String(util ?? "")) ? "Closed"
    : OPEN_FLAGS.has(flag) ? "Open" : "-";
  const chipFlag = flag && flag !== "CLOSED" ? ` ${goldCell(st)}` : "";
  return [esc(cr), goldCell(state), esc(usd(bal)), esc(usd(lim)), `${esc(util || "-")}${chipFlag}`];
}

/**
 * Does the file hold a card to pay down? A known utilization, a target and a
 * balance above it. The waterfall names its gain "UTILIZATION FIX", and a file
 * with no such card cannot back that label.
 */
function hasPaydown(client) {
  return openRevolving(client).some((r) =>
    parsePct(r.length > 4 ? r[4] : null) !== null && (paydownAmt(r) ?? 0) > 0);
}

/** A category with nothing in it: one honest line, not a header-only table. */
const NONE_ON_FILE = "<p>None on file.</p>";

/* The 06 warning, one string for both looks so neither can drift. */
const WARN_TITLE = "Do NOT open new accounts before funding.";
const WARN_BODY = "Every new card or loan drops your average account age and can trigger "
  + "automatic declines. Lock in your funding first. Build after.";

export function buildFundingSnapshot(client, opts = {}) {
  const gold = isGold(opts);
  const c = client || {};
  const med = median(c.scores || {});
  const now = Number(c.preapproval_now);
  const after = Number(c.preapproval_after);
  const nowK = knownNumber(c.preapproval_now);
  const afterK = knownNumber(c.preapproval_after);
  /* Gold: a gap is only worked out from two figures the file states. Number(null)
     is 0, so a file with no pre-approval at all used to print "$0 left on the
     table"; unknown prints "-". The default look keeps the old arithmetic. */
  const delta = gold
    ? (nowK !== null && afterK !== null ? afterK - nowK : null)
    : (Number.isFinite(now) && Number.isFinite(after) ? after - now : null);
  const hasEntity = !!c.business?.hasEntity;
  /* Gold reads the accounts one row per account (see oneRowPerAccount). The
     default look reads the file exactly as before, so it stays byte-identical. */
  const v = gold
    ? {
      ...c,
      revolving: oneRowPerAccount(c.revolving, 1),
      installments: oneRowPerAccount(c.installments),
      mortgages: oneRowPerAccount(c.mortgages),
      public_obligations: oneRowPerAccount(c.public_obligations)
    }
    : c;
  const h = [cover(c, "funding snapshot", "Capital Readiness Snapshot", opts)];
  // Gold: a missing score prints "-", never a blank cell.
  const scoreCell = (x) => (gold && (x === "" || x === null || x === undefined) ? "-" : x);
  /* Gold: the AFTER OPTIMIZATION score is the file's own target (score_targets),
     as the pdf-lib printer's afterScore() reads it, else "-". "700+ (projected)"
     was typed into the code and printed for every file, including one with no
     score at all and one whose score is already above 700. */
  const afterScore = (key) => {
    if (!gold) return "700+ (projected)";
    const t = String(c.score_targets?.[key] ?? "").trim();
    return t || "-";
  };

  // 01 numbers
  h.push(section("01", "numbers", "Your Numbers Right Now"));
  h.push(table(["", "today", "after optimization"], [
    ["Median Score", scoreCell(med), afterScore("median")],
    ["Experian Score", scoreCell(c.scores?.experian ?? ""), afterScore("experian")],
    ["Pre-Approval", usd(c.preapproval_now), usd(c.preapproval_after)],
    ["Funding Gap", "", `${usd(delta)} left on the table`]
  ].map((r) => r.map(esc)), [], opts));
  const CAPTION = '<div class="note">PERSONAL LOAN PRE-APPROVAL BAND · UNDERWRITEIQ</div>';
  /* Gold: is there a real gain to draw? Both figures on the file, projected
     above current. Also used by the closing line of 06. */
  const goldGain = nowK !== null && afterK !== null && nowK >= 0 && afterK > nowK;
  if (gold) {
    /* The gold waterfall (DIAGRAM_SPEC 4.8). Same three steps and labels the
       older chart drew. Suppressed (section 6) when either figure is not on the
       file, projected is not above current, or the file holds no card to pay
       down: the middle bar is labelled UTILIZATION FIX, and a file with no
       utilization figure cannot say the gain comes from one. The caption belongs
       to the chart, so it goes with it. */
    const chart = goldGain && hasPaydown(v)
      ? waterfall([
        ["TODAY", "Current pre-approval", nowK, "base"],
        // F53. The card count is the file's own, one per account, and it counts
        // the same cards the credit analysis counts: the ones with a balance to
        // pay down to a 10% target (or, when none has a target, the ones owed).
        ["UTILIZATION FIX", payDownCardsLine({ revolving: paydownCards(openRevolving(v)) }), afterK - nowK, "gain"],
        ["PROJECTED", "After optimization", afterK, "total"]
      ])
      : "";
    if (chart) h.push(chart + CAPTION);
  } else {
    h.push(svgWaterfall(usd(c.preapproval_now), `+${usd(delta)}`, usd(c.preapproval_after),
      [["TODAY", "Current pre-approval"],
        // F53. "Pay down two cards" for a file that shows one, or five.
        ["UTILIZATION FIX", payDownCardsLine(c)],
        ["PROJECTED", "After optimization"]]));
    h.push(CAPTION);
  }
  /* F53. "You are fundable right now. A personal loan is within reach today."
     was printed for every client, including one this file gives a pre-approval
     of nothing. src/underwrite/black-report-node.mjs prints its equivalent only
     when there is a gap to close; this asks the file the same two questions. */
  const fundableNow = Number.isFinite(now) && now > 0;
  const hasGap = Number.isFinite(delta) && delta > 0;
  if (fundableNow && hasGap) {
    h.push(`<p><b>You are fundable right now at ${esc(usd(c.preapproval_now))}. But you
      are leaving ${esc(usd(delta))} on the table by not fixing a few things first. The biggest fixes
      are fast.</b></p>`);
  } else if (fundableNow) {
    h.push(`<p><b>You are fundable right now at ${esc(usd(c.preapproval_now))}.</b></p>`);
  } else if (hasGap) {
    h.push(`<p><b>You are leaving ${esc(usd(delta))} on the table by not fixing a few things
      first. The biggest fixes are fast.</b></p>`);
  }

  // 02 breakdown
  h.push(section("02", "breakdown", "Breakdown by Category"));
  h.push("<h3>Personal Cards</h3>");
  const cardRows = gold ? (v.revolving || []).map(goldCardRow)
    : (c.revolving || []).map(([cr, , bal, lim, util, , st]) => {
      const cls = st === "CRITICAL" ? "tag solid" : (st === "HIGH" ? "tag grey" : "tag open");
      return [esc(cr), `<span class="tag open">${esc(titleCase(st))}</span>`, esc(usd(bal)),
        esc(usd(lim)), `${esc(util || "-")} <span class="${cls}">${esc(st)}</span>`];
    });
  /* Gold: a category with no rows says so in one line. The old look drew its
     column headers over nothing. */
  const catTable = (headers, rows) => (gold && !rows.length ? NONE_ON_FILE
    : table(headers, rows, [], opts));
  h.push(catTable(["account", "status", "balance", "limit", "utilization"], cardRows));
  /* F52. "Overall utilization: - This is your #1 problem right now" calls a
     figure the file does not have the client's biggest problem. No percentage,
     no verdict. */
  if (c.util_pct) {
    h.push(`<p><b>Overall utilization: ${esc(c.util_pct)} - This is your #1 problem right now.</b></p>`);
  }

  const accountRows = (rows) => (rows || []).map((r) => (gold ? goldAccountRow(r) : r.map(esc)));
  const ACCOUNT_COLS = ["account", "status", "balance", "notes"];
  h.push("<h3>Installment Loans</h3>");
  h.push(catTable(ACCOUNT_COLS, accountRows(v.installments)));
  h.push("<h3>Mortgage / Real Estate</h3>");
  h.push(catTable(ACCOUNT_COLS, accountRows(v.mortgages)));
  h.push("<h3>Child Support / Public Obligations</h3>");
  h.push(catTable(ACCOUNT_COLS, accountRows(v.public_obligations)));
  h.push("<h3>Business Accounts</h3>");
  /* F53. "No business entity on file" was printed even for a client whose file
     names one. The Node printer has always asked c.business first
     (src/underwrite/black-report-node.mjs businessLine()); this now does too. */
  h.push(hasEntity
    ? `<p>${esc(entityName(c))} is on file. The next step is the business credit profile: `
      + "an EIN, a dedicated business checking account, and vendor accounts that report.</p>"
    : "<p>No business entity on file. You are leaving a full suite of business funding "
      + "off the table. We cover how to fix this below.</p>");

  // 03 what is costing you money
  h.push(PB);
  h.push(section("03", "costing you", "What Is Costing You Money"));
  h.push("<p>Each item below is hurting your pre-approval. Fix them in this order.</p>");
  const costing = [];
  for (const row of rankedRevolving(v)) {
    const pct = parsePct(row[4]);
    if (pct === null || pct < 20) continue;
    const tgt = targetText(row);
    /* F52. No reported limit, so "on a $X limit" and a 10% target are both
       figures this file does not have. The row is dropped from a list whose
       whole point is a number to aim at. */
    if (tgt === null) continue;
    costing.push([
      `${row[0]} - ${row[4]} Utilization`,
      `You owe ${usd(row[2])} on a ${usd(row[3])} limit. Pay it down to ${tgt}.`
    ]);
  }
  if (c.util_pct && utilTotalsKnown(c)) {
    costing.push([
      `Overall Utilization - ${c.util_pct}`,
      `You are using ${usd(c.util_total_balance)} out of ${usd(c.util_total_limit)} in `
      + `available credit. Get total balances to ${usd(c.util_target_balance)} or less.`
    ]);
  }
  for (const n of c.negatives || []) {
    costing.push([
      `${n.creditor} - ${gold ? plainRating(n.type) : n.type} - ${n.balance} - ${n.bureau}`,
      n.why || n.detail || "Dispute this item first."
    ]);
  }
  if (!hasEntity) {
    costing.push([
      "No Business Entity Registered",
      "Without a business entity you cannot access business credit programs. Forming an LLC "
      + "unlocks a whole second tier of funding."
    ]);
  }
  if (gold) {
    // Gold pages 4-6: the number, the bold title, one line per sentence.
    h.push(costing.map(([t, d], i) => goldCost(String(i + 1), t, sentences(d))).join("\n"));
  } else {
    h.push('<div class="steps">' + costing.map(([t, d], i) =>
      `<div class="step"><div class="n">${i + 1}</div><div><div class="t">${esc(t)}</div>`
      + `<div class="small">${esc(d)}</div></div></div>`).join("") + "</div>");
  }

  // 04 what does not affect funding
  h.push(section("04", "not a factor", "What Does Not Affect Your Funding"));
  /* F53. Four of these five lines asserted something about this client's file —
     an authorized-user account, a charge-off, several addresses, several name
     spellings — and printed for every client whether or not the file held any
     of it. Each line now appears only when the row behind it is on the file.
     Each item is [bold lead, the rest], so both looks print the same words. */
  const notFactor = [["Inquiries.",
    "They do NOT affect funding decisions at FundHub. Cleanup only."]];
  if (c.au_account?.creditor) {
    notFactor.push(["Authorized user account.",
      "Cannot help your funding, but clean and not hurting you. Keep it."]);
  }
  const hasChargeOff = (c.negatives || [])
    .some((n) => String(n.type || "").toLowerCase().includes("charge"));
  notFactor.push(hasChargeOff
    ? ["Score alone.", "The charge-off and utilization hurt you more than the number itself."]
    : ["Score alone.", "What sits behind the number moves your funding more than the number"
      + " itself."]);
  const pdKinds = (c.personal_data || []).map((p) => String(p[0] || "").toLowerCase());
  if (pdKinds.some((k) => k.includes("address"))) {
    notFactor.push(["Multiple addresses.",
      "Does not block funding. Cleaned up by your personal info letters."]);
  }
  if (pdKinds.some((k) => k.includes("name"))) {
    notFactor.push(["Name variations.",
      "Does not block funding, but needs consolidating to your legal name."]);
  }
  if (gold) {
    // Gold page 6: a bold title, one line per sentence, a hairline under each.
    h.push(notFactor.map(([t, d]) => goldCost(null, t, sentences(d))).join("\n"));
  } else {
    h.push(`<ul class="plain">${notFactor.map(([t, d]) => `<li><b>${t}</b> ${d}</li>`).join("")}</ul>`);
  }

  // 05 after optimization
  h.push(PB);
  /* F45. "Where You Could Be" is the LOCKED list. It used to print every lender
     the matcher knew, including the ones already open today, so a client saw his
     own available lenders filed under "after optimization".
     src/underwrite/black-report-node.mjs:821 prints this section only when the
     locked bucket has something in it. */
  const [, locked] = lenderBuckets(c);
  if (locked.length) {
    h.push(section("05", "after optimization", "Where You Could Be - After Optimization"));
    const lenderRows = locked.map(([nm, , typ, lo, hi, sc, tib]) => {
      const need = tib === null || tib === undefined ? `Score ${sc}+` : `LLC + Score ${sc}+`;
      return [esc(nm), esc(typ), esc(moneyRange(lo, hi)), esc(need)];
    });
    h.push(table(["lender", "type", "est. range", "what you need"], lenderRows, [], opts));
  }

  // 06 next step
  h.push(section("06", "next step", "Your Next Step"));
  const wins = fastestWins(v);
  if (gold) {
    /* Gold: the heading and the list print only when there is a win to list. */
    h.push(`<div class="co"><div class="ct">${WARN_TITLE}</div>\n<div class="cb">${WARN_BODY}</div></div>`);
    if (wins.length) {
      h.push("<p><b>Your fastest wins:</b></p>"
        + '<ol class="fh-ol">' + wins.map((w) => `<li>${esc(w)}</li>`).join("") + "</ol>");
    }
  } else {
    h.push(`<p><b>${WARN_TITLE}</b> ${WARN_BODY}</p><p><b>Your fastest wins:</b></p>`);
    h.push('<ul class="plain">' + wins.map((w) => `<li>${esc(w)}</li>`).join("") + "</ul>");
  }
  /* F53. "Those three moves alone can push your score past 680 and your
     pre-approval past $15,000" printed under a list of one move, for a client
     whose median score was already 700 and whose pre-approval was already
     $50,000. The count is the list's own, and the two figures are this file's
     own projected ones.
     Gold: the line also needs a gain to take the client toward (not "$0 toward
     $0"), and every listed win must be a real move. A card with no target is
     listed as "there is no 10% target to pay down to", which moves nothing.
     fastestWins() lists the top two ranked cards, then a dispute. */
  const allMoves = rankedRevolving(v).slice(0, 2).every((r) => (paydownAmt(r) ?? 0) > 0);
  if (wins.length && (!gold || (goldGain && allMoves))) {
    h.push(`<p>${esc(wins.length === 1
      ? "That one move is what takes"
      : `Those ${wins.length} moves are what take`)} `
      + `your pre-approval from ${esc(usd(c.preapproval_now))} toward `
      + `${esc(usd(c.preapproval_after))}.</p>`);
  }
  if (gold) {
    /* The gold pack's last body block before the closing panel. Its link was the
       dead www.fundhubbookingurl.template; it is the owner-set booking page. */
    h.push(`<div class="co info"><div class="cb">Book your strategy call now: `
      + `<a href="${esc(BOOK_CALL_URL)}">${esc(BOOK_CALL_URL.replace(/^https:\/\//, ""))}</a>.`
      + "</div></div>");
  }
  h.push(ctaPage(c, opts));
  return h.join("");
}
