#!/usr/bin/env node
/* Write the national personal-loan lenders out as PersonalLoans rows.
   ---------------------------------------------------------------------------
   WHAT THIS IS FOR, in plain words.

   The book's personal-loan section came out of five Notion pages, and those
   pages only ever named seven places: Bank of America, Chase, Happy Money,
   LightStream, SoFi, Upstart and Wells Fargo. The lenders an advisor would
   actually reach for first — Best Egg, Upgrade, Discover, Prosper and the big
   credit unions — were not on any of those pages, so they were never in the
   book.

   This adds them. Each one was looked up on the lender's own website in
   September 2026 and the apply link was loaded to check it answers.

   ---------------------------------------------------------------------------
   THE RULES IT FOLLOWS, same as the Notion personal pass.

   1. IT NEVER GUESSES A BUREAU. Which bureau a lender checks comes from the
      credit checks we have actually seen on client reports
      (docs/legacy-strong/inquiry-master-database.csv), read by exactly the
      same reader the bureau pass uses. A lender that file has no firm opinion
      on gets a blank bureau, and blank means unknown.
   2. IT NEVER GUESSES A STATE LIST. `eligible_states` is filled only where the
      lender publishes the list itself, or where every source agrees. Where
      sources disagree the cell is left empty — the matcher shows an empty
      cell to everyone, which is the safe direction to be wrong in.
   3. IT ADDS NOTHING THAT IS CLOSED. A lender that has stopped writing new
      personal loans is not a lender. Marcus, Laurel Road and Figure are
      listed at the end and written nowhere.
   4. IT WRITES THE WHOLE BOOK SHAPE, every column the database knows, so the
      loader cannot blank out a column it never saw.
   5. IT TOUCHES NO DATABASE.

   ---------------------------------------------------------------------------
   HOW TO RUN IT.

     node scripts/lenders-add-personal-loans.mjs            <- dry run
     node scripts/lenders-add-personal-loans.mjs --confirm  <- writes the file

   Then load the file it writes with scripts/lenders-import-alec.mjs --file.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LENDER_CSV_COLUMNS } from "../src/lenders/tables.mjs";
import { readInquiries, resolveInstitution, sortBureaus, toBookText, escapeCsv } from "./lenders-extract-bureaus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "credentials/lenders-audit/lenders-personal-loans-web.csv");
const CONFIRM = process.argv.includes("--confirm");

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

/** Every state but these. The lender publishes the short list, not the long one. */
function allBut(...excluded) {
  const drop = new Set(excluded);
  for (const s of excluded) {
    if (!STATES.includes(s)) throw new Error("Not a state code: " + s);
  }
  return STATES.filter((s) => !drop.has(s)).join(", ");
}

/* The book already holds these seven under PersonalLoans. None of them is
   written again — see the duplicate guard in main(). */
const ALREADY_IN_BOOK = [
  "Bank of America", "Chase", "Happy Money", "LightStream", "SoFi", "Upstart", "Wells Fargo"
];

/* Looked up on each lender's own website, September 2026. `states` empty means
   the sources disagreed and we are not going to pick one. */
