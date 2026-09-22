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
  rawName: ({ adId, takeNo }) => `${String(adId).padStart(3, "0")}_t${String(takeNo).padStart(2, "0")}_raw.mp4`,
  finalName: ({ adId, takeNo, version }) => `${String(adId).padStart(3, "0")}_t${String(takeNo).padStart(2, "0")}_final_v${version}.mp4`,
  adFolderName: (adId) => String(adId).padStart(3, "0"),
  briefName: (adId) => `${String(adId).padStart(3, "0")}_brief.txt`
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
    const out = await advance(row({ status: "staged", raw_public_url: "https://x.test/a.mp4" }), {
      submagic: { createProject: () => { throw new Error("boom"); } }
    });
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true);
    assert.match(out.error, /threw/);
  });
});

describe("staging", () => {
  test("with no staging port the row WAITS and says the gap out loud", async () => {
    const out = await stage(row(), {});
    assert.equal(out.ok, false);
    assert.equal(out.retryable, true);
    assert.match(out.error, /staging is not built/);
    assert.match(out.error, /nothing was lost/);
  });

  test("a staged url moves it on", async () => {
    const out = await stage(row(), { staging: { publicUrlFor: async () => ({ ok: true, url: "https://draft.test/a.mp4" }) } });
    assert.equal(out.patch.status, "staged");
    assert.equal(out.patch.raw_public_url, "https://draft.test/a.mp4");
  });
});

describe("Submagic", () => {
  test("create moves raw to editing and keeps the project id", async () => {
    const out = await submagicCreate(row({ status: "staged", raw_public_url: "https://x.test/a.mp4" }), {
      submagic: { createProject: async () => okish({ projectId: "proj9" }) }
    });
    assert.equal(out.patch.status, "editing");
    assert.equal(out.patch.submagic_project_id, "proj9");
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
    await stage(row({ raw_public_url: "https://x.test/a.mp4" }), {
      staging: { publicUrlFor: async () => { called = true; return okish({ url: "u" }); } }
    });
    assert.equal(called, false);
  });

  test("a row already at Submagic does not get a SECOND PROJECT (a paid minute)", async () => {
    let called = false;
    await submagicCreate(row({ status: "staged", raw_public_url: "u", submagic_project_id: "p1" }), {
      submagic: { createProject: async () => { called = true; return okish({ projectId: "p2" }); } }
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
    await saveFinishedAndNotify(row({ status: "rendered", submagic_download_url: "https://x", notified_at: "t" }), {
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
    assert.equal(out.patch.submagic_download_url, "https://real.test/out.mp4");
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
    await saveFinishedAndNotify(row({ status: "rendered", video_kind: "not_ad", height: 1080, submagic_download_url: "https://x" }), {
      notify: { send: async (m) => { sent = m; return { status: "sent" }; } }
    });
    assert.match(sent.notification.body, /4K/);
  });
});

describe("the notification", () => {
  test("a buzz that did not land does NOT hide a finished video", async () => {
    const out = await saveFinishedAndNotify(row({ status: "rendered", submagic_download_url: "https://x" }), {
      notify: { send: async () => ({ status: "failed", error: "ntfy is not configured" }) }
    });
    assert.equal(out.patch.status, "awaiting_approval");
    assert.match(out.patch.notify_error, /not configured/);
  });

  test("no notifier at all still moves the row and says nobody was told", async () => {
    const out = await saveFinishedAndNotify(row({ status: "rendered", submagic_download_url: "https://x" }), {});
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
    assert.equal(NAMING.adFolderName("43"), "043");
  });

  test("the folder and the brief land even though the video cannot", async () => {
    const out = await deliverToPaul(row({ status: "approved", submagic_download_url: "https://x" }), {
      drive: {
        ensureFolder: async () => okish({ folderId: "f043" }),
        uploadTextFile: async () => okish({ fileId: "b1" }),
        uploadVideo: async () => ({ ok: false, unsupported: true, error: "moving video bytes is not built" })
      },
      naming: NAMING, paulFolderId: "paul"
    });
    assert.equal(out.ok, false);
    assert.equal(out.retryable, false, "an unsupported step must not be retried forever");
    assert.equal(out.patch.drive_final_folder_id, "f043");
    assert.equal(out.patch.drive_brief_file_id, "b1");
    assert.match(out.patch.delivery_note, /not built/);
  });

  test("no Paul folder id means it waits rather than inventing somewhere to put it", async () => {
    const out = await deliverToPaul(row({ status: "approved" }), { drive: { ensureFolder: async () => okish({}), uploadTextFile: async () => okish({}) }, naming: NAMING });
    assert.equal(out.ok, false);
    assert.match(out.error, /DRIVE_PAUL_FOLDER_ID/);
  });

  test("a full delivery records all three ids", async () => {
    const out = await deliverToPaul(row({ status: "approved", submagic_download_url: "https://x" }), {
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
