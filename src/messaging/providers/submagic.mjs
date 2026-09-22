// Submagic — captions and B-roll on a filmed take.
//
// CLAUDE.md §12: "Outbound transmission is permitted in src/messaging/providers/*
// and nowhere else." That is why every Submagic request lives in this file and
// why src/ad-videos/* calls this module rather than reaching for fetch.
//
// SHIPS UNROUTED, DELIBERATELY. `ENABLED = false` and this module is NOT in
// providers/index.mjs — same posture as web-push.mjs. `video_edit` is not a
// channel in message_channel_routing and the dispatcher has never heard of it,
// so nothing in the message queue can reach this code by accident. It wears the
// provider contract (PROVIDER / CHANNELS / ADDRESS_FIELD / ENABLED / TRANSMITS /
// send) so that registering it later would be one line, with no rewrite.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE FENCE IS `ADAPTERS`, NOT `INTERNAL`.
//
// src/lib/outbound-fetch.mjs says it in its own words: "If what you are adding
// can reach a person or change a record at a vendor, it is not INTERNAL." A
// Create Project call makes a project inside our Submagic account and spends
// billable API minutes off the plan. That is a vendor record and it is money.
// ADAPTERS is the fence for exactly that, and it needs no edit to the pinned
// INTERNAL list in src/lib/no-unfenced-transmit.test.mjs.
//
// The cost is real and worth naming: with ADAPTERS_DRY_RUN unset, nothing is
// sent and every call comes back `blocked`. That is the intended default — an
// edit that costs money should not start because a deploy forgot a variable.
// ═══════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════
// THE THREE THINGS THAT USED TO BE GUESSES ARE NOW MEASURED.
//
// docs/specs/video-pipeline-unknowns-settled-2026-09-22.md mapped this API with
// live calls on 2026-09-22 and spent nothing doing it: the server checks the
// ROUTE before it checks the key, so `401 UNAUTHORIZED` means the path exists
// and `404 NOT_FOUND` means it does not.
//
//   * HOST — `https://api.submagic.co` answers. `api.submagic.com` does not
//     resolve at all. CONFIRMED. Still overridable by SUBMAGIC_API_BASE.
//   * AUTH HEADER — `x-api-key`, quoted verbatim in Submagic's own docs on
//     create-project and user-media-upload. CONFIRMED, not a guess.
//   * EXPORT PATH — `POST /v1/projects/{id}/export` answers 401, so the route
//     is real. CONFIRMED. SUBMAGIC_EXPORT_PATH still overrides it.
//
// Two corrections from the same measurement, both of which cost money if
// ignored:
//
//   1. `POST /v1/projects/{id}/user-media` DOES NOT EXIST — it is a 404, not a
//      401, so it was never going to start working once a key landed. The one
//      route Submagic documents for adding media is
//      `POST /v1/user-media/upload` — multipart, form field `file`, answering
//      `{ userMediaId }` — and a userMediaId is not scoped to a project.
//   2. Creates are **30 an hour**, not the 500 an earlier document recorded.
//
// WHAT IS STILL UNKNOWN: the key itself has never been exercised. It is stored
// on Netlify with `--secret`, so a laptop reads a mask and gets a 401 that
// proves nothing. The first live call has to come from a deployed function.
// ═══════════════════════════════════════════════════════════════════════════
//
// WHAT THIS MODULE WILL NOT DO, EVER:
//
//   * ai-broll. 3 AI credits per clip against 15 credits a month is five clips
//     for a hundred ads. buildItems() refuses any type that is not "user-media",
//     and createProject() refuses a payload carrying magicBrolls.
//   * removeSilencePace / removeBadTakes. Leaving them off is what removes the
//     B-roll timing risk in the research: the timeline never shortens, so item
//     times cannot drift off the transcript times.
//   * autoRender. Always false. The order is create → read the real words[] →
//     place our clips → export.
//   * Log the key. The chokepoint redacts error text; nothing here prints a
//     header or a credential at any level.

import {
  transmit, transmitBinary, postJsonTo, postBinaryTo, ADAPTERS, redact
} from "../../lib/outbound-fetch.mjs";
import { classify, success, failure, rejection } from "./http.mjs";

/** Must equal the `provider` value in message_channel_routing, if it is ever
    routed there. Not routed today — see the header. */
export const PROVIDER = "submagic";

