// One take, one state at a time.
//
// docs/video-pipeline-plan.md §2 lists the states a take moves through and what
// fires each move. This file is that table as code: given a row, do the ONE
// next thing, and hand back what changed. It writes nothing itself — the
// sweeper (src/workflows/ad-video-sweeper.mjs) owns the database — which is what
// makes every step below testable with no database, no network and no clock.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ORDER CHANGED FROM THE PLAN, AND HERE IS EXACTLY WHERE.
//
// docs/video-pipeline-plan.md puts `transcribed` before Submagic, because it was
// written against Deepgram. The owner's decision of 2026-09-22 replaced Deepgram
// with Submagic's own word-level transcript, and that transcript does not exist
// until the project has been created. So two states swap places:
//
//   plan:  staged → transcribed → matched → editing
//   code:  staged → editing → transcribed → matched
//
// No state is added, removed or renamed, so the database's status list is
// untouched. This is a gap between the written plan and the built code and it is
// recorded here, in docs/journeys/ad-video-flow.md, and in the task report
// rather than quietly reconciled (CLAUDE.md §4).
// ═══════════════════════════════════════════════════════════════════════════
//
// EVERY STEP IS SAFE TO RUN TWICE. The sweeper runs every five minutes and a
// serverless function can be retried mid-flight, so "did this already happen?"
// is answered by a field on the row, not by hope:
//
//   stage            → staged_at / source_url already set? skip
//   submagic create  → submagic_project_id     already set? skip
//   read transcript  → transcript              already set? skip
//   match + rename   → script_id / renamed_at  already set? skip
//   place + export   → exported_at             already set? skip
//   notify           → notified_at             already set? skip
//   deliver          → drive_final_file_id     already set? skip
//
// That matters most at `export`: the plan allows 50 exports an hour and an
// update always costs one, so a double-submit is not just untidy, it is a
// quarter of an hour's budget.
//
// NOTHING HERE THROWS. A step returns a verdict. `retryable: true` means try
// the same step again next pass; `retryable: false` means a person is needed
// and the row goes to `failed` with the reason stored.

import { planBroll } from "./broll.mjs";
import { matchTakeToScript } from "./match.mjs";
import { linkNumber } from "./naming.mjs";

/** The states, exactly as docs/video-pipeline-plan.md §2 names them. */
export const STATES = Object.freeze([
  "scripted", "filming", "raw_landed", "staged", "editing", "transcribed",
  "matched", "rendered", "awaiting_approval", "approved", "delivered",
  "rejected", "failed"
]);

/** The 4K law (.claude/rules/video-4k-unless-ad.md): a take that is not a paid
    ad must be 3840×2160. An ad may stay 1080p. */
export const FOUR_K_HEIGHT = 2160;

/** Which step runs at each state. A state that is not here is a resting place:
    a person moves it, or nothing does. */
export const NEXT_STEP = Object.freeze({
  raw_landed: "stage",
  staged: "submagicCreate",
  editing: "readTranscript",
  transcribed: "matchAndRename",
  matched: "placeBrollAndExport",
  rendered: "saveFinishedAndNotify",
  approved: "deliverToPaul"
});

const ok = (patch, note) => ({ ok: true, retryable: false, patch: patch || {}, note: note || null, error: null });
const wait = (error) => ({ ok: false, retryable: true, patch: {}, error, note: null });
const dead = (error) => ({ ok: false, retryable: false, patch: { status: "failed", failure_reason: String(error).slice(0, 300) }, error, note: null });
const skip = (note) => ({ ok: true, retryable: false, patch: {}, note, skipped: true, error: null });

const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";

/* checkResolution — the 4K law, read off the real file rather than off a form.

   Returns a WARNING, not a failure. The database holds the hard stop (the plan's
   CHECK on ad_videos), and a take that is already filmed cannot be made 4K by
   refusing to caption it. What matters is that nobody finds out after Paul has
   uploaded it. */
export function checkResolution({ video_kind, height } = {}) {
  if (video_kind === "ad") return { ok: true, warning: null };
  if (!Number.isFinite(Number(height))) {
    return { ok: true, warning: "the picture size of this take is unknown, and it is not an ad — check it before it ships" };
  }
  if (Number(height) < FOUR_K_HEIGHT) {
    return { ok: false, warning:
      `this is not a paid ad and it came back ${height} lines tall, under 4K (${FOUR_K_HEIGHT}). ` +
      `Owner law: 4K unless it is an ad. Do not upscale it and do not ship it quietly.` };
  }
  return { ok: true, warning: null };
}

