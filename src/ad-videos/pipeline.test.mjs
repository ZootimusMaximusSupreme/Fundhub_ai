// The state machine.
//
// No network, no database, no clock: every port is a stub, which is the whole
// reason the pipeline was written to take ports rather than import providers.
//
// The block that matters most is "running it twice". The sweeper runs every
// five minutes and a serverless function can be retried mid-flight, so a step
// that is not safe to repeat does not cost a tidy log line — it costs a second
// export against a 50-an-hour ceiling, or a second project against a paid
// minute.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  advance, STATES, NEXT_STEP, checkResolution, buildBrief, FOUR_K_HEIGHT,
  stage, submagicCreate, readTranscript, matchAndRename,
  placeBrollAndExport, pollFinished, saveFinishedAndNotify, deliverToPaul,
  recordSubmagicWebhook
} from "./pipeline.mjs";

const NAMING = {
  /* THE REAL MODULE'S NAMES AND SHAPES. This stub used to invent rawName,
     finalName, adFolderName and briefName — functions naming.mjs never had —
     and every test here passed against them while the real pipeline silently
     skipped the rename and would have waited for ever at delivery. Measured
     2026-09-24 on the first real take. seam.test.mjs proves the pipeline only
     calls what the module exports. */
  rawFileName: (adId, takeNo) => `${String(adId).padStart(3, "0")}_t${String(takeNo).padStart(2, "0")}_raw.mp4`,
  finalFileName: (adId, takeNo, version) => `${String(adId).padStart(3, "0")}_t${String(takeNo).padStart(2, "0")}_final_v${version}.mp4`,
  paulFolderName: (adId) => String(adId).padStart(3, "0"),
  briefFileName: (adId) => `${String(adId).padStart(3, "0")}_brief.txt`
};

const row = (extra = {}) => ({
  id: "row1", ad_id: "43", take_no: 2, video_kind: "ad",
  drive_raw_file_id: "drv1", status: "raw_landed", finished_version: 1, ...extra
});

const okish = (extra) => ({ ok: true, retryable: false, ...extra });

describe("the state table", () => {
  test("every state the plan names is here", () => {
    for (const s of ["scripted", "filming", "raw_landed", "staged", "editing", "transcribed",
      "matched", "rendered", "awaiting_approval", "approved", "delivered", "rejected", "failed"]) {
      assert.ok(STATES.includes(s), `${s} is missing`);
    }
  });

  test("awaiting_approval has NO step — only a person moves it", () => {
    assert.equal(NEXT_STEP.awaiting_approval, undefined);
    assert.equal(NEXT_STEP.rejected, undefined);
    assert.equal(NEXT_STEP.failed, undefined);
  });

  test("a resting state comes back skipped, not broken", async () => {
    const out = await advance(row({ status: "awaiting_approval" }), {});
    assert.equal(out.ok, true);
    assert.equal(out.skipped, true);
    assert.deepEqual(out.patch, {});
  });

  test("a step that throws is caught and reported as retryable", async () => {
    const out = await advance(row({ status: "staged", staged_at: "2026-09-22T10:00:00Z" }), {
      drive: { downloadFile: async () => okish({ bytes: new Uint8Array([1]), byteLength: 1 }) },
      claim: async () => true,
      submagic: { createProjectFromFile: () => { throw new Error("boom"); } }
    });
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true);
    assert.match(out.error, /threw/);
  });
});