/** The channel this provider would carry. `video_edit` is not in the routing
    table's channel set and adding it is not part of this file. */
export const CHANNELS = new Set(["video_edit"]);

/** Not a column on `clients`. The address of a Submagic edit is the project id
    on the ad_videos row. Named so nobody wires the dispatcher to read a column
    that does not exist. */
export const ADDRESS_FIELD = "submagic_project_id";

/** False: not registered, not routed, nothing in the queue can reach it. */
export const ENABLED = false;

/** True: this provider makes a real outbound HTTP request. */
export const TRANSMITS = true;

/* Rate limits, straight out of the research doc. Exported so the sweeper can
   bound a pass rather than discovering the ceiling as a 429. Export is the
   tight one — 50 an hour — and an update always costs a re-export, so a pass
   that re-edits the same take twice costs two of them. */
export const RATE_LIMITS = Object.freeze({
  /* 30, measured off https://docs.submagic.co/rate-limits.md on 2026-09-22.
     An earlier document said 500 and that number was wrong by a factor of
     sixteen — a sweeper that believed it would run into 429s it was told
     could not happen. */
  create: 30,
  upload: 30,
  userMedia: 500,
  get: 100,
  update: 100,
  export: 50,
  languages: 1000
});

/** Per the research: no more than 12 seconds between an item's start and end. */
export const MAX_ITEM_SECONDS = 12;

/** Dictionary caps from the research: 100 terms, 50 characters each. */
export const MAX_DICTIONARY_TERMS = 100;
export const MAX_DICTIONARY_TERM_CHARS = 50;

/* The brand spelling is the first dictionary term on every project. Owner law
   (.claude/rules/fundhub-company-name.md): the company is Fundhub. Captions
   that write it any other way are a defect on a hundred ads a month. */
export const BASE_DICTIONARY = Object.freeze(["Fundhub", "fundhub.ai"]);

/** Vendor ceilings from the research. A take past either cannot be sent. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 2 * 60 * 60;

/* UNVERIFIED — see the header. Defaults, all three overridable by env. */
const DEFAULT_API_BASE = "https://api.submagic.co";
const DEFAULT_AUTH_HEADER = "x-api-key";
const DEFAULT_EXPORT_PATH = "/v1/projects/{id}/export";

/**
 * submagicConfig(env) → { ok, apiBase, authHeader, exportPath, key, missing }
 *
 * Reads SUBMAGIC_API_KEY by name. The value is never returned to a caller that
 * logs, never interpolated into an error, and never printed.
 */