/* ─────────────────────────────────────────────────────────────────────────
   stage — get the take ready to hand over.

   THIS USED TO BE THE DEAD END OF THE WHOLE PIPELINE. It said a Drive link
   could not work and that nothing here could host a several-hundred-megabyte
   MP4, so every take stopped at `raw_landed` forever. Both halves were
   measured false on 2026-09-22; src/ad-videos/staging.mjs carries the whole
   story and the two routes.

   TWO SHAPES OF SUCCESS, and a caller must read `mode` rather than assume:

     direct — no link, no url, nothing published. The bytes go Drive → worker →
              Submagic in submagicCreate(). This is the default.
     link   — one file shared read-only by its unguessable id, and `source_url`
              is the download link.

   The port is still injected rather than imported, so every step in this file
   stays testable with no network. The sweeper supplies the real one.
   ───────────────────────────────────────────────────────────────────────── */
export async function stage(row, { staging, env = process.env } = {}) {
  if (has(row.source_url) || has(row.staged_at)) return skip("already staged");
  if (!has(row.drive_raw_file_id)) return dead("no raw file id on the row — nothing to stage");
  if (!staging || typeof staging.publicUrlFor !== "function") {
    return wait(
      "the staging port was not supplied — src/ad-videos/staging.mjs is what belongs here. " +
      "The take is safe in Drive and nothing was lost. See docs/journeys/ad-video-flow.md."
    );
  }

  const res = await staging.publicUrlFor(row, { env });
  if (!res?.ok) {
    const why = res?.error || "staging returned nothing";
    return res?.retryable === false ? dead(why) : wait(why);
  }

  const at = res.at || new Date().toISOString();

  if (res.mode === "direct") {
    /* No source_url on purpose. A row with an empty source_url and a staged_at
       is the signal submagicCreate() reads as "upload the bytes", and it is
       also what keeps a half-finished staging from looking like a link. */
    return ok(
      { status: "staged", staged_at: at, storage_raw_key: res.storageKey || null },
      res.note || "the take goes straight to Submagic — no link was made"
    );
  }

  if (!has(res.url)) return wait("staging returned no url");
  return ok({
    status: "staged",
    source_url: String(res.url),
    staged_at: at,
    storage_raw_key: res.storageKey || null
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   submagicCreate — hand the take over, WITHOUT rendering it.

   autoRender is forced off inside the provider. The whole B-roll timing answer
   depends on reading the real word timings before anything is placed, and that
   is impossible once the project has rendered.

   TWO ROUTES IN, PICKED BY WHAT stage() LEFT ON THE ROW:

     source_url set  → the link route. Submagic downloads it itself.
     no source_url   → the upload route. The bytes are read out of Drive with
                       our own token and posted to Submagic as a multipart
                       upload. Nothing is ever world-readable.

   The upload route is preferred and is what `direct` staging produces. Both
   cost one create against a 30-an-hour ceiling, which is why
   `submagic_project_id` is checked first and never re-spent.
   ───────────────────────────────────────────────────────────────────────── */
export async function submagicCreate(row, {
  submagic, drive, staging, env = process.env, webhookUrl, maxUploadBytes
} = {}) {
  if (has(row.submagic_project_id)) return skip("already at Submagic");
  if (!submagic?.createProject) return wait("the Submagic provider was not supplied");

  const common = {
    title: row.title || `Fundhub take ${row.id}`,
    language: row.language || "en",
    webhookUrl: webhookUrl || env.SUBMAGIC_WEBHOOK_URL || undefined,
    env
  };

  /* The link route. */
  if (has(row.source_url)) {
    const res = await submagic.createProject({ ...common, videoUrl: row.source_url });
    if (!res.ok) return res.retryable === false ? dead(res.error) : wait(res.error);
    return ok({ status: "editing", submagic_project_id: res.projectId });
  }

  /* The upload route. */
  if (!has(row.drive_raw_file_id)) {
    return dead("no link and no Drive file — there is nothing to hand to Submagic");
  }
  if (typeof drive?.downloadFile !== "function" || typeof submagic.createProjectFromFile !== "function") {
    return wait(
      "the upload route needs drive.downloadFile and submagic.createProjectFromFile. " +
      `Set ${staging?.STAGING_MODE_VAR || "AD_VIDEO_STAGING_MODE"}=link to use a shared link instead.`
    );
  }

  const got = await drive.downloadFile(row.drive_raw_file_id, { env, maxBytes: maxUploadBytes });
  if (!got.ok) return got.retryable === false ? dead(got.error) : wait(got.error);

  const res = await submagic.createProjectFromFile({
    ...common,
    file: got.bytes,
    fileName: row.drive_raw_name || `take-${row.id}.mp4`,
    contentType: got.contentType || "video/mp4",
    maxBytes: maxUploadBytes
  });
  if (!res.ok) return res.retryable === false ? dead(res.error) : wait(res.error);
  return ok({ status: "editing", submagic_project_id: res.projectId });
}

/* readTranscript — the words, with their real times.

   This is also the only moment the pipeline learns how long the take runs,
   which is the number the Submagic minute bill is made of. */
export async function readTranscript(row, { submagic, env = process.env } = {}) {
  if (has(row.transcript)) return skip("transcript already read");
  if (!has(row.submagic_project_id)) return wait("no project id yet");
  if (!submagic?.getProject) return wait("the Submagic provider was not supplied");

  const res = await submagic.getProject(row.submagic_project_id, { env });
  if (!res.ok) return res.retryable === false ? dead(res.error) : wait(res.error);
  if (!res.words?.length) {
    /* Not a failure. Submagic is still processing; the next pass looks again. */
    return wait(`Submagic has not finished listening yet (status ${res.status || "unknown"})`);
  }
  const text = res.words.map((w) => w.word ?? w.text ?? "").join(" ").trim();
  return ok({
    status: "transcribed",
    transcript: text,
    transcript_words: res.words,
    duration_seconds: res.durationSeconds ?? row.duration_seconds ?? null
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   matchAndRename — the ad number, and the file name that finally says so.

   The match happens first and the rename only happens if it cleared the
   confidence floor. A file renamed on a guess is worse than a file with the
   phone's own name: the guess looks like a fact to everybody downstream.
   ───────────────────────────────────────────────────────────────────────── */
export async function matchAndRename(row, {
  drive, naming, candidateScripts = [], env = process.env, fetchImpl
} = {}) {
  if (has(row.script_id) && has(row.renamed_at)) return skip("already matched and renamed");
  if (!has(row.transcript)) return wait("no transcript yet");

  let scriptId = row.script_id;
  let adId = row.ad_id;
  let confidence = row.match_confidence;

  if (!has(scriptId)) {
    const m = await matchTakeToScript({
      transcript: row.transcript_words?.length ? row.transcript_words : row.transcript,
      candidates: candidateScripts,
      env,
      fetchImpl
    });
    if (!m.ok) {
      return m.retryable
        ? wait(m.reason)
        /* A take nobody can place is a person's job, not a retry's. The take is
           not lost — it is still in Drive and still on the row. */
        : dead(`could not tell which script this take is: ${m.reason}`);
    }
    scriptId = m.scriptId;
    adId = m.adId ?? adId;
    confidence = m.confidence;
  }

  if (!has(adId)) {
    return dead(
      "the matched script carries no ad number. The ad number must exist before filming — " +
      "no number on the script means no number on the file, the folder or the landing link."
    );
  }

  let renamedAt = row.renamed_at || null;
  if (!renamedAt && drive?.renameFile && naming?.rawName) {
    const name = naming.rawName({ adId, takeNo: row.take_no, date: row.created_at });
    const r = await drive.renameFile(row.drive_raw_file_id, name, { env });
    if (!r.ok) return r.retryable === false ? dead(r.error) : wait(r.error);
    renamedAt = r.at || new Date().toISOString();
  }

  return ok({
    status: "matched",
    script_id: scriptId,
    ad_id: String(adId),
    match_confidence: confidence ?? null,
    renamed_at: renamedAt
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   placeBrollAndExport — our clips, then the render. In that order, once.

   `exported_at` is the idempotency key and it is the important one. Export is
   capped at 50 an hour and every update costs another, so a step that ran twice
   would spend a quarter of the hour's budget on one take.

   A take with no matching clip still exports. An ad with captions and no B-roll
   is an ad; an ad that never renders is nothing.
   ───────────────────────────────────────────────────────────────────────── */
export async function placeBrollAndExport(row, ports = {}) {
  const { submagic, brollLibrary = [], env = process.env, brollOptions = {} } = ports;
  /* ALREADY EXPORTED? THEN ASK WHETHER IT IS FINISHED.

     The webhook is the fast path out of this state and it is also the only
     unauthenticated one, so it cannot be the ONLY path: a ping that is lost,
     blocked or never configured would strand the take here forever with the
     render sitting finished at the vendor. Polling on the five-minute clock is
     the floor under it. */
  if (has(row.exported_at)) return pollFinished(row, ports);
  if (!has(row.submagic_project_id)) return wait("no project id yet");
  if (!submagic?.exportProject) return wait("the Submagic provider was not supplied");

  const notes = [];
  let placed = 0;

  if (!has(row.broll_placed_at) && brollLibrary.length && submagic.uploadUserMedia && submagic.updateProject) {
    /* Upload first, then place. A clip with no userMediaId cannot be placed,
       and planBroll reports it rather than dropping it silently. */
    const clips = [];
    for (const clip of brollLibrary) {
      if (clip.userMediaId) { clips.push(clip); continue; }
      if (!clip.url) { notes.push(`${clip.name || clip.id}: no link to upload`); continue; }
      const up = await submagic.uploadUserMedia(row.submagic_project_id, { url: clip.url, name: clip.name, env });
      if (!up.ok) { notes.push(`${clip.name || clip.id}: ${up.error}`); continue; }
      clips.push({ ...clip, userMediaId: up.userMediaId });
    }

    const plan = planBroll({ words: row.transcript_words || [], clips, ...brollOptions });
    for (const s of plan.skipped) notes.push(`${s.clip}: ${s.why}`);

    if (plan.placements.length) {
      const upd = await submagic.updateProject(row.submagic_project_id, { placements: plan.placements, env });
      if (!upd.ok) {
        /* A refused placement must NOT stop the ad. Captions alone are still a
           finished ad, and the reason is kept on the row so it can be read. */
        notes.push(`b-roll refused: ${upd.error}`);
      } else {
        placed = plan.placements.length;
      }
    }
  }

  const exported = await submagic.exportProject(row.submagic_project_id, { env });
  if (!exported.ok) return exported.retryable === false ? dead(exported.error) : wait(exported.error);

  return ok({
    broll_placed_at: new Date().toISOString(),
    broll_count: placed,
    broll_notes: notes.length ? notes.join("; ").slice(0, 1000) : null,
    exported_at: new Date().toISOString()
  }, notes.length ? notes.join("; ") : null);
}

/* pollFinished — "is the render done yet?", asked with our own key.

   The same question the webhook branch answers, reached the other way. One
   GET per pass per take, well inside the 100-an-hour read limit, and it costs
   no API minutes — minutes are billed on the render, not on a read. */
export async function pollFinished(row, { submagic, env = process.env } = {}) {
  if (!submagic?.getProject) return wait("the Submagic provider was not supplied");
  const res = await submagic.getProject(row.submagic_project_id, { env });
  if (!res.ok) return res.retryable === false ? dead(res.error) : wait(res.error);

  const status = String(res.status || "").toLowerCase();
  if (status === "failed" || status === "error") {
    return dead(`Submagic reported the render failed (${status})`);
  }
  if (!res.downloadUrl) return wait(`still rendering (status ${status || "unknown"})`);

  return ok({
    status: "rendered",
    finished_url: res.downloadUrl,
    rendered_at: new Date().toISOString(),
    duration_seconds: res.durationSeconds ?? row.duration_seconds ?? null
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   recordSubmagicWebhook — the ping, and what it is allowed to mean.

   THE PAYLOAD IS NOT EVIDENCE. It arrives unauthenticated from the open
   internet and the API research records no signature for it. So it is trusted
   for exactly one thing — "go and look at this project" — and the truth comes
   from a fresh GET against the API with our own key. Anyone can send us a
   "finished" body; nobody else can make Submagic agree.
   ───────────────────────────────────────────────────────────────────────── */
export async function recordSubmagicWebhook(parsed, { submagic, env = process.env } = {}) {
  if (!parsed?.ok) return { ok: false, retryable: false, patch: {}, error: parsed?.error || "unreadable payload" };
  if (!submagic?.getProject) return { ok: false, retryable: true, patch: {}, error: "the Submagic provider was not supplied" };

  const truth = await submagic.getProject(parsed.projectId, { env });
  if (!truth.ok) {
    return { ok: false, retryable: truth.retryable !== false, patch: {}, error: truth.error };
  }

  const status = String(truth.status || "").toLowerCase();
  if (status === "failed" || status === "error") {
    return { ok: true, retryable: false, projectId: parsed.projectId,
      patch: { status: "failed", failure_reason: `Submagic reported the render failed (${status})` } };
  }
  if (!truth.downloadUrl) {
    /* The ping arrived before the file did, or it was not about a finished
       render. Nothing moves; the sweeper's own poll picks it up. */
    return { ok: false, retryable: true, projectId: parsed.projectId, patch: {},
      error: `Submagic has no finished file for this project yet (status ${status || "unknown"})` };
  }

  return { ok: true, retryable: false, projectId: parsed.projectId, patch: {
    status: "rendered",
    finished_url: truth.downloadUrl,
    rendered_at: new Date().toISOString(),
    duration_seconds: truth.durationSeconds ?? null
  } };
}

/* ─────────────────────────────────────────────────────────────────────────
   saveFinishedAndNotify — buzz the phone.

   GRAB THE FILE FIRST, ALWAYS. The research could not find out how long the
   Submagic download link stays alive, so treating it as short-lived is the only
   safe reading. Saving our own copy is the `saveFinished` port; see the note on
   stage() for why moving video bytes is not built here.

   The notification carries an ad number, a take number and two links, and
   nothing else. A topic is a public address.
   ───────────────────────────────────────────────────────────────────────── */
export async function saveFinishedAndNotify(row, {
  notify, saveFinished, approveUrl, rejectUrl, env = process.env
} = {}) {
  if (has(row.notified_at)) return skip("already notified");
  if (!has(row.finished_url)) return wait("no finished file link yet");

  const patch = { status: "awaiting_approval" };

  if (!has(row.storage_final_key) && typeof saveFinished === "function") {
    const saved = await saveFinished(row, { env });
    if (saved?.ok) patch.storage_final_key = saved.key || null;
    /* A copy we could not take is recorded and does NOT stop the approval. The
       link still works right now, which is when Chris is about to watch it. */
    else patch.save_note = String(saved?.error || "our own copy was not taken").slice(0, 300);
  }

  const size = checkResolution(row);
  const label = `Ad ${row.ad_id ?? "?"} take ${row.take_no ?? "?"}`;

  if (!notify?.send) return { ...ok(patch), note: "no notifier supplied — the video is waiting, nobody was told" };

  const res = await notify.send({
    id: row.id,
    notification: {
      title: `${label} is ready`,
      body: size.warning ? `Watch it, then approve or reject. ${size.warning}` : "Watch it, then approve or reject.",
      priority: 4,
      tags: ["clapper"],
      click: row.finished_url,
      actions: [
        approveUrl ? { label: "Approve", url: approveUrl } : null,
        rejectUrl ? { label: "Reject", url: rejectUrl } : null
      ].filter(Boolean)
    }
  }, { env });

  if (res?.status === "sent") {
    return ok({ ...patch, notified_at: new Date().toISOString() }, size.warning);
  }
  /* The row still moves to awaiting_approval. A buzz that did not land is not a
     reason to hide a finished video — it is a reason to try the buzz again. */
  return ok({ ...patch, notify_error: String(res?.error || "notification did not send").slice(0, 300) }, size.warning);
}

/* ─────────────────────────────────────────────────────────────────────────
   deliverToPaul — the folder, the brief, and the one file in it.

   docs/video-pipeline-plan.md §4: one folder per ad number, one finished file
   inside it. The brief's landing link reads the ad number from the row, NEVER
   from the folder name — `fundhub_ad_id()` returns text, so utm_content=043 and
   utm_content=43 are two different ads and one ad's results split in half.
   ───────────────────────────────────────────────────────────────────────── */
export function buildBrief(row, { landingBase = "https://fundhub.ai" } = {}) {
  /* linkNumber(), not String(row.ad_id). It is the same value today — the
     database's ad_videos_ad_id_ck already refuses a padded number — but this is
     the line that puts an ad number in front of Paul, and it should REFUSE a
     padded one rather than print it. A brief is the last place the mistake is
     still cheap: once Paul has pasted `utm_content=043` into Meta, that ad's
     results are split in half and neither number looks wrong on its own. */
  const adId = linkNumber(row.ad_id);
  const link = `${String(landingBase).replace(/\/+$/, "")}/?utm_content=${encodeURIComponent(adId)}`;
  return [
    `Ad number: ${adId}`,
    `Take: ${row.take_no ?? "?"}`,
    `Hook: ${row.hook_text ?? "—"}`,
    `Headline: ${row.headline ?? "—"}`,
    "",
    "Primary text:",
    row.primary_text ?? "—",
    "",
    `Landing link: ${link}`,
    "",
    "The ad number in that link is NOT padded. 043 and 43 are two different ads",
    "and padding it splits this ad's results in half. Paste the link exactly."
  ].join("\n");
}

export async function deliverToPaul(row, {
  drive, naming, paulFolderId, landingBase, env = process.env
} = {}) {
  if (has(row.drive_final_file_id)) return skip("already delivered");
  if (!has(row.ad_id)) return dead("no ad number on the row — there is no folder to put this in");
  if (!drive?.ensureFolder || !drive?.uploadTextFile) return wait("the Drive provider was not supplied");
  if (!has(paulFolderId)) return wait("DRIVE_PAUL_FOLDER_ID is not set — there is nowhere to deliver to");
  if (!naming?.adFolderName || !naming?.briefName || !naming?.finalName) return wait("the naming module was not supplied");

  const folder = await drive.ensureFolder({
    parentId: paulFolderId,
    name: naming.adFolderName(row.ad_id),
    env
  });
  if (!folder.ok) return folder.retryable === false ? dead(folder.error) : wait(folder.error);

  const brief = await drive.uploadTextFile({
    parentId: folder.folderId,
    name: naming.briefName(row.ad_id),
    content: buildBrief(row, { landingBase }),
    mimeType: "text/plain",
    env
  });
  if (!brief.ok) return brief.retryable === false ? dead(brief.error) : wait(brief.error);

  /* The video itself. This used to be a named gap — uploadVideo() refused,
     because the fence could not carry an MP4 — and it is now real: the
     finished render is pulled down and pushed into Paul's folder as a
     resumable upload, both halves inside the fence. A provider that still does
     not offer it is reported as `unsupported` and the folder and brief stay. */
  const video = await (drive.uploadVideo
    ? drive.uploadVideo({
      parentId: folder.folderId,
      name: naming.finalName({ adId: row.ad_id, takeNo: row.take_no, version: row.finished_version || 1 }),
      sourceUrl: row.finished_url,
      env
    })
    : { ok: false, unsupported: true, error: "no uploadVideo on the Drive provider" });

  if (!video.ok) {
    return {
      ok: false,
      retryable: video.unsupported !== true,
      patch: {
        paul_folder_id: folder.folderId,
        drive_brief_file_id: brief.fileId,
        delivery_note: String(video.error).slice(0, 500)
      },
      error: video.error,
      note: null
    };
  }

  return ok({
    status: "delivered",
    paul_folder_id: folder.folderId,
    drive_brief_file_id: brief.fileId,
    drive_final_file_id: video.fileId,
    delivered_at: new Date().toISOString()
  });
}

/** The steps, by name, so the sweeper does not hold a switch statement. */
export const STEPS = Object.freeze({
  stage, submagicCreate, readTranscript, matchAndRename,
  placeBrollAndExport, pollFinished, saveFinishedAndNotify, deliverToPaul
});

/**
 * advance(row, ports) → { ok, retryable, patch, error, note, step }
 *
 * Runs the ONE step this row's state calls for. A state with no step is a
 * resting place and comes back `skipped` — which is the right answer for
 * `awaiting_approval`, where the next move belongs to a person.
 *
 * NEVER THROWS.
 */
export async function advance(row, ports = {}) {
  const state = String(row?.status || "");
  const name = NEXT_STEP[state];
  if (!name) return { ...skip(`nothing to do at "${state}"`), step: null };
  try {
    const out = await STEPS[name](row, ports);
    return { ...out, step: name };
  } catch (err) {
    /* A bug in a step must not take the pass down: the other rows in this pass
       still have work to do, and the next pass is the recovery. */
    return { ...wait(`${name} threw: ${String(err?.message || err)}`), step: name };
  }
}

export default advance;