describe("staging", () => {
  test("with no staging port the row WAITS and says which port is missing", async () => {
    const out = await stage(row(), {});
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true);
    assert.match(out.error, /staging port was not supplied/);
    assert.match(out.error, /nothing was lost/);
  });

  /* THE LINK ROUTE IS GONE. Staging used to be able to share the take with
     "anyone who has this link" and hand Submagic the URL, and nothing ever took
     that share back off. A stager that returns a url now gets it ignored — the
     row never carries one, so there is nothing for a later step to hand out. */
  test("a url from a stager is NEVER written onto the row", async () => {
    const out = await stage(row(), {
      staging: { publicUrlFor: async () => ({ ok: true, url: "https://draft.test/a.mp4", storageKey: "drive:drv1" }) }
    });
    assert.equal(out.patch.status, "staged");
    assert.equal(out.patch.source_url, undefined,
      "a take must never be published to get itself captioned");
  });

  /* The default route. Nothing is published, so there is deliberately no
     source_url — and staged_at is what stops the step running twice. */
  test("direct staging moves the row WITHOUT putting a link on it", async () => {
    const out = await stage(row(), {
      staging: { publicUrlFor: async () => ({ ok: true, mode: "direct", storageKey: "drive:drv1" }) }
    });
    assert.equal(out.patch.status, "staged");
    assert.equal(out.patch.source_url, undefined, "direct staging must not publish a link");
    assert.ok(out.patch.staged_at, "staged_at is the only thing stopping a second pass");
    assert.equal(out.patch.storage_raw_key, "drive:drv1");
  });

  test("a take with no Drive file FAILS rather than waiting forever", async () => {
    const out = await stage(row({ drive_raw_file_id: null }), {
      staging: { publicUrlFor: async () => ({ ok: true, mode: "direct" }) }
    });
    assert.equal(out.ok, false);
    assert.equal(out.retryable, false);
    assert.equal(out.patch.status, "failed");
  });

  test("a stager that refuses for good is a failure, not a retry", async () => {
    const out = await stage(row(), {
      staging: { publicUrlFor: async () => ({ ok: false, retryable: false, error: "no Drive file id" }) }
    });
    assert.equal(out.retryable, false);
    assert.equal(out.patch.status, "failed");
  });

  test("a row staged directly is not staged again", async () => {
    let called = false;
    const out = await stage(row({ staged_at: "2026-09-22T10:00:00Z" }), {
      staging: { publicUrlFor: async () => { called = true; return { ok: true, mode: "direct" }; } }
    });
    assert.equal(called, false);
    assert.equal(out.skipped, true);
  });
});

describe("Submagic", () => {
  test("create moves staged to editing and keeps the project id", async () => {
    const out = await submagicCreate(row({ status: "staged", staged_at: "2026-09-22T10:00:00Z" }), {
      drive: { downloadFile: async () => okish({ bytes: new Uint8Array([1]), byteLength: 1 }) },
      claim: async () => true,
      submagic: { createProjectFromFile: async () => okish({ projectId: "proj9" }) }
    });
    assert.equal(out.patch.status, "editing");
    assert.equal(out.patch.submagic_project_id, "proj9");
    assert.equal(out.patch.submagic_claimed_at, null, "the claim comes off in the same write");
  });

  /* ── THE UPLOAD ROUTE ──────────────────────────────────────────────────
     No source_url on the row means the bytes go over instead of a link. This
     is the whole point of the staging build: the take is never world-readable
     and Submagic never has to fetch anything from us. */
  describe("the upload route — bytes, not a link", () => {
    const staged = row({ status: "staged", staged_at: "2026-09-22T10:00:00Z", drive_raw_name: "IMG_4471.mov" });
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]); // an MP4 `ftyp` header

    test("the take is pulled from Drive and pushed to Submagic", async () => {
      let asked = null;
      let sent = null;
      const out = await submagicCreate(staged, {
        drive: {
          downloadFile: async (id) => { asked = id; return okish({ bytes, byteLength: bytes.byteLength, contentType: "video/quicktime" }); }
        },
        claim: async () => true,
        submagic: {
          createProjectFromFile: async (args) => { sent = args; return okish({ projectId: "proj-upload" }); }
        },
        env: {}
      });
      assert.equal(asked, "drv1");
      assert.equal(sent.file, bytes);
      assert.equal(sent.fileName, "IMG_4471.mov");
      assert.equal(sent.contentType, "video/quicktime");
      assert.equal(out.patch.status, "editing");
      assert.equal(out.patch.submagic_project_id, "proj-upload");
    });

    test("a Drive read that failed for good takes the row to failed, not a retry loop", async () => {
      const out = await submagicCreate(staged, {
        drive: { downloadFile: async () => ({ ok: false, retryable: false, error: "the take is bigger than the cap" }) },
        claim: async () => true,
        submagic: { createProjectFromFile: async () => okish({ projectId: "x" }) },
        env: {}
      });
      assert.equal(out.ok, false);
      assert.equal(out.retryable, false);
      assert.equal(out.patch.status, "failed");
    });

    test("a phone still uploading is a WAIT — no project, no paid minute", async () => {
      let created = false;
      const out = await submagicCreate(staged, {
        drive: { downloadFile: async () => ({ ok: false, retryable: true, error: "Drive returned an empty file" }) },
        claim: async () => { throw new Error("a claim must not be spent on a take that was never sent"); },
        submagic: {
          createProjectFromFile: async () => { created = true; return okish({ projectId: "x" }); }
        },
        env: {}
      });
      assert.equal(created, false);
      assert.equal(out.retryable, true);
      assert.deepEqual(out.patch, {});
    });

    test("no Drive file is a dead end, said out loud", async () => {
      const out = await submagicCreate(row({ status: "staged", staged_at: "t", drive_raw_file_id: null }), {
        submagic: { createProjectFromFile: async () => okish({}) }, env: {}
      });
      assert.equal(out.patch.status, "failed");
      assert.match(out.error, /nothing to hand to Submagic/);
    });

    test("no Drive provider WAITS and names the missing port", async () => {
      const out = await submagicCreate(staged, {
        submagic: { createProjectFromFile: async () => okish({}) },
        drive: {},
        env: {}
      });
      assert.equal(out.retryable, true);
      assert.match(out.error, /drive\.downloadFile/);
    });
  });

  test("Submagic still listening is a WAIT, not a failure", async () => {
    const out = await readTranscript(row({ status: "editing", submagic_project_id: "p1" }), {
      submagic: { getProject: async () => okish({ words: [], status: "processing" }) }
    });
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true);
    assert.deepEqual(out.patch, {});
  });

  test("words arriving give the transcript AND the billable length", async () => {
    const out = await readTranscript(row({ status: "editing", submagic_project_id: "p1" }), {
      submagic: { getProject: async () => okish({
        words: [{ word: "most", startTime: 0, endTime: 0.3 }, { word: "people", startTime: 0.3, endTime: 0.7 }],
        durationSeconds: 102
      }) }
    });
    assert.equal(out.patch.status, "transcribed");
    assert.equal(out.patch.transcript, "most people");
    assert.equal(out.patch.duration_seconds, 102);
  });
});