export function submagicConfig(env = process.env) {
  const key = String(env.SUBMAGIC_API_KEY || "").trim();
  const apiBase = String(env.SUBMAGIC_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const authHeader = String(env.SUBMAGIC_API_AUTH_HEADER || DEFAULT_AUTH_HEADER).trim();
  const exportPath = String(env.SUBMAGIC_EXPORT_PATH || DEFAULT_EXPORT_PATH).trim();
  if (!key) return { ok: false, missing: ["SUBMAGIC_API_KEY"], apiBase, authHeader, exportPath, key: "" };
  return { ok: true, missing: [], apiBase, authHeader, exportPath, key };
}

/** isSubmagicConfigured(env) → boolean. Reports; never throws. */
export function isSubmagicConfigured(env = process.env) {
  return submagicConfig(env).ok === true;
}

/* ─────────────────────────────────────────────────────────────────────────
   buildDictionary — brand terms Submagic should not mishear.

   Capped and de-duplicated here rather than at the call site, because the
   vendor rejects the whole project when the list is over 100 and a rejected
   project has already cost an API minute.
   ───────────────────────────────────────────────────────────────────────── */
export function buildDictionary(extra = []) {
  const out = [];
  const seen = new Set();
  for (const raw of [...BASE_DICTIONARY, ...(Array.isArray(extra) ? extra : [])]) {
    const term = String(raw || "").trim().slice(0, MAX_DICTIONARY_TERM_CHARS);
    if (!term) continue;
    const k = term.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(term);
    if (out.length >= MAX_DICTIONARY_TERMS) break;
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
   buildItems — OUR clips, placed, validated.

   Returns { ok, items, errors }. NEVER throws and never repairs a bad
   placement: a silently-moved clip lands on the wrong word and nobody sees it
   until the ad is live.

   The rules are the vendor's, from the research doc:
     * type must be "user-media". "ai-broll" is refused outright — 3 credits
       each against 15 a month is five clips for a hundred ads.
     * endTime strictly greater than startTime.
     * endTime - startTime no more than 12 seconds.
     * items may not overlap in time.
   ───────────────────────────────────────────────────────────────────────── */
export const ALLOWED_LAYOUTS = Object.freeze(new Set([
  "cover", "contain", "rounded", "square",
  "split-50-50", "split-35-65", "split-50-50-bordered", "split-35-65-bordered",
  "pip-top-right", "pip-bottom-right"
]));

export function buildItems(placements = []) {
  const errors = [];
  const items = [];

  for (const [i, p] of (Array.isArray(placements) ? placements : []).entries()) {
    const where = `item ${i + 1}`;
    const type = String(p?.type || "user-media");
    if (type !== "user-media") {
      errors.push(`${where}: type "${type}" is refused — this pipeline places our own clips only`);
      continue;
    }
    const userMediaId = String(p?.userMediaId || "").trim();
    if (!userMediaId) { errors.push(`${where}: no userMediaId`); continue; }

    const startTime = Number(p?.startTime);
    const endTime = Number(p?.endTime);
    if (!Number.isFinite(startTime) || startTime < 0) { errors.push(`${where}: startTime is not a number of seconds`); continue; }
    if (!Number.isFinite(endTime)) { errors.push(`${where}: endTime is not a number of seconds`); continue; }
    if (endTime <= startTime) { errors.push(`${where}: endTime must be after startTime`); continue; }
    if (endTime - startTime > MAX_ITEM_SECONDS) {
      errors.push(`${where}: ${(endTime - startTime).toFixed(2)}s is longer than the ${MAX_ITEM_SECONDS}s clip limit`);
      continue;
    }

    const item = { type, startTime, endTime, userMediaId };
    if (p?.layout) {
      const layout = String(p.layout);
      if (!ALLOWED_LAYOUTS.has(layout)) { errors.push(`${where}: layout "${layout}" is not one Submagic accepts`); continue; }
      item.layout = layout;
    }
    items.push(item);
  }

  items.sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < items.length; i += 1) {
    if (items[i].startTime < items[i - 1].endTime) {
      errors.push(
        `clips overlap: one ends at ${items[i - 1].endTime}s and the next starts at ${items[i].startTime}s`
      );
    }
  }

  return { ok: errors.length === 0, items, errors };
}

/* ─────────────────────────────────────────────────────────────────────────
   The transport. One place, one fence, one set of headers.
   ───────────────────────────────────────────────────────────────────────── */
function authHeaders(cfg) {
  return { [cfg.authHeader]: cfg.key, accept: "application/json" };
}

async function call(method, path, {
  body, env = process.env, fetchImpl, timeoutMs, signal, what
} = {}) {
  const cfg = submagicConfig(env);
  if (!cfg.ok) {
    return { ok: false, blocked: false, transmitted: false, status: 0, body: null,
      error: `Submagic is not configured: ${cfg.missing.join(", ")} is not set`, headers: {} };
  }
  const url = `${cfg.apiBase}${path}`;
  const opts = { fence: ADAPTERS, env, fetchImpl, timeoutMs, signal, what: what || `submagic ${method} ${path}` };

  if (method === "POST" && body !== undefined) {
    return postJsonTo(url, { headers: authHeaders(cfg), body: JSON.stringify(body), ...opts });
  }
  return transmit(url, {
    method,
    headers: body === undefined
      ? authHeaders(cfg)
      : { ...authHeaders(cfg), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, opts);
}

/* verdictOf — one shape for every call below, so a caller never has to read a
   status code. `retryable` is the field the sweeper acts on: a 429 or a 5xx is
   "not right now", a 400/422 is "this payload will never work".

   `sent` IS THE FIELD THAT DECIDES WHETHER WE MAY HAVE BEEN BILLED, and it is
   the only way to tell two identical-looking failures apart:

     sent: false → the request was never handed to fetch. The dry-run fence held
                   it, or it was refused before it left. Nothing happened at the
                   vendor, full stop.
     sent: true  → it went out. A status above zero means the vendor answered
                   and its answer is the truth; a status of zero means it went
                   out and never came back, and then NOBODY KNOWS whether a
                   project was made or a render started.

   src/ad-videos/pipeline.mjs reads this to decide whether to clear a spend
   claim. Collapsing all three into "retryable" is what would let a crashed
   upload be paid for twice. */
function verdictOf(res, what) {
  if (res.blocked) {
    return { ok: false, retryable: true, status: 0, sent: false,
      error: res.error || `${what} held by the adapters fence`, body: null };
  }
  if (res.transmitted === false) {
    return { ok: false, retryable: true, status: 0, sent: false,
      error: res.error || `${what} was not sent`, body: null };
  }
  if (res.status === 0) {
    return { ok: false, retryable: true, status: 0, sent: true,
      error: res.error || `${what} did not complete`, body: null };
  }
  if (res.status === 401 || res.status === 403) {
    /* Named on purpose. Two of the three things this module cannot verify are
       the host and the header name, and both present as a 401. */
    return { ok: false, retryable: true, status: res.status, sent: true,
      error: redact(`${what}: HTTP ${res.status}. Check SUBMAGIC_API_KEY, and that ` +
        `SUBMAGIC_API_BASE and SUBMAGIC_API_AUTH_HEADER match Submagic's own docs — ` +
        `neither is recorded in the API research.`),
      body: null };
  }
  const cls = classify(res.status);
  if (cls.status === "sent") return { ok: true, retryable: false, status: res.status, sent: true, error: null, body: res.body };
  return { ok: false, retryable: cls.retryable, status: res.status, sent: true,
    error: redact(res.error || `${what} returned HTTP ${res.status}`), body: res.body };
}

/* ─────────────────────────────────────────────────────────────────────────
   createProject — POST /v1/projects

   autoRender is FORCED false and cannot be overridden by a caller. The whole
   B-roll timing answer depends on reading the real words[] before placing a
   clip, and that is impossible once the project has already rendered.
   ───────────────────────────────────────────────────────────────────────── */
export async function createProject({
  title, language = "en", videoUrl, webhookUrl, dictionary = [],
  templateName, hookTitle, cleanAudio,
  env = process.env, fetchImpl, timeoutMs, signal
} = {}) {
  const t = String(title || "").trim();
  const v = String(videoUrl || "").trim();
  if (!t) return { ok: false, retryable: false, error: "createProject needs a title" };
  if (!v) return { ok: false, retryable: false, error: "createProject needs a videoUrl" };
  if (!/^https?:\/\//i.test(v)) {
    return { ok: false, retryable: false,
      error: "videoUrl must be a plain http(s) link to the media itself. A Google Drive " +
             "share or folder link is refused by Submagic and its virus-scan page breaks " +
             "downloads over 25 MB." };
  }

  const payload = {
    title: t,
    language: String(language || "en"),
    videoUrl: v,
    /* THE FOUR SWITCHES THAT ARE NOT NEGOTIABLE. See the file header. */
    autoRender: false,
    magicBrolls: false,
    removeBadTakes: false,
    dictionary: buildDictionary(dictionary)
  };
  if (webhookUrl) payload.webhookUrl = String(webhookUrl);
  if (templateName) payload.templateName = String(templateName);
  if (hookTitle) payload.hookTitle = String(hookTitle);
  if (cleanAudio === true) payload.cleanAudio = true;

  const res = await call("POST", "/v1/projects", { body: payload, env, fetchImpl, timeoutMs, signal, what: "submagic create project" });
  const v2 = verdictOf(res, "submagic create project");
  if (!v2.ok) return v2;
  const projectId = v2.body?.id || v2.body?.projectId || null;
  if (!projectId) {
    return { ...v2, ok: false, retryable: false,
      error: "Submagic accepted the project but returned no id — nothing downstream can find this edit" };
  }
  return { ...v2, projectId: String(projectId) };
}

/* ─────────────────────────────────────────────────────────────────────────
   createProjectFromFile — POST /v1/projects/upload

   THE PREFERRED ROUTE, and the one that makes the whole staging problem go
   away. Submagic takes the media itself as a multipart upload, up to 2 GB, so
   there is no public URL anywhere: no virus-scan page, no link that expires,
   no bet on whether the vendor's downloader likes our host, and the take never
   has to be readable by the world in order to be captioned.

   Same four switches as createProject and for the same reasons — they are sent
   as strings because a multipart field is text on the wire.

   Rate limit 30 an hour, same as the URL route. A failed upload costs one of
   them, so the size check happens before a byte is sent.
   ───────────────────────────────────────────────────────────────────────── */
export async function createProjectFromFile({
  title, language = "en", file, fileName = "take.mp4", contentType = "video/mp4",
  webhookUrl, dictionary = [], templateName, hookTitle, cleanAudio,
  env = process.env, fetchImpl, timeoutMs, signal, maxBytes = MAX_FILE_BYTES
} = {}) {
  const t = String(title || "").trim();
  if (!t) return { ok: false, retryable: false, sent: false, error: "createProjectFromFile needs a title" };
  if (!file || typeof file.byteLength !== "number" || file.byteLength <= 0) {
    return { ok: false, retryable: false, sent: false, error: "createProjectFromFile needs the file's bytes" };
  }
  /* Checked against BOTH ceilings here, before a byte is sent. The chokepoint
     has its own cap and would refuse too, but it reports that as "nothing was
     sent", which a caller reads as retryable — and a file that is too big will
     be exactly as big on the next pass. This says never, once. */
  const cap = Math.min(Number(maxBytes) || MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (file.byteLength > cap) {
    return { ok: false, retryable: false, sent: false,
      error: `this take is ${file.byteLength} bytes and the ceiling for an upload is ${cap}` };
  }

  const cfg = submagicConfig(env);
  if (!cfg.ok) {
    return { ok: false, retryable: true, sent: false, error: `Submagic is not configured: ${cfg.missing.join(", ")} is not set` };
  }

  const form = new FormData();
  form.append("title", t);
  form.append("language", String(language || "en"));
  /* THE FOUR SWITCHES THAT ARE NOT NEGOTIABLE. See the file header. */
  form.append("autoRender", "false");
  form.append("magicBrolls", "false");
  form.append("removeBadTakes", "false");
  form.append("dictionary", JSON.stringify(buildDictionary(dictionary)));
  if (webhookUrl) form.append("webhookUrl", String(webhookUrl));
  if (templateName) form.append("templateName", String(templateName));
  if (hookTitle) form.append("hookTitle", String(hookTitle));
  if (cleanAudio === true) form.append("cleanAudio", "true");
  form.append("file", new Blob([file], { type: contentType }), String(fileName || "take.mp4"));

  /* No Content-Type header: FormData writes its own boundary, and setting one
     by hand splits the request in the middle of the video. */
  const res = await postBinaryTo(`${cfg.apiBase}/v1/projects/upload`, {
    headers: authHeaders(cfg),
    body: form,
    byteLength: file.byteLength,
    maxBytes,
    fence: ADAPTERS, env, fetchImpl, timeoutMs, signal,
    what: "submagic upload project"
  });

  const v = verdictOf(res, "submagic upload project");
  if (!v.ok) return v;
  const projectId = v.body?.id || v.body?.projectId || null;
  if (!projectId) {
    return { ...v, ok: false, retryable: false,
      error: "Submagic accepted the upload but returned no id — nothing downstream can find this edit" };
  }
  return { ...v, projectId: String(projectId), byteLength: file.byteLength };
}

/* getProject — GET /v1/projects/{id}

   The word-level transcript lives here and nowhere else, and it only exists
   once the project has been created and processed. `words` is the reason this
   call is in the pipeline at all: placing B-roll against Submagic's own timings
   is what makes the timing question in the research unanswerable-but-harmless. */
export async function getProject(projectId, { env = process.env, fetchImpl, timeoutMs, signal } = {}) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, retryable: false, error: "getProject needs a projectId" };
  const res = await call("GET", `/v1/projects/${encodeURIComponent(id)}`, { env, fetchImpl, timeoutMs, signal, what: "submagic get project" });
  const v = verdictOf(res, "submagic get project");
  if (!v.ok) return v;
  const body = v.body || {};
  return {
    ...v,
    projectId: id,
    status: body.status ? String(body.status) : null,
    words: Array.isArray(body.words) ? body.words : [],
    downloadUrl: body.downloadUrl ? String(body.downloadUrl) : null,
    durationSeconds: Number.isFinite(Number(body.duration)) ? Number(body.duration) : null
  };
}

/** A b-roll clip is seconds long. This cap is a guard against a wrong link
    pointing at a feature film, not a real ceiling on anything we film. */
export const MAX_USER_MEDIA_BYTES = 256 * 1024 * 1024;

/* uploadUserMedia — put one of OUR b-roll clips in the account's media library.

   ═══════════════════════════════════════════════════════════════════════════
   THE PATH HAS BEEN WRONG TWICE. THIS IS THE ONE THE VENDOR DOCUMENTS.

   It first posted to `POST /v1/projects/{id}/user-media`. Measured 2026-09-22:
   that is a 404, not a 401 — so it was never going to start working once the
   key landed, and every b-roll clip would have failed silently forever.

   It was then moved to `POST /v1/user-media`, which does answer 401 and so does
   exist. But a 401 only proves the ROUTE is there; it proves nothing about what
   that route wants in its body, and `{ url }` was a guess nobody has ever seen
   accepted. Submagic documents exactly one way to add media, and this is it:

     POST /v1/user-media/upload   multipart, form field `file`
                                  → { "userMediaId": "<uuid>" }
     https://docs.submagic.co/api-reference/user-media-upload

   So the clip goes over as BYTES. A caller that only has a link gets the bytes
   fetched here first, through the same fence, with a size cap — b-roll lives in
   our own Drive folder or on our own CDN, so that fetch is ours either way.

   A userMediaId belongs to the ACCOUNT, not to a project: the same clip can be
   placed on every ad without re-uploading. `projectId` is kept so existing
   callers are unchanged and is used only to label the call.
   ═══════════════════════════════════════════════════════════════════════════ */
export async function uploadUserMedia(projectId, {
  url, name, file, contentType = "video/mp4",
  env = process.env, fetchImpl, timeoutMs, signal, maxBytes = MAX_USER_MEDIA_BYTES
} = {}) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, retryable: false, sent: false, error: "uploadUserMedia needs a projectId" };

  const cfg = submagicConfig(env);
  if (!cfg.ok) {
    return { ok: false, retryable: true, sent: false,
      error: `Submagic is not configured: ${cfg.missing.join(", ")} is not set` };
  }

  const cap = Math.min(Number(maxBytes) || MAX_USER_MEDIA_BYTES, MAX_USER_MEDIA_BYTES);
  let bytes = file || null;
  let type = contentType;

  if (!bytes) {
    const mediaUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(mediaUrl)) {
      return { ok: false, retryable: false, sent: false,
        error: "uploadUserMedia needs the clip's bytes or an http(s) url to fetch them from" };
    }
    const got = await transmitBinary(mediaUrl, { method: "GET" }, {
      fence: ADAPTERS, env, fetchImpl, maxBytes: cap, timeoutMs, signal,
      what: "submagic fetch b-roll clip"
    });
    const gv = verdictOf(got, "submagic fetch b-roll clip");
    if (!gv.ok) return gv;
    if (!got.bytes || got.byteLength <= 0) {
      return { ok: false, retryable: true, sent: true, error: "the b-roll link returned no bytes" };
    }
    bytes = got.bytes;
    type = got.contentType || contentType;
  }

  if (bytes.byteLength > cap) {
    return { ok: false, retryable: false, sent: false,
      error: `this clip is ${bytes.byteLength} bytes and the ceiling for a b-roll upload is ${cap}` };
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), String(name || "broll.mp4"));

  /* No Content-Type header: FormData writes its own boundary, and setting one
     by hand splits the request in the middle of the clip. */
  const res = await postBinaryTo(`${cfg.apiBase}/v1/user-media/upload`, {
    headers: authHeaders(cfg),
    body: form,
    byteLength: bytes.byteLength,
    maxBytes: cap,
    fence: ADAPTERS, env, fetchImpl, timeoutMs, signal,
    what: "submagic upload user media"
  });

  const v = verdictOf(res, "submagic upload user media");
  if (!v.ok) return v;
  const userMediaId = v.body?.userMediaId || v.body?.id || null;
  if (!userMediaId) {
    return { ...v, ok: false, retryable: false,
      error: "Submagic accepted the clip but returned no userMediaId — it cannot be placed" };
  }
  return { ...v, userMediaId: String(userMediaId), byteLength: bytes.byteLength };
}

