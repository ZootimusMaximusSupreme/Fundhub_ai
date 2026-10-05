#!/usr/bin/env node
/**
 * Move the ad-video takes caught mid-pipeline when the order changed
 * (docs/specs/marketing-machine-2026-10-04.md §9.1 "Rows already in flight").
 *
 * Run it ONCE, on the Mac, after migration 416 has shipped. Dry run first:
 *
 *   node --env-file=.env scripts/ad-videos-move-in-flight-9-1.mjs           # prints the plan, writes nothing
 *   node --env-file=.env scripts/ad-videos-move-in-flight-9-1.mjs --apply   # writes it
 *
 * The plan is src/ad-videos/in-flight-9-1.mjs (pure, unit-tested). Nothing is
 * deleted: a moved row keeps every column except its old Submagic project id
 * and spend claim, and the project id is written into last_step_note.
 *
 * After --apply it finishes the two locks migration 416 could not build while
 * old rows were in the way: it validates ad_videos_identified_ck and builds
 * ad_videos_one_master_uq. If an ad still has two takes in a master state,
 * the index is NOT built and the script says which ad and which takes. Which
 * take stays is Chris's call; this never picks one.
 *
 * These moves are not in states.mjs TRANSITIONS on purpose: they undo the old
 * order once and are never a move the pipeline makes.
 */
import { pathToFileURL } from "node:url";
import { asStaff } from "../src/partners/rls.mjs";
import { db, close } from "../src/db.mjs";
import { planMoves, MASTER_STATES } from "../src/ad-videos/in-flight-9-1.mjs";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await asStaff(async (tx) => (await tx.query(
    `SELECT id, org_id, ad_id, take_no, status, exported_at, rendered_at, submagic_project_id
       FROM ad_videos ORDER BY created_at`
  )).rows, { db });

  const { moves, leftAlone, doubleMasters } = planMoves(rows);
  console.log(`${rows.length} takes read. ${moves.length} to move, ${leftAlone.length} left for a person.`);
  for (const m of moves) console.log(`  move ${m.id}: ${m.from} → ${m.to}`);
  for (const m of leftAlone) console.log(`  leave ${m.id} (${m.from}): ${m.note}`);
  for (const d of doubleMasters) {
    console.log(`  ad ${d.ad_id} has ${d.takes.length} takes in a master state: ` +
      d.takes.map((t) => `${t.id} take ${t.take_no ?? "?"} ${t.status}`).join("; ") +
      " — Chris picks which one stays");
  }

  if (!APPLY) {
    console.log("Dry run. Nothing was written. Add --apply to write it.");
    return;
  }

  await asStaff(async (tx) => {
    for (const m of moves) {
      const clearProject = m.to === "raw_landed"
        ? ", submagic_project_id = NULL, submagic_claimed_at = NULL"
        : "";
      await tx.query(
        `UPDATE ad_videos
            SET status = $2, last_step = 'in-flight-9-1', last_step_note = $3,
                last_step_at = now()${clearProject}
          WHERE id = $1 AND status = $4`,
        [m.id, m.to, m.note, m.from]
      );
    }
  }, { db });
  console.log(`Moved ${moves.length} takes.`);

  /* Finish 416's locks. Owner-level DDL: if the connection cannot run it, say
     so in one line and stop — the pipeline still works without them. */
  try {
    await db.query("ALTER TABLE ad_videos VALIDATE CONSTRAINT ad_videos_identified_ck");
    console.log("ad_videos_identified_ck is validated.");
  } catch (err) {
    console.log(`ad_videos_identified_ck is still NOT VALID: ${err.message}`);
  }
  if (doubleMasters.length) {
    console.log("ad_videos_one_master_uq was NOT built: an ad still has two masters (listed above).");
  } else {
    try {
      const list = MASTER_STATES.map((s) => `'${s}'`).join(", ");
      await db.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_one_master_uq
           ON ad_videos (org_id, ad_id) WHERE status IN (${list})`
      );
      console.log("ad_videos_one_master_uq is built.");
    } catch (err) {
      console.log(`ad_videos_one_master_uq was NOT built: ${err.message}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => close());
}
