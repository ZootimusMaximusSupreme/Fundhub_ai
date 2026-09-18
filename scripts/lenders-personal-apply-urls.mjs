#!/usr/bin/env node
/* Put the right apply link and the right state list on the PERSONAL rows.
   ---------------------------------------------------------------------------
   WHAT THIS IS FOR, in plain words.

   The book has 21 personal rows — 15 personal credit cards and 6 personal
   loans. Seven of them pointed at a BUSINESS application. A client sent to
   the "Chase Sapphire Preferred" row landed on the Chase Ink business card
   page. Bank of America's personal cash-back card row opened Bank of
   America's small-business card promotion. Wells Fargo's Reflect card row
   opened Signify, which is a business card.

   The state lists were wrong for the same reason. These are national consumer
   cards — anyone in any state can apply for a Chase Sapphire Preferred. The
   rows said "TX" for Chase, "DC,WV" for Wells Fargo, and US Bank's 26-state
   BRANCH footprint for two US Bank cards that are sold online nationwide. The
   matcher reads `eligible_states` and nothing else, so those lists were
   hiding real cards from clients who qualify for them.

   This fixes both columns on those rows, and adds the one personal loan
   lender the book is missing.

   ---------------------------------------------------------------------------
   THE RULES IT FOLLOWS.

   1. IT ONLY WRITES TWO COLUMNS. `application_url` and `eligible_states`.
      Every other column is read out of the database and written straight back
      unchanged, which is what makes the loader's clearing guard report zero.
   2. IT NEVER INVENTS A LINK. Every URL below was fetched and returned 200 on
      the date in VERIFIED_ON. A page that 404s is not written.
   3. IT ONLY TOUCHES PERSONAL ROWS. The four business product tables are not
      read and not written. Nothing here can reach the 1,074 business rows.
   4. IT TOUCHES NO DATABASE. It writes a spreadsheet. The existing loader
      (scripts/lenders-import-alec.mjs) is what writes to the database, so the
      dry run, the partial-sheet guard and the clearing guard all still apply.

   ---------------------------------------------------------------------------
   TWO ROWS THAT HAVE NO APPLY PAGE, ON PURPOSE.

   The Personal Loans page says: "Begin with current bank relationships such as
   Wells Fargo, Chase, and Bank of America" and then "Not all banks offer
   personal loans; check their personal section for available options."

   Wells Fargo does offer one, so that row gets the real personal-loan page.
   Chase and Bank of America do not sell a consumer personal loan at all —
   every candidate apply page returns 404. Those two rows get the bank's
   PERSONAL site, which is what the page tells the client to go and check. A
   made-up apply URL would read on the screen as a real one.

   ---------------------------------------------------------------------------
   HOW TO RUN IT.

     node --env-file=.env scripts/lenders-personal-apply-urls.mjs
         Dry run. Reads the database, writes nothing, prints every change.

     node --env-file=.env scripts/lenders-personal-apply-urls.mjs --confirm
         Writes the spreadsheet.

   Then load it:

     node --env-file=.env scripts/lenders-import-alec.mjs \
       --file credentials/lenders-audit/lenders-personal-urls.csv
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, close } from "../src/db.mjs";
import { LENDER_CSV_COLUMNS, PERSONAL_LENDER_TABLES } from "../src/lenders/tables.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "credentials/lenders-audit/lenders-personal-urls.csv");

const CONFIRM = process.argv.includes("--confirm");
const SLUG = process.env.DEFAULT_ORG_SLUG || "fundhub";

/** The day every URL in this file was fetched and answered 200. */
const VERIFIED_ON = "2026-09-18";

/* National. The matcher turns this exact string into a "national" footprint —
   see lenderFootprint() in src/lenders/match.mjs. */
const NATIONAL = "All States";

/* ────────────────────────── THE CORRECTIONS ──────────────────────────
   Keyed by the row's id from the original book, which is what the loader
   matches on. `url` is the consumer apply or product page. `states` is the
   footprint of the PRODUCT, not of the bank's branches. */