describe("match and rename", () => {
  const transcribed = row({
    status: "transcribed", ad_id: null, script_id: null,
    transcript: "most people apply in the wrong order",
    transcript_words: [{ word: "most", startTime: 0, endTime: 0.3 }]
  });

  test("THE RENAME ONLY HAPPENS AFTER THE MATCH", async () => {
    let renamed = false;
    const out = await matchAndRename(transcribed, {
      drive: { renameFile: async () => { renamed = true; return okish({ at: "2026-09-23T10:00:00Z" }); } },
      naming: NAMING,
      candidateScripts: [],       // nothing to match against
      env: { ANTHROPIC_API_KEY: "" }
    });
    assert.equal(out.ok, false);
    assert.equal(renamed, false,
      "a file renamed on a guess looks like a fact to everybody downstream");
  });

  test("a script with no ad number stops the row and says why", async () => {
    const out = await matchAndRename(row({
      status: "transcribed", transcript: "words", script_id: "s1", ad_id: null
    }), { naming: NAMING, drive: {} });
    assert.equal(out.patch.status, "failed");
    assert.match(out.error, /ad number must exist before filming/);
  });

  test("with an id and a name already on the row it does nothing", async () => {
    const out = await matchAndRename(row({
      status: "transcribed", transcript: "w", script_id: "s1", renamed_at: "2026-09-23T10:00:00Z"
    }), {});
    assert.equal(out.skipped, true);
  });
});

