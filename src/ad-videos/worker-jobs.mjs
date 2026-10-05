// The four video-worker jobs (spec 9.5), written against ports. PURE ORCHESTRATION.
//
// `video-worker/` is a thin shell (CLAUDE.md §12 trap 22). It owns the things
// that cannot be unit-tested here: a child process, R2, Remotion's Chrome. It
// hands this file an `io` object, and this file decides every step and every
// argument, using `src/ad-videos/ffmpeg-plan.mjs` (9.3) and
// `src/ad-videos/overlay-plan.mjs` (9.4). Tests drive it with fakes; nothing
// here touches a disk, a network or a binary.
//
// THE ORDER NEVER CHANGES: cut -> Submagic captions -> animation overlays ->
// finalize. `build_cut` never draws an animation. `render_and_overlay` is last.
//
// The ports (`io`):
//   download({url, headers}, path)        fetch a URL to a local file
//   run(bin, args) -> {code, stdout, stderr}   bin is 'ffmpeg' or 'ffprobe'
//   writeText(path, text)
//   dir, path(name)                        this job's work dir, and a path inside it
//   putFile(key, path, contentType)        local file -> R2
//   getFile(key, path)                     R2 -> local file
//   has(key) -> boolean                    is this key in R2
//   renderClip({template, props, frames, mode, outPath})   Remotion
//
// `plan` is the module `ffmpeg-plan.mjs`. It is passed in (not imported) so
// this file stands on its own until that module is on the branch it runs on.

import { resolve, sep } from "node:path";
import { clipKey, driveDownloadRequest, isSafeId } from "./worker-protocol.mjs";
import { planAnimations, overlayArgs, loudnessFixArgs, remuxArgs, finalizeVerdict } from "./overlay-plan.mjs";

/** A job that cannot finish. `code` is stable text a screen can show; `detail` is data. */
export class JobFailure extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "JobFailure";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * A path inside this job's work dir. Ids that reach a file name must match
 * [A-Za-z0-9_-]{1,64} (checked again here, not only at the door), and the
 * resolved path must stay under `io.dir`.
 */
export function workPath(io, name) {
  const p = io.path(name);
  const root = resolve(io.dir) + sep;
  if (!resolve(p).startsWith(root)) throw new JobFailure("path_escape", `'${String(name).slice(0, 40)}' resolves outside the work directory`);
  return p;
}

function safeId(id, what) {
  if (!isSafeId(id)) throw new JobFailure("bad_id", `${what} id '${String(id).slice(0, 20)}' is not [A-Za-z0-9_-]{1,64}`);
  return id;
}

async function ffmpeg(io, args, what) {
  const r = await io.run("ffmpeg", args);
  if (r.code !== 0) throw new JobFailure("ffmpeg_failed", `${what} failed (exit ${r.code})`, { tail: tail(r.stderr) });
  return r;
}

async function probe(io, plan, path, what) {
  const r = await io.run("ffprobe", plan.probeArgs(path));
  if (r.code !== 0) throw new JobFailure("ffprobe_failed", `${what}: ffprobe failed (exit ${r.code})`, { tail: tail(r.stderr) });
  try {
    return plan.probeFacts(r.stdout);
  } catch (err) {
    throw new JobFailure(err?.code || "probe_unreadable", `${what}: ${err?.message || err}`);
  }
}

const tail = (text) => String(text ?? "").split(/\r?\n/).slice(-8).join("\n");

