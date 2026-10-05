// The video worker's wire protocol (spec 9.5). PURE: no network, no files.
//
// Two programs speak it. Netlify (`src/messaging/providers/video-worker.mjs`
// and `src/ad-videos/worker-callback.mjs`) and the worker service
// (`video-worker/`). Both import this one file, so a job id, a header name or
// a signature can never mean two things (CLAUDE.md §12 trap 22: logic in src/,
// the service is a thin shell).
//
//   Netlify -> worker   POST /jobs   header X-Fundhub-Video-Key
//   worker  -> Netlify  POST /api/webhooks/video-worker
//                       headers X-Fundhub-Timestamp + X-Fundhub-Signature
//                       signature = HMAC-SHA256(secret, `${timestamp}.${body}`)
//
// The worker holds NO Google credential. A job that touches Drive carries a
// one-hour token from `driveAccessToken()` in its payload (spec 9.1 step 3).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const VIDEO_KEY_HEADER = "x-fundhub-video-key";
export const TIMESTAMP_HEADER = "x-fundhub-timestamp";
export const SIGNATURE_HEADER = "x-fundhub-signature";

/** The callback is valid for five minutes either side of now (spec 9.5). */
export const CALLBACK_WINDOW_SECONDS = 300;

/** A claim older than this is reclaimable (spec 9.5). */
export const CLAIM_STALE_MINUTES = 20;

export const JOB_TYPES = Object.freeze(["prepare", "build_cut", "copy_export", "render_and_overlay"]);

/**
 * Which row state each job starts from and which it ends in. The callback
 * handler re-reads the row and acts only when the row is still in `from`
 * (spec 9.5: "the handler re-reads the row's state before it acts"). A late or
 * duplicate callback therefore changes nothing.
 *
 * UNVERIFIED against `states.mjs` until PR #26 (9.1) merges: the names come
 * from the spec's forward order.
 */
export const JOB_FLOW = Object.freeze({
  prepare: Object.freeze({ from: "raw_landed", to: "prepared" }),
  build_cut: Object.freeze({ from: "cut", to: "staged" }),
  copy_export: Object.freeze({ from: "editing", to: "rendered" }),
  render_and_overlay: Object.freeze({ from: "rendered", to: "animated" }),
});

/**
 * The claim (spec 9.5, word for word). One row, one job at a time; a claim
 * older than 20 minutes can be taken over. $1 = job id, $2 = ad_videos.id.
 */
export const CLAIM_SQL =
  "UPDATE ad_videos SET worker_job_id=$1, worker_claimed_at=now() " +
  "WHERE id=$2 AND (worker_job_id IS NULL OR worker_claimed_at < now() - interval '20 minutes') " +
  "RETURNING id";

export class WorkerProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkerProtocolError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Job ids and requests
// ---------------------------------------------------------------------------

/** `<ad_video_id>:<type>:<cut_version>` (spec 9.5). */
export function jobId({ adVideoId, type, cutVersion = 0 }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(adVideoId ?? ""))) {
    throw new WorkerProtocolError("bad_ad_video_id", "ad_video_id must match [A-Za-z0-9_-]{1,64}");
  }
  if (!JOB_TYPES.includes(type)) throw new WorkerProtocolError("bad_type", `unknown job type '${type}'`);
  const v = Number(cutVersion);
  if (!Number.isInteger(v) || v < 0) throw new WorkerProtocolError("bad_cut_version", "cut_version must be a whole number");
  return `${adVideoId}:${type}:${v}`;
}

export function parseJobId(id) {
  const m = /^([^:\s]+):([a-z_]+):(\d+)$/.exec(String(id ?? ""));
  if (!m || !JOB_TYPES.includes(m[2])) throw new WorkerProtocolError("bad_job_id", `not a job id: ${id}`);
  return { adVideoId: m[1], type: m[2], cutVersion: Number(m[3]) };
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

/** Ids that become file names or Remotion composition ids: no dots, slashes or spaces. */
export const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const isSafeId = (v) => typeof v === "string" && SAFE_ID.test(v);

/**
 * The only R2 keys a job may name, one pattern per kind. They match the key
 * builders below, so a payload cannot point the worker at another object.
 */
export const KEY_PATTERNS = Object.freeze({
  audio: /^partners\/[A-Za-z0-9_-]+\/ad-video\/audio\/[A-Za-z0-9_-]+\.ogg$/,
  cut: /^partners\/[A-Za-z0-9_-]+\/ad-video\/cut\/[A-Za-z0-9_-]+-v\d+\.mp4$/,
  submagic: /^partners\/[A-Za-z0-9_-]+\/ad-video\/submagic\/[A-Za-z0-9_-]+-v\d+\.mp4$/,
  final: /^partners\/[A-Za-z0-9_-]+\/ad-video\/final\/[A-Za-z0-9_-]+-r\d+\.mp4$/,
});
export const validKey = (kind, key) => typeof key === "string" && KEY_PATTERNS[kind].test(key);

/**
 * Submagic's export link must come from these hosts (suffix match). The real
 * host is not documented (docs/specs/video-pipeline-api-verification-2026-09-22.md
 * names a "direct .mp4" and a CloudFront playback URL), so this is a guess
 * that the first real run must confirm; `extraHosts` (the worker's
 * VIDEO_WORKER_EXPORT_HOSTS) widens it without a code change.
 */
export const EXPORT_HOST_SUFFIXES = Object.freeze(["submagic.co", "cloudfront.net"]);

export function exportUrlOk(url, extraHosts = []) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return [...EXPORT_HOST_SUFFIXES, ...extraHosts].some((s) => {
    const suf = String(s).trim().toLowerCase().replace(/^\./, "");
    return suf && (host === suf || host.endsWith(`.${suf}`));
  });
}

