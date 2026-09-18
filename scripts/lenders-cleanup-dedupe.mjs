#!/usr/bin/env node
/**
 * Clean up three known messes in the bank book.
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR, in plain words.
 *
 * The bank list the funding advisor reads has three things wrong with it that
 * no import will fix by itself, because an import only ever adds and updates
 * rows — it never removes one and never moves one to a different list.
 *
 *   1. TWO "Verify Bank" ROWS THAT ARE NOT BANKS. They came from a test. They
 *      carry no id from the original book, no website, no states, nothing.
 *      They read on the screen as two real banks nobody can apply to.
 *
 *   2. FOURTEEN BANKS FILED UNDER THE WRONG PRODUCT. They sit in the online
 *      BUSINESS credit card list, but the only link on the row goes to the
 *      bank's CONSUMER card application. A funding advisor sends a client to
 *      what they think is a business card and the client lands on a personal
 *      one. They belong in the personal card list.
 *
 *   3. ELAN FINANCIAL, BROKEN INTO EIGHT PIECES. Elan is one card program.
 *      The original book wrote it up one US state at a time, so the import
 *      made eight rows out of it — "Elan Financial", "Elan Financial Issuers",
 *      "Elan Financial Network", "Elan Financial Partner Banks" and so on.
 *      Each one holds a different handful of states. On the screen it looks
 *      like eight different lenders. It is one, and this puts it back to one
 *      row holding every state the eight of them covered between them.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT DO.
 *
 *   - A DRY RUN IS THE DEFAULT. Nothing is written without --confirm.
 *   - IT WILL NOT DELETE A ROW ANYTHING POINTS AT. If a client application or
 *     a bureau observation is attached to a row this would remove, it stops
 *     and writes nothing. Deleting it would orphan a client's record.
 *   - IT WILL NOT DROP A STATE. Before the Elan rows are merged it reads the
 *     states off all eight, and after the merge it checks every one of them
 *     is still on the surviving row. If one went missing it rolls the whole
 *     thing back.
 *   - IT ONLY TOUCHES THE ROWS NAMED ABOVE. It matches on the row's id from
 *     the original book, never on a guess.
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN IT.
 *
 *   node --env-file=.env scripts/lenders-cleanup-dedupe.mjs
 *       Dry run. Prints exactly what it would change. Writes nothing.
 *
 *   node --env-file=.env scripts/lenders-cleanup-dedupe.mjs --confirm
 *       Does it, in one transaction.
 *
 *   --org <slug>   a different company (default: DEFAULT_ORG_SLUG)
 *
 * ---------------------------------------------------------------------------
 * ONE THING THIS DOES NOT FIX.
 *
 * The spreadsheets the book is loaded from still hold the old shape — the
 * eight Elan rows are still eight rows in docs/legacy-strong/
 * lenders-legacy-strong.csv, and the fourteen banks are still marked as
 * business cards in the Carl merge file. Re-running the importer would bring
 * the eight Elan rows back and put the fourteen banks back in the business
 * list. Fixing the spreadsheets is a separate job.
 */

import { db, pool, close } from "../src/db.mjs";

const CONFIRM = process.argv.includes("--confirm");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}
const SLUG = arg("--org") || process.env.DEFAULT_ORG_SLUG || "fundhub";

/* 1. The test rows. Named exactly, and only when they carry no id from the
   original book — a real bank always has one, so this cannot catch one. */
const PLACEHOLDER_NAME = "Verify Bank";

/* 2. What makes a link a CONSUMER link. These are the five shapes that appear
   in the book, and every one of them is a consumer application page:
     consumer-platinum   the Elan/creditcardlearnmore consumer card
     consumer-credit     ".../consumer-credit-cards"
     consumer/web-visa   the FNBO consumer Visa application
     #consumer           creditcardlearnmore's consumer tab (vs #business)
     consumer-products   ".../consumer-products-services/credit-cards"
   A business link never matches any of them. */
const CONSUMER_LINK = "(consumer-platinum|consumer-credit|consumer/web-visa|#consumer|consumer-products)";

/* 3. The eight Elan pieces, by their id from the original book. The first one
   is the row that survives: it is the only one with Elan's own website on it
   and it already holds 32 of the states. The other seven fold into it. */
const ELAN_KEEP = "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL";
const ELAN_FOLD = [
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-0",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-0-FOR-20-MONTHS",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-BANKS-0-FOR-20-MONTHS",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-ISSUED-CARDS-20-MONTHS-0",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-ISSUERS",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-NETWORK",
  "LEGACY-ONLINEBIZCC-ELAN-FINANCIAL-PARTNER-BANKS"
];