async function fetchTo(io, request, path, what) {
  try {
    await io.download(request, path);
  } catch (err) {
    throw new JobFailure("download_failed", `${what}: ${err?.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// prepare (9.1 step 3): probe, audio for Whisper, silences. Never uploads a raw take.
// ---------------------------------------------------------------------------

export async function runPrepare({ job, io, plan }) {
  const p = job.payload;
  const takePath = io.path("take.bin");
  await fetchTo(io, driveDownloadRequest({ fileId: p.drive.file_id, accessToken: p.drive.access_token }), takePath, "download the take");

  const facts = await probe(io, plan, takePath, "probe the take");
  if (!facts.hasAudio) throw new JobFailure("take_without_audio", "the take has no audio");

  const audioPath = io.path("audio.ogg");
  await ffmpeg(io, plan.audioExtractArgs({ inputPath: takePath, outputPath: audioPath }), "extract the audio");

  const sil = await ffmpeg(io, plan.silencedetectArgs({ inputPath: takePath }), "detect silences");
  const silences = plan.parseSilences(sil.stderr, { durationSeconds: facts.durationSeconds });

  await io.putFile(p.audio_key, audioPath, "audio/ogg");
  return {
    audio_storage_key: p.audio_key,
    silences,
    recorded_at: facts.recordedAt,
    facts: {
      duration_seconds: facts.durationSeconds,
      width: facts.width,
      height: facts.height,
      rotation: facts.rotation,
      color_transfer: facts.colorTransfer,
      is_hdr: facts.isHdr,
      fps: facts.fps,
    },
  };
}

// ---------------------------------------------------------------------------
// build_cut (9.3): the master, no animations. Any failed cut check blocks it.
// ---------------------------------------------------------------------------

export async function runBuildCut({ job, io, plan }) {
  const p = job.payload;
  const takes = {};
  for (const [id, t] of Object.entries(p.takes)) {
    const path = workPath(io, `take-${safeId(id, "take")}.bin`);
    await fetchTo(io, driveDownloadRequest({ fileId: t.drive_file_id, accessToken: p.drive.access_token }), path, `download take ${id}`);
    takes[id] = { path, facts: await probe(io, plan, path, `probe take ${id}`) };
  }

  const masterPath = io.path("master.mp4");
  let master;
  try {
    master = plan.planMaster({
      videoKind: p.video_kind,
      pieces: p.pieces,
      takes,
      flipHorizontal: Boolean(p.flip_horizontal),
      workDir: io.dir,
      outputPath: masterPath,
    });
  } catch (err) {
    throw new JobFailure(err?.code || "plan_failed", err?.message || String(err));
  }

  // Match loudness across pieces before joining (cut checks).
  const sourceMeasures = [];
  for (const piece of master.pieces) {
    const r = await ffmpeg(io, piece.measureArgs, `measure piece ${piece.index + 1}`);
    sourceMeasures.push(plan.parseLoudnorm(r.stderr));
  }
  const gains = plan.matchPieceGains(sourceMeasures);

  const pieceMeasures = [];
  for (const piece of master.pieces) {
    await ffmpeg(io, piece.encodeArgs(gains[piece.index]), `encode piece ${piece.index + 1}`);
    const r = await ffmpeg(io, piece.checkArgs, `check piece ${piece.index + 1}`);
    pieceMeasures.push(plan.parseLoudnorm(r.stderr));
  }

  await io.writeText(master.concatListPath, master.concatList);
  const pass1 = await ffmpeg(io, master.pass1Args, "loudnorm pass 1");
  // Pass 2's stderr is kept: cutChecks needs it to prove the pass stayed linear.
  const pass2 = await ffmpeg(io, master.pass2Args(plan.parseLoudnorm(pass1.stderr)), "the final encode");

  const bd = await ffmpeg(io, master.blackdetectArgs, "blackdetect");
  const fc = await io.run("ffprobe", plan.frameCountArgs({ inputPath: masterPath }));
  if (fc.code !== 0) throw new JobFailure("ffprobe_failed", `count the master's frames: ffprobe failed (exit ${fc.code})`, { tail: tail(fc.stderr) });
  const checks = plan.cutChecks({
    pieces: master.pieces,
    pieceMeasures,
    black: plan.parseBlackdetect(bd.stderr),
    silences: p.silences ?? {},
    masterFrames: plan.parseFrameCount(fc.stdout),
    plannedFrames: master.frames,
    pass2: plan.parseLoudnorm(pass2.stderr),
  });
  if (!checks.ok) {
    // The master is never uploaded and Submagic is never paid for.
    throw new JobFailure("cut_checks", `the cut failed ${checks.failures.length} check(s)`, { failures: checks.failures });
  }

  const mfacts = await probe(io, plan, masterPath, "probe the master");
  await io.putFile(p.cut_key, masterPath, "video/mp4");
  return {
    cut_storage_key: p.cut_key,
    master_duration_seconds: mfacts.durationSeconds,
    frames: master.frames,
    piece_gains_db: gains,
  };
}

// ---------------------------------------------------------------------------
// copy_export (9.1 step 10): Submagic's export into R2.
// ---------------------------------------------------------------------------

export async function runCopyExport({ job, io, plan }) {
  const p = job.payload;
  const path = io.path("export.mp4");
  await fetchTo(io, { url: p.export_url, headers: {} }, path, "download Submagic's export");
  const facts = await probe(io, plan, path, "probe Submagic's export");
  await io.putFile(p.submagic_key, path, "video/mp4");
  return {
    submagic_storage_key: p.submagic_key,
    export_duration_seconds: facts.durationSeconds,
    width: facts.displayWidth,
    height: facts.displayHeight,
  };
}

// ---------------------------------------------------------------------------
// render_and_overlay (9.1 step 11, 9.4): clips, overlay, finalize. Always last.
// ---------------------------------------------------------------------------

/** Anchors are re-mapped by Netlify (it has Submagic's words) when the export drifts past this. */
export const ANCHOR_DRIFT_SECONDS = 0.1;

export async function runRenderAndOverlay({ job, io, plan }) {
  const p = job.payload;
  const basePath = io.path("submagic.mp4");
  await io.getFile(p.submagic_key, basePath);
  const baseFacts = await probe(io, plan, basePath, "probe the Submagic export");

  const drift = Math.abs(baseFacts.durationSeconds - p.master_duration_seconds);
  const { accepted, skipped } = planAnimations({
    animations: p.animations,
    durationSeconds: baseFacts.durationSeconds,
    mode: p.animation_mode,
    cta: p.cta ?? null,
  });

  // Clips are cached in R2 by a hash of template + props: an unchanged clip never re-renders.
  const clips = [];
  const rendered = [];
  const reused = [];
  for (const a of accepted) {
    const args = { template: a.template, props: a.props ?? {}, frames: a.frames, mode: p.animation_mode };
    const key = clipKey(args);
    safeId(a.template, "template");
    const local = workPath(io, `clip-${safeId(a.id, "animation")}.${p.animation_mode === "overlay" ? "mov" : "mp4"}`);
    if (await io.has(key)) {
      await io.getFile(key, local);
      reused.push(a.id);
    } else {
      try {
        await io.renderClip({ ...args, outPath: local });
      } catch (err) {
        throw new JobFailure("render_failed", `render ${a.template} (${a.id}): ${err?.message || err}`);
      }
      await io.putFile(key, local, p.animation_mode === "overlay" ? "video/quicktime" : "video/mp4");
      rendered.push(a.id);
    }
    clips.push({ path: local, start: a.start, seconds: a.seconds });
  }

  let current = basePath;
  if (clips.length > 0) {
    const overlaid = io.path("overlaid.mp4");
    await ffmpeg(io, overlayArgs({ basePath, clips, outputPath: overlaid, plan }), "the overlay");
    current = overlaid;
  }

  // Finalize: size and length, loudness, then +faststart.
  const measure = async (path) => {
    const r = await ffmpeg(io, plan.pieceLoudnessArgs({ piecePath: path }), "measure loudness");
    return plan.parseLoudnorm(r.stderr);
  };
  let facts = await probe(io, plan, current, "probe the overlaid video");
  const verdict = finalizeVerdict({ facts, masterDurationSeconds: p.master_duration_seconds, loudness: await measure(current) });
  if (!verdict.ok) throw new JobFailure("finalize_checks", "the finished video failed a finalize check", { problems: verdict.problems });

  let loudnessFixed = false;
  if (verdict.fixLoudness) {
    const fixed = io.path("loudness-fixed.mp4");
    await ffmpeg(io, loudnessFixArgs({ inputPath: current, outputPath: fixed, measured: await measure(current), plan }), "the loudness fix");
    current = fixed;
    loudnessFixed = true;
    facts = await probe(io, plan, current, "probe after the loudness fix");
  }

  const finalPath = io.path("final.mp4");
  await ffmpeg(io, remuxArgs({ inputPath: current, outputPath: finalPath, plan }), "the faststart remux");
  await io.putFile(p.final_key, finalPath, "video/mp4");

  return {
    storage_final_key: p.final_key,
    duration_seconds: facts.durationSeconds,
    animation_items: { accepted: accepted.map(({ id, template, start, end }) => ({ id, template, start, end })), skipped },
    rendered_clip_ids: rendered,
    reused_clip_ids: reused,
    loudness_fixed: loudnessFixed,
    anchor_drift_seconds: Number(drift.toFixed(3)),
    anchors_need_remap: drift > ANCHOR_DRIFT_SECONDS,
  };
}

export const RUNNERS = Object.freeze({
  prepare: runPrepare,
  build_cut: runBuildCut,
  copy_export: runCopyExport,
  render_and_overlay: runRenderAndOverlay,
});

/** Run one validated job. Resolves to `{status:'done', result}` or `{status:'failed', error}`. Never throws. */
export async function runJob({ job, io, plan }) {
  const runner = RUNNERS[job.type];
  if (!runner) return { status: "failed", error: { code: "unknown_type", message: `no runner for ${job.type}` } };
  try {
    return { status: "done", result: await runner({ job, io, plan }) };
  } catch (err) {
    if (err instanceof JobFailure) {
      return { status: "failed", error: { code: err.code, message: err.message, detail: err.detail } };
    }
    return { status: "failed", error: { code: err?.code || "unexpected", message: String(err?.message || err) } };
  }
}