const LENDERS = [
  {
    name: "Best Egg",
    product: "Best Egg Personal Loan",
    url: "https://www.bestegg.com/personal-loans/",
    states: allBut("IA", "VT", "WV"),
    prequal: "yes",
    source: "bestegg.com help centre — not available in Iowa, Vermont, West Virginia, DC or the US territories"
  },
  {
    name: "Upgrade",
    product: "Upgrade Personal Loan",
    url: "https://www.upgrade.com/personal-loans/",
    states: "",
    prequal: "yes",
    source: "upgrade.com — soft-pull rate check. State list left empty on purpose: published lists disagree (all 50 but DC, vs also excluding Iowa and West Virginia)"
  },
  {
    name: "Happen Bank",
    product: "Happen Bank Personal Loan (formerly LendingClub)",
    url: "https://www.happen.com/personal-loan",
    states: "All States",
    prequal: "yes",
    source: "happen.com — LendingClub renamed itself Happen Bank on 22 June 2026. Its own FAQ: applications accepted from all US states and Washington DC, not the territories"
  },
  {
    name: "Discover",
    product: "Discover Personal Loan",
    url: "https://www.discover.com/personal-loans/",
    states: "All States",
    prequal: "yes",
    source: "discover.com — all 50 states and DC, no fees, soft-pull rate check"
  },
  {
    name: "Prosper",
    product: "Prosper Personal Loan",
    url: "https://www.prosper.com/personal-loans",
    states: allBut("IA", "ND", "WV"),
    prequal: "yes",
    source: "prosper.com/legal/compliance — available in all US states except Iowa, North Dakota and West Virginia"
  },
  {
    name: "Universal Credit",
    product: "Universal Credit Personal Loan",
    url: "https://www.universal-credit.com/personal-loans/",
    states: "",
    prequal: "yes",
    source: "universal-credit.com — the fair-credit brand operated by Upgrade, Inc. State list not published"
  },
  {
    name: "PenFed Credit Union",
    product: "PenFed Personal Loan",
    url: "https://www.penfed.org/personal-loans",
    states: "All States",
    prequal: "yes",
    source: "penfed.org — federally chartered, lends in all 50 states and DC. Membership is opened during the application with a $5 share deposit"
  },
  {
    name: "Navy Federal Credit Union",
    product: "Navy Federal Personal Expense Loan",
    url: "https://www.navyfederal.org/loans-cards/personal-loans.html",
    states: "All States",
    prequal: "",
    source: "navyfederal.org — all 50 states, but membership is limited to the armed forces, the Department of Defense, veterans and their families. No prequalification offered"
  },
  {
    name: "Avant",
    product: "Avant Personal Loan",
    url: "https://www.avant.com/personal-loans",
    states: "",
    prequal: "yes",
    source: "avant.com — soft-pull rate check. State list left empty on purpose: published lists disagree on whether Massachusetts and Washington are excluded"
  },
  {
    name: "OneMain Financial",
    product: "OneMain Personal Loan",
    url: "https://www.onemainfinancial.com/personal-loans/",
    states: allBut("AK", "AR", "CT", "MA", "RI", "VT"),
    prequal: "yes",
    source: "onemainfinancial.com/legal/our-lending-process — 44 states; not Alaska, Arkansas, Connecticut, DC, Massachusetts, Rhode Island, Vermont or the territories"
  },
  {
    name: "LendingPoint",
    product: "LendingPoint Personal Loan",
    url: "https://www.lendingpoint.com/",
    states: allBut("CT", "IA", "MD", "ME", "NE", "NV", "VT", "WV"),
    prequal: "yes",
    source: "lendingpoint.com/faqs — 42 states; not Connecticut, Iowa, Maryland, Maine, Nebraska, Nevada, Vermont, West Virginia or DC"
  },
  {
    name: "Rocket Loans",
    product: "Rocket Loans Personal Loan",
    url: "https://www.rocketloans.com/personal-loans",
    states: allBut("IA", "MD", "NV", "WV"),
    prequal: "yes",
    source: "rocketloans.com — every state except Iowa, Maryland, Nevada and West Virginia"
  },
  {
    name: "Reach Financial",
    product: "Reach Personal Loan",
    url: "https://www.reach.com/",
    states: allBut("CO", "CT", "ME", "NV", "NH", "TN", "VT", "WV"),
    prequal: "yes",
    source: "reach.com (reachfinancial.com redirects here) — not licensed in Colorado, Connecticut, Maine, Nevada, New Hampshire, Tennessee, Vermont or West Virginia"
  },
  {
    name: "Achieve",
    product: "Achieve Personal Loan",
    url: "https://www.achieve.com/personal-loans",
    states: allBut("CO", "CT", "HI", "IA", "KS", "ME", "ND", "VT", "WA", "WV", "WI", "WY"),
    prequal: "yes",
    source: "achieve.com — 38 states and DC; not Colorado, Connecticut, Hawaii, Iowa, Kansas, Maine, North Dakota, Vermont, Washington, West Virginia, Wisconsin or Wyoming"
  },
  {
    name: "US Bank",
    product: "U.S. Bank Personal Loan",
    url: "https://www.usbank.com/loans-credit-lines/personal-loans-and-lines-of-credit/personal-loan.html",
    states: "All States",
    prequal: "yes",
    source: "usbank.com — lends in all 50 states and takes applications from people who do not bank there, but caps non-clients at $25,000 over 60 months. Its own disclosure adds that not every loan programme runs in every state"
  },
  {
    name: "Citi",
    product: "Citi Personal Loan",
    url: "https://www.citi.com/personal-loans",
    states: "",
    prequal: "yes",
    source: "citi.com — open to new and existing customers, $2,000 to $30,000, or up to $50,000 for people who already hold a Citi card or deposit account. State list not published"
  },
  {
    name: "Alliant Credit Union",
    product: "Alliant Personal Loan",
    url: "https://www.alliantcreditunion.org/borrow/get-a-credit-union-personal-loan",
    states: "",
    prequal: "",
    source: "alliantcreditunion.org — you have to have been a member for 90 days before you can apply, so this is not a same-day option. State list not published"
  },
  {
    name: "First Tech Federal Credit Union",
    product: "First Tech Fixed Rate Personal Loan",
    url: "https://www.firsttechfed.com/borrow/personal-loans",
    states: "",
    prequal: "",
    source: "firsttechfed.com — up to $50,000 fixed rate. Membership runs through an employer, a partner organisation, living or working in Oregon, or a family member, so it is not open to everyone in every state"
  },
  {
    name: "We Florida Financial",
    product: "We Florida Financial Live Your Life Loan",
    url: "https://wefloridafinancial.com/live-your-life-loan",
    states: "FL",
    prequal: "",
    source: "wefloridafinancial.com — a Florida credit union serving 43 Florida counties. Not national; listed because it was named in a prior audit"
  }
];