/**
 * What each job type must carry. A check here is a bounce at the door (400)
 * instead of a half-run job; nothing here guesses a default.
 */
const PAYLOAD_RULES = {
  prepare(p) {
    need(isObj(p.drive) && isText(p.drive.file_id) && isText(p.drive.access_token), "payload.drive needs file_id and access_token");
    need(isSafeId(p.take_id), "payload.take_id must match [A-Za-z0-9_-]{1,64}");
    need(validKey("audio", p.audio_key), "payload.audio_key must be a partners/<id>/ad-video/audio/<id>.ogg key");
  },
  build_cut(p) {
    need(p.video_kind === "ad", "payload.video_kind must be 'ad' (the 1080x1920 master is for ads only)");
    need(Array.isArray(p.pieces) && p.pieces.length > 0, "payload.pieces is the aligner's piece list");
    need(isObj(p.takes) && Object.keys(p.takes).length > 0, "payload.takes maps take id to its Drive file");
    for (const [id, t] of Object.entries(p.takes)) {
      need(isSafeId(id), `payload.takes id '${String(id).slice(0, 20)}' must match [A-Za-z0-9_-]{1,64}`);
      need(isObj(t) && isText(t.drive_file_id), `payload.takes.${id}.drive_file_id is required`);
    }
    for (const [i, piece] of p.pieces.entries()) {
      const id = piece?.take_id ?? piece?.take;
      need(isSafeId(id) && Object.hasOwn(p.takes, id), `piece ${i + 1} names a take that is not in payload.takes`);
    }
    need(isObj(p.drive) && isText(p.drive.access_token), "payload.drive.access_token is required");
    need(isObj(p.silences ?? {}), "payload.silences must be { takeId: [{start,end}] }");
    need(validKey("cut", p.cut_key), "payload.cut_key must be a partners/<id>/ad-video/cut/<id>-v<n>.mp4 key");
  },
  copy_export(p, opts) {
    need(exportUrlOk(p.export_url, opts.exportHosts), "payload.export_url must be an https link on a Submagic export host");
    need(validKey("submagic", p.submagic_key), "payload.submagic_key must be a partners/<id>/ad-video/submagic/<id>-v<n>.mp4 key");
  },
  render_and_overlay(p) {
    need(validKey("submagic", p.submagic_key), "payload.submagic_key must be a submagic key");
    need(validKey("final", p.final_key), "payload.final_key must be a partners/<id>/ad-video/final/<ad>-r<n>.mp4 key");
    need(Number(p.master_duration_seconds) > 0, "payload.master_duration_seconds is required");
    need(["fullframe", "overlay"].includes(p.animation_mode), "payload.animation_mode must be 'fullframe' or 'overlay'");
    need(Array.isArray(p.animations), "payload.animations must be a list (it may be empty)");
    for (const [i, a] of p.animations.entries()) {
      need(isObj(a) && isSafeId(a.id), `animation ${i + 1}: id must match [A-Za-z0-9_-]{1,64}`);
      need(isSafeId(a.template), `animation ${a.id}: template must match [A-Za-z0-9_-]{1,64}`);
    }
  },
};

function need(ok, message) {
  if (!ok) throw new WorkerProtocolError("bad_payload", message);
}

/**
 * Validate `POST /jobs` (spec 9.5): `{type, ad_video_id, payload}` plus the
 * `job_id` and `org_id` Netlify minted. Returns the normalised job or throws
 * WorkerProtocolError. `opts.exportHosts` widens the Submagic host allow-list.
 */
export function validateJobRequest(body, opts = {}) {
  if (!isObj(body)) throw new WorkerProtocolError("bad_body", "body must be a JSON object");
  const { type, ad_video_id: adVideoId, payload } = body;
  if (!JOB_TYPES.includes(type)) throw new WorkerProtocolError("bad_type", `type must be one of ${JOB_TYPES.join(", ")}`);
  if (!isText(adVideoId)) throw new WorkerProtocolError("bad_ad_video_id", "ad_video_id is required");
  if (!isText(body.org_id)) throw new WorkerProtocolError("bad_org_id", "org_id is required");
  if (!isObj(payload)) throw new WorkerProtocolError("bad_payload", "payload must be an object");
  const cutVersion = body.cut_version ?? 0;
  const id = jobId({ adVideoId, type, cutVersion });
  if (body.job_id !== undefined && body.job_id !== id) {
    throw new WorkerProtocolError("bad_job_id", `job_id ${body.job_id} does not match ${id}`);
  }
  PAYLOAD_RULES[type](payload, { exportHosts: opts.exportHosts ?? [] });
  return { id, type, adVideoId, orgId: body.org_id, cutVersion: Number(cutVersion), payload };
}