/* The name the one surviving Elan row carries. The eight names it replaces
   were never product names — they were whatever the state page happened to
   call Elan that day. This says what it is. */
const ELAN_NAME = "Elan Financial";
const ELAN_PRODUCT = "0% for 20 Months — No Business Checking Required";

/** "AR, AZ, CA" -> ["AR","AZ","CA"]. Two-letter codes only; anything else on
    the row (the book writes "All States" on some banks) is kept as written. */
function splitStates(text) {
  return String(text || "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function unionStates(values) {
  const seen = new Map();
  for (const value of values) {
    for (const state of splitStates(value)) {
      const key = state.toUpperCase();
      if (!seen.has(key)) seen.set(key, state.length === 2 ? key : state);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Anything a row is attached to. A row with attachments is never deleted. */
async function attachmentsFor(ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT l.id,
            l.name,
            (SELECT count(*) FROM applications a WHERE a.lender_id = l.id)::int AS applications,
            (SELECT count(*) FROM lender_bureau_observations o WHERE o.lender_row_id = l.id)::int AS observations
       FROM lenders l
      WHERE l.id = ANY($1::uuid[])`,
    [ids]
  );
  return rows.filter((r) => r.applications > 0 || r.observations > 0);
}

async function main() {
  const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [SLUG]);
  const orgId = org.rows[0]?.id;
  if (!orgId) {
    console.error("No company with the short name", SLUG);
    process.exitCode = 1;
    return;
  }

  const beforeQ = await db.query(
    `SELECT count(*)::int AS banks,
            count(*) FILTER (WHERE lender_table = 'OnlineBizCC')::int AS online_biz,
            count(*) FILTER (WHERE lender_table = 'PersonalCC')::int AS personal_cc
       FROM lenders WHERE org_id = $1::uuid`,
    [orgId]
  );
  const before = beforeQ.rows[0];

  /* ── 1. The test rows ─────────────────────────────────────────────────── */
  const placeholders = await db.query(
    `SELECT id, name, lender_table, created_at
       FROM lenders
      WHERE org_id = $1::uuid
        AND name = $2
        AND external_row_id IS NULL
      ORDER BY created_at`,
    [orgId, PLACEHOLDER_NAME]
  );

  /* ── 2. Business rows whose only link is a consumer application ───────── */
  const misfiled = await db.query(
    `SELECT id, name, external_row_id, application_url
       FROM lenders
      WHERE org_id = $1::uuid
        AND external_row_id LIKE 'CARL-%'
        AND lender_table = 'OnlineBizCC'
        AND application_url ~* $2
      ORDER BY name`,
    [orgId, CONSUMER_LINK]
  );

  /* ── 3. The eight Elan pieces ─────────────────────────────────────────── */
  const elan = await db.query(
    `SELECT id, name, product_name, external_row_id, eligible_states, application_url, priority_tier
       FROM lenders
      WHERE org_id = $1::uuid
        AND external_row_id = ANY($2::text[])
      ORDER BY external_row_id`,
    [orgId, [ELAN_KEEP, ...ELAN_FOLD]]
  );
  const elanKeep = elan.rows.find((r) => r.external_row_id === ELAN_KEEP);
  const elanFold = elan.rows.filter((r) => r.external_row_id !== ELAN_KEEP);
  const elanStatesBefore = unionStates(elan.rows.map((r) => r.eligible_states));
  /* Already done. Running twice must not append the note a second time. */
  const elanAlreadyMerged = !elanFold.length
    && elanKeep?.name === ELAN_NAME
    && elanKeep?.product_name === ELAN_PRODUCT;

  /* ── What this would do ───────────────────────────────────────────────── */
  console.log("Company             :", SLUG);
  console.log("In the database now :", before.banks, "banks —",
    before.online_biz, "online business cards,", before.personal_cc, "personal cards");
  console.log("");

  console.log(`1. Test rows to remove ("${PLACEHOLDER_NAME}", no id from the book):`, placeholders.rows.length);
  for (const r of placeholders.rows) {
    console.log(`     ${r.name}  [${r.lender_table}]  added ${r.created_at.toISOString().slice(0, 10)}`);
  }
  console.log("");

  console.log("2. Business rows whose link is a consumer card, moving to the personal list:",
    misfiled.rows.length);
  for (const r of misfiled.rows) console.log(`     ${r.name}`);
  console.log("");

  if (!elanKeep) {
    console.error("STOPPED. The Elan row that is supposed to survive is not in the database:");
    console.error("  " + ELAN_KEEP);
    process.exitCode = 1;
    return;
  }
  if (elanAlreadyMerged) {
    console.log("3. Elan Financial — already one row, nothing to do.");
    console.log(`     states  : ${elanStatesBefore.length} — ${elanStatesBefore.join(", ")}`);
  } else {
    console.log("3. Elan Financial —", elan.rows.length, "rows folding into 1");
    for (const r of elan.rows) {
      const mark = r.external_row_id === ELAN_KEEP ? "KEEP" : "fold";
      const label = [r.name, r.product_name].filter(Boolean).join(" ");
      console.log(`     ${mark}  ${label}  [${r.eligible_states || "no states"}]`);
    }
    console.log("");
    console.log("     The one row that is left:");
    console.log(`       name    : ${ELAN_NAME}`);
    console.log(`       product : ${ELAN_PRODUCT}`);
    console.log(`       states  : ${elanStatesBefore.length} — ${elanStatesBefore.join(", ")}`);
  }
  console.log("");

  /* Nothing may be deleted out from under a client's record. */
  const deleting = [...placeholders.rows, ...elanFold].map((r) => r.id);
  const attached = await attachmentsFor(deleting);
  if (attached.length) {
    console.error("STOPPED. These rows have client records attached and removing them would");
    console.error("orphan those records:");
    for (const a of attached) {
      console.error(`  ${a.name} — ${a.applications} applications, ${a.observations} bureau observations`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Nothing being removed has a client application or a bureau observation on it.");
  console.log("");

  if (!CONFIRM) {
    console.log("DRY RUN. Nothing was written. Add --confirm to do it.");
    return;
  }

  /* ── Do it ────────────────────────────────────────────────────────────── */
  const client = await pool().connect();
  let after;
  try {
    await client.query("BEGIN");

    const removedPlaceholders = await client.query(
      `DELETE FROM lenders WHERE id = ANY($1::uuid[]) RETURNING id`,
      [placeholders.rows.map((r) => r.id)]
    );

    const retagged = await client.query(
      `UPDATE lenders SET lender_table = 'PersonalCC'
        WHERE id = ANY($1::uuid[]) RETURNING id`,
      [misfiled.rows.map((r) => r.id)]
    );

    if (!elanAlreadyMerged) await client.query(
      `UPDATE lenders
          SET name = $2::text,
              product_name = $3::text,
              eligible_states = $4::text,
              notes = btrim(concat_ws(' ', notes, $5::text))
        WHERE id = $1::uuid`,
      [
        elanKeep.id,
        ELAN_NAME,
        ELAN_PRODUCT,
        elanStatesBefore.join(", "),
        `Consolidated ${elan.rows.length} per-state Elan rows into this one on `
        + `${new Date().toISOString().slice(0, 10)}; states merged from: `
        + elanFold.map((r) => `${[r.name, r.product_name].filter(Boolean).join(" ")} (${r.eligible_states || "no states"})`).join("; ")
        + "."
      ]
    );

    const foldedAway = await client.query(
      `DELETE FROM lenders WHERE id = ANY($1::uuid[]) RETURNING id`,
      [elanFold.map((r) => r.id)]
    );

    /* Every state the eight rows covered has to still be on the one that is
       left, or none of this happened. */
    const check = await client.query(
      `SELECT eligible_states FROM lenders WHERE id = $1::uuid`,
      [elanKeep.id]
    );
    const statesAfter = new Set(splitStates(check.rows[0]?.eligible_states).map((s) => s.toUpperCase()));
    const lost = elanStatesBefore.filter((s) => !statesAfter.has(s.toUpperCase()));
    if (lost.length) {
      throw new Error("Elan merge dropped these states, rolling back: " + lost.join(", "));
    }

    await client.query("COMMIT");

    const afterQ = await client.query(
      `SELECT count(*)::int AS banks,
              count(*) FILTER (WHERE lender_table = 'OnlineBizCC')::int AS online_biz,
              count(*) FILTER (WHERE lender_table = 'PersonalCC')::int AS personal_cc
         FROM lenders WHERE org_id = $1::uuid`,
      [orgId]
    );
    after = afterQ.rows[0];

    console.log(JSON.stringify({
      placeholders_removed: removedPlaceholders.rowCount,
      retagged_to_personal_cc: retagged.rowCount,
      elan_rows_folded_away: foldedAway.rowCount,
      elan_states_kept: elanStatesBefore.length,
      before,
      after,
      page: "/app/lenders.html"
    }, null, 2));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => close());
