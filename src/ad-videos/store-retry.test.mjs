// Retrying a failed take — and the marks that have to come off with it.
//
// NO DATABASE. The transaction is a stub that records the SQL, which is enough
// to prove which state the take goes back to and which columns the UPDATE
// clears.
//
// ═══════════════════════════════════════════════════════════════════════════
// RETRY GOES BACK TO THE LAST GOOD STEP (spec §9.1, 2026-10-05).
//
// It used to send every failed take to `staged` and wipe everything after it.
// Now a take goes back to the state it failed FROM (last_good_status) and only
// that step's marks and later ones come off. A mark left standing makes the
// step read "already done" and skip, and a skip writes nothing — that is how a
// retried take once sat still for ever with no error anywhere.
// ═══════════════════════════════════════════════════════════════════════════

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  retryFailed, retryClears, RETRY_FALLBACK, RETRY_CLEARS_FOR_TEST as RETRY_CLEARS
} from "./store.mjs";
import { FAILABLE_STATES } from "./states.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A transaction stand-in. The first query (the read) answers with `current`;
    the UPDATE answers with a row. */
function fakeTx(current) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (/^\s*SELECT/.test(sql)) return { rows: current ? [current] : [], rowCount: current ? 1 : 0 };
      return { rows: [{ id: "r1", status: params[2] }], rowCount: 1 };
    }
  };
}

/** The `SET a = NULL` column names, read back out of the statement. */
function nulledColumns(sql) {
  const set = sql.slice(sql.indexOf("SET"), sql.indexOf("WHERE"));
  return [...set.matchAll(/([a-z_]+)\s*=\s*NULL/g)].map((m) => m[1]);
}

async function retryFrom(lastGood) {
  const tx = fakeTx({ last_good_status: lastGood });
  const row = await retryFailed(tx, { orgId: "org1", id: "r1" });
  return { row, update: tx.queries[1] };
}

describe("retrying a failed take", () => {
  test("it goes back to the state it failed from, and drops the reason", async () => {
    const { row, update } = await retryFrom("editing");
    assert.equal(row.status, "editing");
    assert.match(update.sql, /SET status = \$3/);
    assert.match(update.sql, /WHERE id = \$1 AND org_id = \$2 AND status = 'failed'/);
    assert.deepEqual(update.params, ["r1", "org1", "editing"]);
    const cleared = nulledColumns(update.sql);
    assert.ok(cleared.includes("failure_reason"));
    assert.ok(cleared.includes("last_good_status"));
  });

  test("a row that failed before 416 has no last_good_status and starts again from the raw file", async () => {
    const { row } = await retryFrom(null);
    assert.equal(RETRY_FALLBACK, "raw_landed");
    assert.equal(row.status, "raw_landed");
  });

  test("a row that is not failed any more is left alone", async () => {
    const tx = fakeTx(null);
    assert.equal(await retryFailed(tx, { orgId: "org1", id: "r1" }), null);
    assert.equal(tx.queries.length, 1, "no UPDATE when the row is not failed");
  });

  test("a retry may return to approved, because a person pressed Retry", async () => {
    const { row } = await retryFrom("approved");
    assert.equal(row.status, "approved");
  });

  test("EACH STEP'S MARKS ARE CLEARED WHEN THE TAKE GOES BACK TO THAT STEP", async () => {
    /* One entry per short-circuit in src/ad-videos/pipeline.mjs: the state the
       step runs at, and the mark it reads as "already done". */
    const stalls = [
      ["staged", "submagicCreate", "submagic_project_id"],
      ["staged", "submagicCreate", "submagic_claimed_at"],
      ["editing", "captionAndExport", "exported_at"],
      ["editing", "captionAndExport", "export_claimed_at"],
      ["animated", "saveFinishedAndNotify", "notified_at"],
      ["prepared", "transcribe", "transcript"]
    ];
    for (const [state, step, column] of stalls) {
      const { update } = await retryFrom(state);
      assert.ok(nulledColumns(update.sql).includes(column),
        `${step} runs at ${state} and skips on ${column}, so a retry to ${state} must clear it`);
    }
  });

  test("WORK BEFORE THE FAILED STEP SURVIVES — a failed export keeps its cut and its project", async () => {
    const { update } = await retryFrom("editing");
    const cleared = new Set(nulledColumns(update.sql));
    for (const keep of ["submagic_project_id", "cut_at", "cut_storage_key", "transcript", "audio_storage_key"]) {
      assert.equal(cleared.has(keep), false, `${keep} was made before the export and is still good`);
    }
  });

  test("THE INPUTS SURVIVE EVERY RETRY — a retry is not a re-film", () => {
    for (const status of [RETRY_FALLBACK, ...FAILABLE_STATES]) {
      const cleared = new Set(retryClears(status));
      for (const keep of [
        "drive_raw_file_id", "drive_raw_name", "ad_id", "take_no", "script_id",
        "org_id", "video_kind", "edit_round", "cut_version"
      ]) {
        assert.equal(cleared.has(keep), false,
          `${keep} is an input, not work — a retry to ${status} must not clear it`);
      }
    }
  });

  test("a later step clears a subset of what an earlier one clears", () => {
    for (let i = 1; i < FAILABLE_STATES.length; i += 1) {
      const earlier = new Set(retryClears(FAILABLE_STATES[i - 1]));
      for (const c of retryClears(FAILABLE_STATES[i])) {
        assert.ok(earlier.has(c), `${c} is cleared at ${FAILABLE_STATES[i]} but not at ${FAILABLE_STATES[i - 1]}`);
      }
    }
  });

  test("every cleared column actually exists on the table", () => {
    /* A typo here is worse than useless: Postgres refuses the whole UPDATE, so
       the Retry button stops working for every take at once. */
    const migrations = [
      "389_ad_videos.sql", "390_ad_video_worker_marks.sql", "391_ad_video_spend_claims.sql",
      "416_ad_video_states_v2.sql"
    ]
      .map((f) => fs.readFileSync(path.join(HERE, "../../db/migrations", f), "utf8"))
      .join("\n");
    for (const column of RETRY_CLEARS) {
      assert.ok(new RegExp(`\\b${column}\\b`).test(migrations),
        `${column} is cleared by retryFailed but no migration defines it`);
    }
  });

  test("the claims come off HERE and nowhere else", () => {
    const pipeline = fs.readFileSync(path.join(HERE, "pipeline.mjs"), "utf8");
    assert.ok(RETRY_CLEARS.includes("submagic_claimed_at"));
    assert.ok(RETRY_CLEARS.includes("export_claimed_at"));
    assert.match(pipeline, /submagic_claimed_at/, "the pipeline reads the claim it cannot clear itself");
  });
});