// ---------------------------------------------------------------------------
// Auth: the key header, and the signed callback
// ---------------------------------------------------------------------------

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  if (x.length !== y.length || x.length === 0) return false;
  return timingSafeEqual(x, y);
}

/** Every worker call needs X-Fundhub-Video-Key. An unset key refuses everything. */
export function keyOk(headers, expectedKey) {
  if (!isText(expectedKey)) return false;
  const h = headers ?? {};
  const got = h[VIDEO_KEY_HEADER] ?? h["X-Fundhub-Video-Key"];
  return safeEqual(got, expectedKey);
}

/** HMAC-SHA256 over `${timestamp}.${body}`, hex. */
export function signCallback({ secret, timestamp, body }) {
  if (!isText(secret)) throw new WorkerProtocolError("no_secret", "callback secret is not set");
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** The headers the worker sends with a callback body. */
export function callbackHeaders({ secret, body, now = Date.now() }) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "content-type": "application/json",
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signCallback({ secret, timestamp, body }),
  };
}

/**
 * Check a callback. Returns { ok: true } or { ok: false, reason }. The window
 * is five minutes either side, so a captured callback cannot be replayed later.
 */
export function verifyCallback({ secret, headers, rawBody, now = Date.now(), windowSeconds = CALLBACK_WINDOW_SECONDS }) {
  if (!isText(secret)) return { ok: false, reason: "secret_not_set" };
  const h = headers ?? {};
  const timestamp = h[TIMESTAMP_HEADER] ?? h["X-Fundhub-Timestamp"];
  const signature = h[SIGNATURE_HEADER] ?? h["X-Fundhub-Signature"];
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !isText(String(signature ?? ""))) return { ok: false, reason: "missing_headers" };
  if (Math.abs(now / 1000 - ts) > windowSeconds) return { ok: false, reason: "stale_timestamp" };
  const want = signCallback({ secret, timestamp: String(timestamp), body: String(rawBody ?? "") });
  return safeEqual(signature, want) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

// ---------------------------------------------------------------------------
// R2 keys (spec 9.1, 9.5). All keys live in the private bucket fundhub-ad-video.
// ---------------------------------------------------------------------------

const seg = (v, name) => {
  const s = String(v ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new WorkerProtocolError("bad_key_part", `${name} '${s}' is not safe in an R2 key`);
  return s;
};

export const audioKey = ({ partnerId, adVideoId }) =>
  `partners/${seg(partnerId, "partner id")}/ad-video/audio/${seg(adVideoId, "ad video id")}.ogg`;

export const cutKey = ({ partnerId, adVideoId, cutVersion }) =>
  `partners/${seg(partnerId, "partner id")}/ad-video/cut/${seg(adVideoId, "ad video id")}-v${Number(cutVersion) || 0}.mp4`;

export const submagicKey = ({ partnerId, adVideoId, cutVersion }) =>
  `partners/${seg(partnerId, "partner id")}/ad-video/submagic/${seg(adVideoId, "ad video id")}-v${Number(cutVersion) || 0}.mp4`;

/** `partners/<house partner id>/ad-video/final/<ad>-r<round>.mp4` (spec 9.1 step 11). */
export const finalKey = ({ partnerId, adNumber, round = 1 }) =>
  `partners/${seg(partnerId, "partner id")}/ad-video/final/${seg(adNumber, "ad number")}-r${Number(round) || 1}.mp4`;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isObj(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The clip cache key: a hash of template + props (+ the render settings that
 * change pixels), so a clip that has not changed never re-renders (spec 9.1
 * step 11). Key order in `props` does not matter.
 */
export function clipHash({ template, props = {}, frames, mode = "fullframe", kitVersion = "1" }) {
  if (!isText(template)) throw new WorkerProtocolError("bad_template", "template is required");
  return createHash("sha256")
    .update(stable({ template, props, frames: frames ?? null, mode, kitVersion }))
    .digest("hex");
}

export const clipKey = (args) => {
  const ext = (args.mode ?? "fullframe") === "overlay" ? "mov" : "mp4";
  return `cache/animations/${clipHash(args)}.${ext}`;
};

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

/**
 * The request that downloads a take. The token is the one-hour Drive token
 * Netlify sent with the job; the worker never holds a Google credential.
 */
export function driveDownloadRequest({ fileId, accessToken }) {
  if (!isText(fileId) || !/^[A-Za-z0-9_-]+$/.test(fileId)) throw new WorkerProtocolError("bad_drive_id", "bad Drive file id");
  if (!isText(accessToken)) throw new WorkerProtocolError("no_drive_token", "the job carried no Drive token");
  return {
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    headers: { authorization: `Bearer ${accessToken}` },
  };
}