describe("b-roll and export", () => {
  const matched = row({ status: "matched", submagic_project_id: "p1", transcript_words: [
    { word: "approval", startTime: 10, endTime: 10.4 }
  ] });

  test("a take with no matching clip still exports — captions alone are an ad", async () => {
    let exported = false;
    const out = await placeBrollAndExport(matched, {
      claim: async () => true,
      submagic: {
        uploadUserMedia: async () => okish({ userMediaId: "m1" }),
        updateProject: async () => okish({}),
        exportProject: async () => { exported = true; return okish({}); }
      },
      brollLibrary: []
    });
    assert.equal(exported, true);
    assert.ok(out.patch.exported_at);
  });

  test("B-ROLL REFUSED DOES NOT STOP THE AD — it is recorded and the export runs", async () => {
    let exported = false;
    const out = await placeBrollAndExport(matched, {
      claim: async () => true,
      submagic: {
        uploadUserMedia: async () => okish({ userMediaId: "m1" }),
        updateProject: async () => ({ ok: false, retryable: false, error: "422 items overlap" }),
        exportProject: async () => { exported = true; return okish({}); }
      },
      brollLibrary: [{ id: "c1", name: "approval-email.mp4", url: "https://cdn.test/approval-email.mp4" }],
      brollOptions: { leadInSeconds: 0 }
    });
    assert.equal(exported, true);
    assert.match(out.patch.broll_notes, /b-roll refused/);
    assert.equal(out.patch.broll_count, 0);
  });

  test("a clip is uploaded, then placed at the word it is about", async () => {
    let placed = null;
    const out = await placeBrollAndExport(matched, {
      claim: async () => true,
      submagic: {
        uploadUserMedia: async () => okish({ userMediaId: "m1" }),
        updateProject: async (_id, { placements }) => { placed = placements; return okish({}); },
        exportProject: async () => okish({})
      },
      brollLibrary: [{ id: "c1", name: "approval-email.mp4", url: "https://cdn.test/approval-email.mp4" }],
      brollOptions: { leadInSeconds: 0 }
    });
    assert.equal(placed.length, 1);
    assert.equal(placed[0].startTime, 10);
    assert.equal(out.patch.broll_count, 1);
  });
});

describe("running it twice", () => {
  /* Each of these is a step that costs money or creates a duplicate the second
     time. The field named in each assertion is the idempotency key. */
  test("an already-staged row is not staged again", async () => {
    let called = false;
    await stage(row({ staged_at: "2026-09-22T10:00:00Z" }), {
      staging: { publicUrlFor: async () => { called = true; return okish({ mode: "direct" }); } }
    });
    assert.equal(called, false);
  });

  test("a row already at Submagic does not get a SECOND PROJECT (a paid minute)", async () => {
    let called = false;
    await submagicCreate(row({ status: "staged", staged_at: "t", submagic_project_id: "p1" }), {
      claim: async () => true,
      drive: { downloadFile: async () => okish({ bytes: new Uint8Array([1]), byteLength: 1 }) },
      submagic: { createProjectFromFile: async () => { called = true; return okish({ projectId: "p2" }); } }
    });
    assert.equal(called, false);
  });

  test("an exported row does NOT export again — it asks whether the render is done", async () => {
    let exported = false;
    let asked = false;
    const out = await placeBrollAndExport(row({ status: "matched", submagic_project_id: "p1", exported_at: "2026-09-23T10:00:00Z" }), {
      submagic: {
        exportProject: async () => { exported = true; return okish({}); },
        getProject: async () => { asked = true; return okish({ status: "processing" }); }
      }
    });
    assert.equal(exported, false, "export is capped at 50 an hour; a double-submit is a quarter of the budget");
    assert.equal(asked, true);
    assert.equal(out.retryable, true);
  });

  test("an already-notified row is not buzzed again", async () => {
    let buzzed = false;
    await saveFinishedAndNotify(row({ status: "rendered", finished_url: "https://x", notified_at: "t" }), {
      notify: { send: async () => { buzzed = true; return { status: "sent" }; } }
    });
    assert.equal(buzzed, false);
  });

  test("an already-delivered row is not delivered again", async () => {
    let made = false;
    await deliverToPaul(row({ status: "approved", drive_final_file_id: "x" }), {
      drive: { ensureFolder: async () => { made = true; return okish({ folderId: "f" }); }, uploadTextFile: async () => okish({}) },
      naming: NAMING, paulFolderId: "paul"
    });
    assert.equal(made, false);
  });
});