/* updateProject — PUT /v1/projects/{id}

   The only field this pipeline ever updates is items[]. Refuses a payload it
   has not validated, so a bad placement cannot reach the vendor and burn the
   re-export an update always costs. */
export async function updateProject(projectId, { placements = [], env = process.env, fetchImpl, timeoutMs, signal } = {}) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, retryable: false, error: "updateProject needs a projectId" };

  const built = buildItems(placements);
  if (!built.ok) {
    return { ok: false, retryable: false, error: `b-roll placement refused: ${built.errors.join("; ")}`, errors: built.errors };
  }

  const res = await call("PUT", `/v1/projects/${encodeURIComponent(id)}`, {
    body: { items: built.items }, env, fetchImpl, timeoutMs, signal, what: "submagic update project"
  });
  const v = verdictOf(res, "submagic update project");
  return v.ok ? { ...v, items: built.items } : v;
}

/* exportProject — the render.

   An update ALWAYS needs a re-export, and export is the tightest limit on the
   plan at 50 an hour. The path is the one thing the research says outright is
   inferred rather than documented; SUBMAGIC_EXPORT_PATH overrides it. */
export async function exportProject(projectId, { env = process.env, fetchImpl, timeoutMs, signal } = {}) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, retryable: false, sent: false, error: "exportProject needs a projectId" };
  const cfg = submagicConfig(env);
  const path = cfg.exportPath.replace("{id}", encodeURIComponent(id));
  const res = await call("POST", path, { body: {}, env, fetchImpl, timeoutMs, signal, what: "submagic export project" });
  const v = verdictOf(res, "submagic export project");
  if (!v.ok && v.status === 404) {
    return { ...v, error: `${v.error} — SUBMAGIC_EXPORT_PATH may be wrong; the research records this path as inferred, not documented.` };
  }
  return v;
}

