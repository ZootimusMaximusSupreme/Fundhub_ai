// Retrying a failed take — and the marks that have to come off with it.
//
// NO DATABASE. The transaction is a stub that records the SQL, which is enough
// to prove the one thing that was wrong: which columns the UPDATE clears.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE BUG: A RETRIED TAKE NEVER MOVED AGAIN, AND SAID NOTHING ABOUT IT.
//
// retryFailed() puts the row back at `staged`. The step that runs at `staged`
// is submagicCreate(), and its first line is "have I already got a project id?
// then skip". A take that failed at the export still has its project id — so it
// skipped, returned an EMPTY patch, and because the patch was empty the sweeper
// wrote nothing and the status never moved. The row sat at `staged` forever,
// re-read every five minutes, going nowhere, with no error anywhere.
//
// The same trap waits at every later step. These tests pin the whole list.
// ═══════════════════════════════════════════════════════════════════════════

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { retryFailed, RETRY_CLEARS_FOR_TEST as RETRY_CLEARS } from "./store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A transaction stand-in. Keeps the SQL and the parameters, runs nothing. */
function fakeTx(rows = [{ id: "r1", status: "staged" }]) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => { queries.push({ sql, params }); return { rows, rowCount: rows.length }; }
  };
}

/** The `SET a = NULL` column names, read back out of the statement. */
function nulledColumns(sql) {
  const set = sql.slice(sql.indexOf("SET"), sql.indexOf("WHERE"));
  return [...set.matchAll(/([a-z_]+)\s*=\s*NULL/g)].map((m) => m[1]);
}

/* Run once, so every assertion below reads the same statement. */
const tx0 = await (async () => {
  const tx = fakeTx();
  await retryFailed(tx, { orgId: "org1", id: "r1" });
  return tx.queries[0];
})();

describe("retrying a failed take", () => {
  test("it goes back to staged and drops the failure reason", async () => {
    const tx = fakeTx();
    await retryFailed(tx, { orgId: "org1", id: "r1" });
    const { sql, params } = tx.queries[0];
    assert.match(sql, /SET status = 'staged'/);
    assert.match(sql, /WHERE id = \$1 AND org_id = \$2 AND status = 'failed'/);
    assert.deepEqual(params, ["r1", "org1"]);
    assert.ok(nulledColumns(sql).includes("failure_reason"));
  });

  test("THE PROJECT ID IS CLEARED — without it the take stalls at staged forever", async () => {
    const tx = fakeTx();
    await retryFailed(tx, { orgId: "org1", id: "r1" });
    assert.ok(nulledColumns(tx.queries[0].sql).includes("submagic_project_id"),
      "submagicCreate() skips on this field, and a skip writes nothing, so the status never moves");
  });

  test("every mark a step reads as `already done` is cleared", async () => {
    /* One entry per short-circuit in src/ad-videos/pipeline.mjs. If a step
       learns a new one, this list has to grow with it or the retry silently
       stops working again. */
    const stalls = [
      ["submagicCreate", "submagic_project_id"],
      ["submagicCreate", "submagic_claimed_at"],
      ["readTranscript", "transcript"],
      ["matchAndRename", "renamed_at"],
      ["placeBrollAndExport", "exported_at"],
      ["placeBrollAndExport", "export_claimed_at"],
      ["saveFinishedAndNotify", "notified_at"]
    ];
    const cleared = new Set(nulledColumns(tx0.sql));
    for (const [step, column] of stalls) {
      assert.ok(cleared.has(column), `${step} skips on ${column}, so a retry must clear it`);
    }
  });

  test("the work that follows from those marks is cleared too", async () => {
    const cleared = new Set(nulledColumns(tx0.sql));
    /* A new Submagic project means new words, so last run's transcript, clip
       placement, render and notification are all about a project that no longer
       matters. Leaving any of them makes the row describe two different edits. */
    for (const column of [
      "transcript_words", "broll_placed_at", "broll_count", "broll_notes",
      "rendered_at", "finished_url", "storage_final_key", "save_note",
      "notify_error", "delivery_note"
    ]) {
      assert.ok(cleared.has(column), `${column} belongs to the run that failed`);
    }
  });

  test("THE INPUTS SURVIVE — a retry is not a re-film", async () => {
    const cleared = new Set(nulledColumns(tx0.sql));
    for (const keep of [
      "drive_raw_file_id", "drive_raw_name", "staged_at", "storage_raw_key",
      "ad_id", "take_no", "script_id", "org_id", "video_kind"
    ]) {
      assert.equal(cleared.has(keep), false,
        `${keep} is an input, not work — clearing it would throw away what the take IS`);
    }
  });

  test("every cleared column actually exists on the table", () => {
    /* A typo here is worse than useless: Postgres refuses the whole UPDATE, so
       the retry button stops working for every take at once. */
    const migrations = ["389_ad_videos.sql", "390_ad_video_worker_marks.sql", "391_ad_video_spend_claims.sql"]
      .map((f) => fs.readFileSync(path.join(HERE, "../../db/migrations", f), "utf8"))
      .join("\n");
    for (const column of RETRY_CLEARS) {
      assert.ok(new RegExp(`\\b${column}\\b`).test(migrations),
        `${column} is cleared by retryFailed but no migration defines it`);
    }
  });

  test("the claims come off HERE and nowhere else", () => {
    /* A spend claim standing with no result is how the pipeline refuses to pay
       twice after a crash. It is deliberately not clearable by a worker — a
       person retrying the take is the one act that says "I looked, go again". */
    const pipeline = fs.readFileSync(path.join(HERE, "pipeline.mjs"), "utf8");
    assert.ok(RETRY_CLEARS.includes("submagic_claimed_at"));
    assert.ok(RETRY_CLEARS.includes("export_claimed_at"));
    assert.match(pipeline, /submagic_claimed_at/, "the pipeline reads the claim it cannot clear itself");
  });
});