describe("THE MARK GOES DOWN BEFORE THE MONEY GOES OUT", () => {
  /* A mark written AFTER the vendor answered is not idempotency, it is a bet
     that nothing dies in between. An upload of a two-hundred-megabyte take runs
     for minutes and a serverless function can be killed at any point in it:
     killed after Submagic accepted and before the row was written, the next
     pass reads a row that says nothing happened and pays again.

     So the claim goes down first (migration 391) and comes off when the vendor
     answers. Every test here is about the ORDER of those two things, which is
     the only thing that makes the guard real. */

  const staged = row({ status: "staged", staged_at: "2026-09-22T10:00:00Z" });
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const drive = { downloadFile: async () => okish({ bytes, byteLength: bytes.byteLength }) };
  const matched = row({ status: "matched", submagic_project_id: "p1" });

  test("the create claim is written BEFORE Submagic is called, never after", async () => {
    const order = [];
    const out = await submagicCreate(staged, {
      drive,
      claim: async (patch) => { order.push(["claim", Object.keys(patch)[0]]); return true; },
      submagic: { createProjectFromFile: async () => { order.push(["vendor"]); return okish({ projectId: "p9" }); } },
      env: {}
    });
    assert.deepEqual(order, [["claim", "submagic_claimed_at"], ["vendor"]],
      "the mark must be on the row before a byte of the take leaves");
    assert.equal(out.patch.submagic_claimed_at, null, "and it comes off in the same write as the result");
  });

  test("NO CLAIM PORT, NO CREATE — an unmarked spend does not happen at all", async () => {
    let called = false;
    const out = await submagicCreate(staged, {
      drive,
      submagic: { createProjectFromFile: async () => { called = true; return okish({ projectId: "p9" }); } },
      env: {}
    });
    assert.equal(called, false);
    assert.equal(out.retryable, true);
    assert.match(out.error, /claim could not be written/);
  });

  test("a claim write that failed stops the create", async () => {
    for (const claim of [async () => false, async () => { throw new Error("db gone"); }]) {
      let called = false;
      const out = await submagicCreate(staged, {
        drive, claim,
        submagic: { createProjectFromFile: async () => { called = true; return okish({ projectId: "p9" }); } },
        env: {}
      });
      assert.equal(called, false, "a claim that did not land is the hole this closes");
      assert.equal(out.ok, false);
    }
  });

  test("A STANDING CLAIM REFUSES A SECOND PROJECT — this is the double-bill", async () => {
    /* The crash case. Submagic publishes no list endpoint, so nothing here can
       ask whether the first create landed; creating another would be wrong half
       the time and it is the expensive half. */
    let called = false;
    /* A FRESH claim. It used to be a fixed date in the past, which quietly
       stopped testing anything once claims learned to expire: a claim older
       than CLAIM_STALE_AFTER_MS is deliberately let go, because nothing can
       still be running behind it. The case this test is about is the one where
       something might be. */
    const out = await submagicCreate(row({
      status: "staged", staged_at: "t", submagic_claimed_at: new Date().toISOString()
    }), {
      drive, claim: async () => true,
      submagic: { createProjectFromFile: async () => { called = true; return okish({ projectId: "p9" }); } },
      env: {}
    });
    assert.equal(called, false, "a crashed upload must never be paid for twice");
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true);
    assert.deepEqual(out.patch, {}, "and the claim is left exactly where it is");
    assert.match(out.error, /retry this take/);
  });

  test("a claim too old to belong to anything alive stops the take and says why — it does not spend again", async () => {
    /* The other half of the rule above, and the reason a take stopped needing a
       person. A background function is killed at fifteen minutes, so a claim
       older than twenty cannot belong to a run that is still going. Before this,
       one interrupted upload locked a take out for ever. */
    let called = false;
    const stale = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    const out = await submagicCreate(row({
      status: "staged", staged_at: "t", submagic_claimed_at: stale
    }), {
      drive, claim: async () => true,
      submagic: { createProjectFromFile: async () => { called = true; return okish({ projectId: "p9" }); } },
      env: {}
    });
    /* REVERSED 2026-09-24, same day it was written. Four projects for one take
       were measured in the account: every "lost" upload had landed. An expired
       claim must never turn into a second create. It stops the take with the
       reason on the row so a person decides. */
    assert.equal(called, false, "an expired claim must NOT create again — the first one landed");
    assert.equal(out.ok, false);
    assert.equal(out.patch.status, "failed");
    assert.match(out.patch.failure_reason, /LANDED/);
  });

  test("a vendor that ANSWERED clears the claim — no project was made, so retry cleanly", async () => {
    const out = await submagicCreate(staged, {
      drive, claim: async () => true,
      submagic: { createProjectFromFile: async () => ({ ok: false, retryable: true, status: 429, sent: true, error: "too many creates this hour" }) },
      env: {}
    });
    assert.equal(out.retryable, true);
    assert.equal(out.patch.submagic_claimed_at, null,
      "a 429 is the vendor talking: nothing was created and nothing was billed");
  });

  test("a fence that held the call clears the claim too — nothing left the building", async () => {
    const out = await submagicCreate(staged, {
      drive, claim: async () => true,
      submagic: { createProjectFromFile: async () => ({ ok: false, retryable: true, status: 0, sent: false, error: "held by the adapters fence" }) },
      env: {}
    });
    assert.equal(out.patch.submagic_claimed_at, null);
  });

  test("a create that went out and NEVER CAME BACK keeps its claim", async () => {
    const out = await submagicCreate(staged, {
      drive, claim: async () => true,
      submagic: { createProjectFromFile: async () => ({ ok: false, retryable: true, status: 0, sent: true, error: "timed out after 120000ms" }) },
      env: {}
    });
    assert.deepEqual(out.patch, {},
      "nobody knows whether that take was billed, so nobody may guess — a person looks");
  });

  test("the export claim is written BEFORE the export, never after", async () => {
    const order = [];
    const out = await placeBrollAndExport(matched, {
      claim: async (patch) => { order.push(["claim", Object.keys(patch)[0]]); return true; },
      submagic: { exportProject: async () => { order.push(["vendor"]); return okish({}); } },
      brollLibrary: []
    });
    assert.deepEqual(order, [["claim", "export_claimed_at"], ["vendor"]]);
    assert.ok(out.patch.exported_at);
    assert.equal(out.patch.export_claimed_at, null);
  });

  test("NO CLAIM PORT, NO EXPORT — an export bills minutes", async () => {
    let exported = false;
    const out = await placeBrollAndExport(matched, {
      submagic: { exportProject: async () => { exported = true; return okish({}); } },
      brollLibrary: []
    });
    assert.equal(exported, false);
    assert.match(out.error, /never runs before its mark is on the row/);
  });

  test("A STANDING EXPORT CLAIM POLLS instead of exporting again", async () => {
    /* Better than refusing: a poll costs nothing, sits inside a 100-an-hour
       read limit, and settles the question a second export would only guess at. */
    let exported = false;
    let asked = false;
    const out = await placeBrollAndExport(row({
      status: "matched", submagic_project_id: "p1", export_claimed_at: "2026-09-22T10:05:00Z"
    }), {
      claim: async () => true,
      submagic: {
        exportProject: async () => { exported = true; return okish({}); },
        getProject: async () => { asked = true; return okish({ status: "completed", downloadUrl: "https://real.test/o.mp4" }); }
      }
    });
    assert.equal(exported, false, "export is billed and capped at 50 an hour");
    assert.equal(asked, true);
    assert.equal(out.patch.status, "rendered", "the first export had in fact landed");
  });

  test("an answered export failure clears the claim", async () => {
    const out = await placeBrollAndExport(matched, {
      claim: async () => true,
      submagic: { exportProject: async () => ({ ok: false, retryable: true, status: 503, sent: true, error: "Submagic is down" }) },
      brollLibrary: []
    });
    assert.equal(out.patch.export_claimed_at, null);
  });
});