/* Looked at and deliberately not written. Each of these has stopped writing
   new personal loans, so a row would send an advisor to a dead end. */
const CLOSED = [
  ["Marcus by Goldman Sachs", "stopped taking new personal loan applications in January 2023 and has not reopened; marcus.com is savings and CDs now"],
  ["Laurel Road", "stopped taking new personal loan applications during its 2026 move into KeyBank; laurelroad.com/personal-loans now redirects to key.com"],
  ["Figure", "the consumer site sells home equity lines only. Personal loans appear in the servicing and terms pages but there is no way to apply, so nothing was written"]
];

function slug(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function main() {
  const { opinion } = readInquiries();
  const already = new Set(ALREADY_IN_BOOK.map((n) => n.toLowerCase()));

  const rows = [];
  const skippedDuplicate = [];
  for (const lender of LENDERS) {
    if (already.has(lender.name.toLowerCase())) {
      skippedDuplicate.push(lender.name);
      continue;
    }
    const institution = resolveInstitution(lender.name);
    const view = institution ? opinion.get(institution) : null;
    const bureaus = view && view.bureaus.length ? toBookText(sortBureaus(new Set(view.bureaus))) : "";
    rows.push({
      lender_table: "PersonalLoans",
      name: lender.name,
      product_name: lender.product,
      application_url: lender.url,
      eligible_states: lender.states,
      bureaus_pulled: bureaus,
      prequal_soft_pull: lender.prequal,
      application_method: "Online",
      notes: `Added 2026-09-18 from the lender's own website. ${lender.source}.`,
      active: "true",
      external_row_id: `PERSONAL-LOAN-${slug(lender.name)}`,
      _bureau_from: view ? view.split : null
    });
  }

  /* THE WHOLE BOOK SHAPE, minus logo_path, which the loader works out from the
     logo files on disk. A column this script has nothing for is written empty,
     which is correct: the row is new, so there is nothing to blank out. */
  const header = LENDER_CSV_COLUMNS.filter((c) => c !== "logo_path");
  const csv = [header.join(",")];
  for (const r of rows) csv.push(header.map((c) => escapeCsv(r[c])).join(","));
  const csvText = csv.join("\n") + (rows.length ? "\n" : "");

  console.log("Rows this would add:", rows.length);
  console.log("With a bureau      :", rows.filter((r) => r.bureaus_pulled).length,
    "(from docs/legacy-strong/inquiry-master-database.csv — blank means we have never seen one)");
  console.log("With a state list  :", rows.filter((r) => r.eligible_states).length);
  console.log("With a soft pull   :", rows.filter((r) => r.prequal_soft_pull).length);
  console.log("");

  console.log("Every row:");
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(32)} ${(r.bureaus_pulled || "bureau unknown").padEnd(15)}`
      + ` ${r.eligible_states === "All States" ? "All States" : r.eligible_states ? r.eligible_states.split(",").length + " states" : "states unknown"}`
      + `${r._bureau_from ? "   [" + r._bureau_from + "]" : ""}`
    );
  }
  console.log("");

  if (skippedDuplicate.length) {
    console.log("Already in the book, not written again:", skippedDuplicate.join(", "));
    console.log("");
  }
  console.log("Already in the book under PersonalLoans:", ALREADY_IN_BOOK.join(", "));
  console.log("");
  console.log("Looked at and NOT written — these have stopped lending:");
  for (const [n, why] of CLOSED) console.log(`  ${n} — ${why}`);
  console.log("");

  console.log("Columns written:", header.length, "of", LENDER_CSV_COLUMNS.length,
    "(logo_path is filled by the loader from the logo files on disk)");
  console.log("");

  if (!CONFIRM) {
    console.log("DRY RUN. Nothing was written. Add --confirm to write:");
    console.log("  " + OUT_FILE);
    return;
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, csvText);
  console.log("Written:");
  console.log("  " + OUT_FILE);
  console.log("");
  console.log("Load it with:");
  console.log("  node --env-file=.env scripts/lenders-import-alec.mjs \\");
  console.log("    --file credentials/lenders-audit/lenders-personal-loans-web.csv");
  console.log("(dry run — add --confirm when the numbers look right)");
}

main();