const FIX = {
  /* ---- Personal credit cards ---- */

  /* The tips on this row say "$95 annual fee (free first year)", which is Blue
     Cash PREFERRED. Blue Cash Everyday has no annual fee. */
  "PERSONAL-PERSONALCC-AMERICAN-EXPRESS-BLUE-CASH": {
    url: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-AMERICAN-EXPRESS-DELTA-GOLD": {
    url: "https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-gold-american-express-card/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-AMERICAN-EXPRESS-HILTON-HONORS": {
    url: "https://www.americanexpress.com/us/credit-cards/card/hilton-honors/",
    states: NATIONAL
  },
  /* Came off the "High limit personal cards" page. Brilliant is the high-limit
     Bonvoy card American Express issues; Bevy is the mid-tier one. */
  "PERSONAL-PERSONALCC-AMERICAN-EXPRESS-MARRIOTT-BONVOY": {
    url: "https://www.americanexpress.com/us/credit-cards/card/marriott-bonvoy-brilliant/",
    states: NATIONAL
  },
  /* Was pointing at Bank of America's SMALL BUSINESS card promotion. */
  "PERSONAL-PERSONALCC-BANK-OF-AMERICA-CUSTOMIZED-CASH-REWARDS": {
    url: "https://www.bankofamerica.com/credit-cards/products/cash-back-credit-card/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-CAPITAL-ONE-VENTURE-X": {
    url: "https://www.capitalone.com/credit-cards/venture-x/",
    states: NATIONAL
  },
  /* These three were all pointing at the Chase INK business card. */
  "PERSONAL-PERSONALCC-CHASE-FREEDOM": {
    url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-CHASE-SAPPHIRE-PREFERRED": {
    url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-CHASE-SAPPHIRE-RESERVE": {
    url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-CITI-SIMPLICITY-CARD": {
    url: "https://www.citi.com/credit-cards/citi-simplicity-credit-card",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-DISCOVER-IT": {
    url: "https://www.discover.com/credit-cards/cash-back/it-card/",
    states: NATIONAL
  },
  /* Discover retired the per-card balance transfer page; this is the live
     balance-transfer card page it redirects to. */
  "PERSONAL-PERSONALCC-DISCOVER-IT-BALANCE-TRANSFER-CARD": {
    url: "https://www.discover.com/credit-cards/balance-transfer-credit-cards/",
    states: NATIONAL
  },
  /* Both US Bank rows carried usbank.com/index.html and the bank's 26-state
     branch footprint. The cards themselves are sold online in every state. */
  "PERSONAL-PERSONALCC-US-BANK-ALTITUDE-GO": {
    url: "https://www.usbank.com/credit-cards/altitude-go-visa-signature-credit-card.html",
    states: NATIONAL
  },
  "PERSONAL-PERSONALCC-US-BANK-CASH": {
    url: "https://www.usbank.com/credit-cards/cash-plus-visa-signature-credit-card.html",
    states: NATIONAL
  },
  /* Was pointing at Signify, which is a Wells Fargo BUSINESS card. */
  "PERSONAL-PERSONALCC-WELLS-FARGO-REFLECT-CARD": {
    url: "https://creditcards.wellsfargo.com/reflect-visa-credit-card/",
    states: NATIONAL
  },

  /* ---- Personal loans ---- */

  /* No consumer personal loan exists at these two. See the note up top. */
  "PERSONAL-PERSONALLOANS-BANK-OF-AMERICA": {
    url: "https://www.bankofamerica.com/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALLOANS-CHASE": {
    url: "https://www.chase.com/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALLOANS-LIGHTSTREAM": {
    url: "https://www.lightstream.com/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALLOANS-SOFI": {
    url: "https://www.sofi.com/personal-loans/",
    states: NATIONAL
  },
  "PERSONAL-PERSONALLOANS-UPSTART": {
    url: "https://www.upstart.com/personal-loans",
    states: NATIONAL
  },
  "PERSONAL-PERSONALLOANS-WELLS-FARGO": {
    url: "https://www.wellsfargo.com/personal-loans/",
    states: NATIONAL
  }
};

/* ────────────────────────── ROWS TO ADD IF ABSENT ──────────────────────────
   Owner-named, 2026-09-18. Only added when the id is not already in the
   database — this never overwrites a row someone has since filled in.

   `bureaus_pulled` is left empty because we have not seen this lender on a
   client's credit report yet, and empty means unknown. Guessing a bureau is
   the one thing the bureau pass refuses to do, for the same reason. */
const ADD_IF_ABSENT = [
  {
    lender_table: "PersonalLoans",
    name: "Happy Money",
    product_name: "Happy Money Personal Loan",
    application_url: "https://happymoney.com/personal-loans",
    eligible_states: NATIONAL,
    active: "true",
    notes: `Added by name on ${VERIFIED_ON} (owner-named). National personal loan lender. `
      + "Apply page verified live that day. No bureau on file yet.",
    external_row_id: "PERSONAL-PERSONALLOANS-HAPPY-MONEY"
  }
];

/* The loader works logo_path out itself from the logo files on disk, so it is
   the one column the sheet is allowed to leave out. Everything else has to be
   there or the loader refuses the file. */
const HEADER = LENDER_CSV_COLUMNS.filter((c) => c !== "logo_path");

function escapeCsv(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** A database value as the sheet should carry it. Booleans as words, so the
    loader reads `active` back as the same true it started as. */
function cell(v) {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

async function main() {
  const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [SLUG]);
  const orgId = org.rows[0]?.id;
  if (!orgId) {
    console.error("No company with the short name", SLUG);
    process.exitCode = 1;
    return;
  }

  const current = await db.query(
    `SELECT ${HEADER.join(", ")}
       FROM lenders
      WHERE org_id = $1::uuid AND lender_table = ANY($2::lender_table[])
      ORDER BY lender_table, name, product_name`,
    [orgId, PERSONAL_LENDER_TABLES]
  );

  console.log("Company            :", SLUG);
  console.log("Personal rows found:", current.rows.length);
  console.log("Links verified on  :", VERIFIED_ON);
  console.log("");

  const out = [];
  const changed = [];
  const alreadyRight = [];
  const noRule = [];

  for (const row of current.rows) {
    const rule = FIX[row.external_row_id];
    if (!rule) {
      noRule.push(row);
      continue;                       // not named — leave it completely alone
    }
    const urlWas = row.application_url;
    const statesWas = row.eligible_states;
    const next = { ...row, application_url: rule.url, eligible_states: rule.states };
    out.push(next);
    if (urlWas === rule.url && statesWas === rule.states) {
      alreadyRight.push(row);
      continue;
    }
    changed.push({
      label: row.product_name || row.name,
      table: row.lender_table,
      url: urlWas === rule.url ? null : { from: urlWas, to: rule.url },
      states: statesWas === rule.states ? null : { from: statesWas, to: rule.states }
    });
  }

  /* Anything named in FIX that is not in the database. A typo in an id would
     otherwise fix nothing and say nothing. */
  const haveIds = new Set(current.rows.map((r) => r.external_row_id));
  const missingIds = Object.keys(FIX).filter((id) => !haveIds.has(id));

  const added = [];
  for (const row of ADD_IF_ABSENT) {
    if (haveIds.has(row.external_row_id)) continue;
    out.push(row);
    added.push(row);
  }

  console.log("Rows the sheet carries:", out.length);
  console.log("  changed            :", changed.length);
  console.log("  already correct    :", alreadyRight.length);
  console.log("  added as new       :", added.length);
  console.log("  personal rows left alone (no rule):", noRule.length);
  console.log("");

  if (changed.length) {
    console.log("EVERY CHANGE:");
    for (const c of changed) {
      console.log(`\n  [${c.table}] ${c.label}`);
      if (c.url) {
        console.log(`     apply link was: ${c.url.from || "(empty)"}`);
        console.log(`     apply link now: ${c.url.to}`);
      }
      if (c.states) {
        console.log(`     states were   : ${c.states.from || "(empty)"}`);
        console.log(`     states now    : ${c.states.to}`);
      }
    }
    console.log("");
  }

  if (added.length) {
    console.log("ROWS ADDED (were not in the book):");
    for (const a of added) {
      console.log(`  [${a.lender_table}] ${a.product_name} — ${a.application_url}`);
    }
    console.log("");
  }

  if (noRule.length) {
    console.log("Personal rows with no rule here — not in the sheet, not touched:");
    for (const r of noRule) console.log(`  [${r.lender_table}] ${r.product_name || r.name}`);
    console.log("");
  }

  if (missingIds.length) {
    console.log("Named here but NOT in the database — nothing to fix, check the id:");
    for (const id of missingIds) console.log("  " + id);
    console.log("");
  }

  const csv = [HEADER.join(",")];
  for (const r of out) csv.push(HEADER.map((c) => escapeCsv(cell(r[c]))).join(","));
  const csvText = csv.join("\n") + (out.length ? "\n" : "");

  console.log("Columns written:", HEADER.length, "of", LENDER_CSV_COLUMNS.length,
    "(logo_path is filled by the loader from the logo files on disk)");
  console.log("");

  if (!CONFIRM) {
    console.log("DRY RUN. Nothing was written. Add --confirm to write:");
    console.log("  " + path.relative(ROOT, OUT_FILE));
    return;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, csvText);
  console.log("Written:");
  console.log("  " + path.relative(ROOT, OUT_FILE));
  console.log("");
  console.log("Load it with:");
  console.log("  node --env-file=.env scripts/lenders-import-alec.mjs \\");
  console.log("    --file credentials/lenders-audit/lenders-personal-urls.csv");
  console.log("(dry run — add --confirm when the numbers look right)");
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => close());