describe("NOTHING IS EVER PUBLISHED TO GET A TAKE EDITED", () => {
  /* The `link` route is gone. It shared the take as "anyone with the link,
     reader" and nothing ever took that share back off, so a take handed over
     for one edit stayed readable by anyone holding its id for the life of the
     file. Google grants no expiry on an `anyone` permission, so there was no
     small fix that bounded it — and Submagic takes the bytes directly, so the
     whole route was unnecessary. */
  test("a row that somehow carries a source_url is still uploaded, not linked", async () => {
    let linked = false;
    let uploaded = false;
    const bytes = new Uint8Array([1, 2, 3]);
    const out = await submagicCreate(row({
      status: "staged", staged_at: "t", source_url: "https://drive.usercontent.google.com/download?id=x"
    }), {
      drive: { downloadFile: async () => okish({ bytes, byteLength: 3 }) },
      claim: async () => true,
      submagic: {
        createProject: async () => { linked = true; return okish({ projectId: "bad" }); },
        createProjectFromFile: async () => { uploaded = true; return okish({ projectId: "good" }); }
      },
      env: {}
    });
    assert.equal(linked, false, "an old row must not reopen the route that publishes the take");
    assert.equal(uploaded, true);
    assert.equal(out.patch.submagic_project_id, "good");
  });
});