/* ─────────────────────────────────────────────────────────────────────────
   parseWebhook — read the ping, and TRUST IT FOR ONE THING ONLY.

   The payload arrives unauthenticated from the open internet. The research
   records no signature for it, so nothing here treats it as proof of anything
   except "go and look at this project". The pipeline re-reads the project from
   the API before it moves a row forward; see src/ad-videos/pipeline.mjs.

   Shape from the research: { projectId, status, downloadUrl, directUrl, timestamp }.
   ───────────────────────────────────────────────────────────────────────── */
export const WEBHOOK_FIELDS = Object.freeze(["projectId", "status", "downloadUrl", "directUrl", "timestamp"]);

export function parseWebhook(raw) {
  let body = raw;
  if (typeof raw === "string") {
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { return { ok: false, error: "invalid_json" }; }
  }
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_payload" };

  const projectId = String(body.projectId || body.id || "").trim();
  if (!projectId) return { ok: false, error: "no_project_id" };

  const status = String(body.status || "").trim().toLowerCase();
  const httpUrl = (v) => (/^https:\/\//i.test(String(v || "")) ? String(v) : null);

  return {
    ok: true,
    projectId,
    status: status || null,
    /* Only https. An http link, or a link shaped like anything else, is not a
       finished render — it is somebody poking the open door. */
    downloadUrl: httpUrl(body.downloadUrl),
    directUrl: httpUrl(body.directUrl),
    timestamp: body.timestamp ? String(body.timestamp) : null,
    /* The vendor's own word for done. Anything else is recorded and ignored. */
    finished: status === "completed" || status === "complete" || status === "done" || status === "rendered",
    failed: status === "failed" || status === "error"
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   send — the provider contract's entry point.

   Kept so registering this module later is one line in index.mjs. It starts an
   edit; it does not wait for one. Never throws.
   ───────────────────────────────────────────────────────────────────────── */
export async function send(message = {}, options = {}) {
  try {
    const res = await createProject({
      title: message.title || message.subject || "Fundhub take",
      language: message.language || "en",
      videoUrl: message.to || message.videoUrl,
      webhookUrl: message.webhookUrl,
      dictionary: message.dictionary || [],
      ...options
    });
    if (res.ok) return success(res.projectId);
    return res.retryable === false ? rejection(res.error) : failure(res.error);
  } catch (err) {
    // The contract says never throw. Backstop for a bug in the code above.
    return failure(`submagic provider error: ${String((err && err.message) || err)}`);
  }
}

export default {
  PROVIDER, CHANNELS, ADDRESS_FIELD, ENABLED, TRANSMITS, send,
  submagicConfig, isSubmagicConfigured,
  createProject, createProjectFromFile, getProject, uploadUserMedia, updateProject, exportProject,
  parseWebhook, buildItems, buildDictionary, RATE_LIMITS
};