describe("THE WEBHOOK PROVES NOTHING", () => {
  /* The body arrives unauthenticated from the open internet and the research
     records no signature. The truth comes from asking Submagic with our key. */
  test("a forged 'finished' body is checked against the API before anything moves", async () => {
    let asked = null;
    const out = await recordSubmagicWebhook(
      { ok: true, projectId: "p1", status: "completed", downloadUrl: "https://evil.test/out.mp4" },
      { submagic: { getProject: async (id) => { asked = id; return okish({ status: "processing", downloadUrl: null }); } } }
    );
    assert.equal(asked, "p1", "the payload was believed without asking");
    assert.equal(out.ok, false);
    assert.deepEqual(out.patch, {});
  });

  test("the link that is saved is the vendor's, never the payload's", async () => {
    const out = await recordSubmagicWebhook(
      { ok: true, projectId: "p1", status: "completed", downloadUrl: "https://evil.test/out.mp4" },
      { submagic: { getProject: async () => okish({ status: "completed", downloadUrl: "https://real.test/out.mp4", durationSeconds: 101 }) } }
    );
    assert.equal(out.patch.status, "rendered");
    assert.equal(out.patch.finished_url, "https://real.test/out.mp4");
  });

  test("a render Submagic says failed is recorded as failed", async () => {
    const out = await recordSubmagicWebhook(
      { ok: true, projectId: "p1", status: "completed" },
      { submagic: { getProject: async () => okish({ status: "failed" }) } }
    );
    assert.equal(out.patch.status, "failed");
  });

  test("THE POLL IS THE FLOOR UNDER THE WEBHOOK", async () => {
    const out = await pollFinished(row({ submagic_project_id: "p1" }), {
      submagic: { getProject: async () => okish({ status: "completed", downloadUrl: "https://real.test/o.mp4" }) }
    });
    assert.equal(out.patch.status, "rendered",
      "a lost ping must not strand a finished render forever");
  });
});

describe("the 4K law", () => {
  test("a paid ad may be 1080p", () => {
    assert.equal(checkResolution({ video_kind: "ad", height: 1080 }).ok, true);
  });

  test("anything else under 4K is flagged, and never quietly shipped", () => {
    const v = checkResolution({ video_kind: "not_ad", height: 1080 });
    assert.equal(v.ok, false);
    assert.match(v.warning, /4K/);
    assert.match(v.warning, /Do not upscale/);
  });

  test("an unknown size on a non-ad is still called out", () => {
    assert.match(checkResolution({ video_kind: "not_ad" }).warning, /unknown/);
  });

  test("4K is 2160 lines", () => assert.equal(FOUR_K_HEIGHT, 2160));

  test("the warning rides on the notification", async () => {
    let sent = null;
    await saveFinishedAndNotify(row({ status: "rendered", video_kind: "not_ad", height: 1080, finished_url: "https://x" }), {
      notify: { send: async (m) => { sent = m; return { status: "sent" }; } }
    });
    assert.match(sent.notification.body, /4K/);
  });
});

describe("the notification", () => {
  test("a buzz that did not land does NOT hide a finished video", async () => {
    const out = await saveFinishedAndNotify(row({ status: "rendered", finished_url: "https://x" }), {
      notify: { send: async () => ({ status: "failed", error: "ntfy is not configured" }) }
    });
    assert.equal(out.patch.status, "awaiting_approval");
    assert.match(out.patch.notify_error, /not configured/);
  });

  test("no notifier at all still moves the row and says nobody was told", async () => {
    const out = await saveFinishedAndNotify(row({ status: "rendered", finished_url: "https://x" }), {});
    assert.equal(out.patch.status, "awaiting_approval");
    assert.match(out.note, /nobody was told/);
  });
});

describe("Paul's folder", () => {
  test("THE BRIEF'S LINK IS NEVER PADDED", () => {
    const brief = buildBrief({ ad_id: "43", take_no: 2 });
    assert.match(brief, /utm_content=43(\D|$)/);
    assert.ok(!/utm_content=043/.test(brief),
      "fundhub_ad_id() returns text — 043 and 43 are two different ads and one ad's results split in half");
    assert.match(brief, /NOT padded/);
  });

  test("the folder name IS padded, so the folders sort", () => {
    assert.equal(NAMING.paulFolderName("43"), "043");
  });

  test("the folder and the brief land even though the video cannot", async () => {
    const out = await deliverToPaul(row({ status: "approved", finished_url: "https://x" }), {
      drive: {
        ensureFolder: async () => okish({ folderId: "f043" }),
        uploadTextFile: async () => okish({ fileId: "b1" }),
        uploadVideo: async () => ({ ok: false, unsupported: true, error: "moving video bytes is not built" })
      },
      naming: NAMING, paulFolderId: "paul"
    });
    assert.equal(out.ok, false);
    assert.equal(out.retryable, false, "an unsupported step must not be retried forever");
    assert.equal(out.patch.paul_folder_id, "f043");
    assert.equal(out.patch.drive_brief_file_id, "b1");
    assert.match(out.patch.delivery_note, /not built/);
  });

  test("no Paul folder id means it waits rather than inventing somewhere to put it", async () => {
    const out = await deliverToPaul(row({ status: "approved" }), { drive: { ensureFolder: async () => okish({}), uploadTextFile: async () => okish({}) }, naming: NAMING });
    assert.equal(out.ok, false);
    assert.match(out.error, /DRIVE_PAUL_FOLDER_ID/);
  });

  test("a full delivery records all three ids", async () => {
    const out = await deliverToPaul(row({ status: "approved", finished_url: "https://x" }), {
      drive: {
        ensureFolder: async () => okish({ folderId: "f043" }),
        uploadTextFile: async () => okish({ fileId: "b1" }),
        uploadVideo: async () => okish({ fileId: "v1" })
      },
      naming: NAMING, paulFolderId: "paul"
    });
    assert.equal(out.patch.status, "delivered");
    assert.equal(out.patch.drive_final_file_id, "v1");
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Submagic takes our clips in AFTER it hands back their ids.

   Measured 2026-09-24 on the first real take: four clips uploaded, the
   placement a second later was refused `media is not ready yet … wait for the
   upload to complete`, and the export went out with nothing on it — a billed
   render, empty. These pin the rule: ask again on a clock, and never export an
   empty cut over a transient refusal.
   ───────────────────────────────────────────────────────────────────────── */
describe("our clips are placed once Submagic has taken them in", () => {
  const words = [{ text: "roadmap", start: 5, end: 5.9 }];
  const notReady = { ok: false, retryable: false, status: 400, sent: true,
    error: '{"error":"VALIDATION_ERROR","message":"The following media is not ready yet: abc. Please wait for the upload to complete."}' };
  const lib = [{ driveFileId: "d1", name: "roadmap-document.mp4", mimeType: "video/mp4" }];
  const drive = { downloadFile: async () => ({ ok: true, bytes: new Uint8Array([1]), contentType: "video/mp4" }) };
  const base = (overrides) => ({
    drive, claim: async () => true, brollLibrary: lib, env: {}, mediaReadyDelaysMs: [0, 0, 0],
    submagic: {
      uploadUserMedia: async () => ({ ok: true, userMediaId: "um1" }),
      exportProject: async () => ({ ok: true }),
      ...overrides
    }
  });
  const matched = () => row({ status: "matched", submagic_project_id: "p1", transcript: "roadmap", transcript_words: words });

  test("not ready, then ready: the clips are placed and the export goes out", async () => {
    let calls = 0;
    const out = await placeBrollAndExport(matched(), base({
      updateProject: async () => (++calls < 3 ? notReady : { ok: true })
    }));
    assert.equal(calls, 3, "asked again until Submagic was ready");
    assert.equal(out.ok, true);
    assert.equal(out.patch.broll_count, 1, "the clip was placed");
    assert.ok(out.patch.exported_at, "and the export went out");
  });

  test("still not ready after the whole clock: WAIT, do not export an empty cut", async () => {
    let exported = false;
    const out = await placeBrollAndExport(matched(), base({
      updateProject: async () => notReady,
      exportProject: async () => { exported = true; return { ok: true }; }
    }));
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true, "the next pass asks again");
    assert.equal(exported, false, "a render with nothing on it is a billed mistake, not an ad");
    assert.match(out.error, /still being taken in/);
  });

  test("refused for a real reason: the ad still exports, captions only, reason kept", async () => {
    const out = await placeBrollAndExport(matched(), base({
      updateProject: async () => ({ ok: false, retryable: false, status: 400, error: "layout unknown" })
    }));
    assert.equal(out.ok, true);
    assert.equal(out.patch.broll_count, 0);
    assert.ok(out.patch.exported_at);
    assert.match(out.patch.broll_notes, /b-roll refused: layout unknown/);
  });
});
