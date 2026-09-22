// Google Drive — the WRITE side.
//
// src/company-brain/drive-client.mjs says in its first two lines that it never
// writes, deletes, or moves, and that is still true. This is the other half:
// list a folder, rename a take, make a folder, put a small file in it.
//
// CLAUDE.md §12 puts outbound transmission in src/messaging/providers/* and
// nowhere else, so it lives here rather than beside the read client. The one
// working example of a Drive write in this repo is scripts/slo-broll-upload.mjs,
// which runs on a laptop with a raw fetch; the calls below are that script's
// calls, moved behind the fence so they can run from a worker.
//
// SHIPS UNROUTED. `ENABLED = false`, not in providers/index.mjs — same posture
// as web-push.mjs and submagic.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE FENCE IS `ADAPTERS`. Creating a folder and writing a file changes a
// record at a vendor, which src/lib/outbound-fetch.mjs says outright is not
// INTERNAL. With ADAPTERS_DRY_RUN unset every call comes back `blocked`, and
// nothing is written. That is the intended default.
// ═══════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════
// TWO LIMITS YOU WILL HIT. BOTH ARE REAL AND NEITHER IS WORKED AROUND HERE.
//
// 1. SCOPE. src/company-brain/config.mjs asks Google for `drive.readonly`. A
//    read-only token cannot create a folder or upload a file, and Google
//    answers 403 insufficientPermissions. This module asks for the full `drive`
//    scope on the service-account path and CHECKS the granted scope on the
//    OAuth path, so the failure says which it was instead of reading as a
//    mystery. Granting it is a change on the Google side, not in this repo.
//    Owner law: a stored key is never removed — a token that cannot write is
//    left exactly where it is and reported.
//
// 2. BYTES. src/lib/outbound-fetch.mjs reads every response with res.text().
//    That is correct for JSON and fatal for a 4K MP4: the body would be
//    mangled and held whole in memory. So a VIDEO cannot move through this
//    module — uploadVideo() refuses and says why. Small text (the one-page
//    brief for Paul) is fine and is implemented. Moving the video bytes is a
//    laptop script's job, the same way scripts/slo-broll-upload.mjs already is.
// ═══════════════════════════════════════════════════════════════════════════

import { transmit, postJsonTo, ADAPTERS, redact } from "../../lib/outbound-fetch.mjs";
import { classify, success, failure, rejection } from "./http.mjs";
import { driveConfigFromEnv } from "../../company-brain/config.mjs";
import { fetchAccessToken, fetchOAuthAccessToken } from "../../company-brain/auth.mjs";

export const PROVIDER = "google_drive_write";
export const CHANNELS = new Set(["drive_write"]);
export const ADDRESS_FIELD = "drive_folder_id";
export const ENABLED = false;
export const TRANSMITS = true;

export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/** The scope a write needs. `drive.readonly` is not enough and never becomes enough. */
export const DRIVE_WRITE_SCOPE = "https://www.googleapis.com/auth/drive";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/* How big a file this module will carry. The brief is a few kilobytes; the cap
   is here so a caller cannot quietly hand it a video and get a corrupt upload
   instead of a refusal. See limit 2 in the header. */
export const MAX_TEXT_UPLOAD_BYTES = 5 * 1024 * 1024;

const FILE_FIELDS = "id,name,mimeType,parents,createdTime,modifiedTime,size,videoMediaMetadata,trashed";

/** True when Google's granted-scope list can write. Null scope means Google did
    not say, which on the OAuth path means the token may or may not write — the
    403 is then the answer, not this check. */
export function grantsWrite(scope) {
  if (!scope) return null;
  return String(scope).split(/\s+/).some((s) => s === DRIVE_WRITE_SCOPE || s === DRIVE_FILE_SCOPE);
}

/* ─────────────────────────────────────────────────────────────────────────
   The token. Cached until shortly before it expires, per process.

   Service account first asks for the full drive scope. OAuth cannot ask — the
   scope was fixed when the token was minted — so the granted list is read back
   and reported.
   ───────────────────────────────────────────────────────────────────────── */
let cachedToken = null; // { accessToken, expiresAtMs, scope, authMode }

/** Drop the cached token. For tests, and for a caller that saw a 401. */
export function resetTokenCache() { cachedToken = null; }

export async function driveAccessToken({ env = process.env, now = Date.now, fetchImpl } = {}) {
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now()) return { ok: true, ...cachedToken };

  const cfg = driveConfigFromEnv(env);
  if (!cfg.ready) {
    return { ok: false, retryable: true,
      error: `Google Drive login is not ready: ${(cfg.missing || []).join(", ") || "no credentials"} is not set` };
  }

  try {
    if (cfg.authMode === "oauth") {
      const cand = (cfg.oauthCandidates || [])[0] || { credentials: cfg.oauthCredentials };
      const tok = await fetchOAuthAccessToken({ ...cand.credentials, fetchImpl });
      const writes = grantsWrite(tok.scope);
      if (writes === false) {
        return { ok: false, retryable: false,
          error: `the stored Google token is read-only (${DRIVE_WRITE_SCOPE} was not granted). ` +
                 `Nothing was written. The stored key is left exactly as it is.` };
      }
      cachedToken = {
        accessToken: tok.accessToken,
        expiresAtMs: now() + (tok.expiresIn || 3600) * 1000,
        scope: tok.scope || null,
        authMode: "oauth"
      };
    } else {
      const tok = await fetchAccessToken({
        clientEmail: cfg.serviceAccount.clientEmail,
        privateKey: cfg.serviceAccount.privateKey,
        delegateEmail: cfg.delegateEmail || undefined,
        scope: DRIVE_WRITE_SCOPE,
        fetchImpl
      });
      cachedToken = {
        accessToken: tok.accessToken,
        expiresAtMs: now() + (tok.expiresIn || 3600) * 1000,
        scope: DRIVE_WRITE_SCOPE,
        authMode: "service_account"
      };
    }
  } catch (err) {
    return { ok: false, retryable: true, error: redact(`Google token exchange failed: ${String(err?.message || err)}`) };
  }
  return { ok: true, ...cachedToken };
}

function verdictOf(res, what) {
  if (res.blocked) return { ok: false, retryable: true, status: 0, error: res.error || `${what} held by the adapters fence` };
  if (res.transmitted === false) return { ok: false, retryable: true, status: 0, error: res.error || `${what} was not sent` };
  if (res.status === 0) return { ok: false, retryable: true, status: 0, error: res.error || `${what} did not complete` };
  if (res.status === 403) {
    return { ok: false, retryable: false, status: 403,
      error: redact(`${what}: HTTP 403 from Google. The commonest cause is a read-only token — ` +
        `this pipeline needs ${DRIVE_WRITE_SCOPE}. Nothing was written and no stored key was changed.`) };
  }
  const cls = classify(res.status);
  if (cls.status === "sent") return { ok: true, retryable: false, status: res.status, error: null, body: res.body };
  return { ok: false, retryable: cls.retryable, status: res.status, error: redact(res.error || `${what} returned HTTP ${res.status}`) };
}

async function driveCall(method, url, { token, body, contentType, env = process.env, fetchImpl, timeoutMs, signal, what }) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  const opts = { fence: ADAPTERS, env, fetchImpl, timeoutMs, signal, what };
  if (method === "POST" && body !== undefined) {
    return postJsonTo(url, { headers, body, contentType: contentType || "application/json", ...opts });
  }
  return transmit(url, {
    method,
    headers: body === undefined ? headers : { ...headers, "Content-Type": contentType || "application/json" },
    body
  }, opts);
}

const qs = (params) => Object.entries(params)
  .filter(([, v]) => v !== undefined && v !== null && v !== "")
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  .join("&");

/* Shared-drive flags. Every call carries them: Paul's folder is a shared drive,
   and a call without these answers 404 for a file that plainly exists. */
const SHARED = { supportsAllDrives: "true", includeItemsFromAllDrives: "true" };

/* ─────────────────────────────────────────────────────────────────────────
   listNewVideos — the trigger for the whole pipeline.

   `files.list` with the folder in parents, createdTime after a watermark, and
   trashed = false — exactly the query in the API research. Two filters are
   applied here rather than in the query because Drive cannot express them:

     * SIZE ABOVE ZERO. A phone that is still uploading has a real file id and
       zero bytes. Picking it up starts an edit on an empty video.
     * A VIDEO. A stray note or thumbnail in the folder is not a take.
   ───────────────────────────────────────────────────────────────────────── */
export async function listNewVideos({
  folderId, since, pageSize = 50, env = process.env, fetchImpl, timeoutMs, signal
} = {}) {
  const parent = String(folderId || "").trim();
  if (!parent) return { ok: false, retryable: false, error: "listNewVideos needs a folderId", files: [] };

  const tok = await driveAccessToken({ env, fetchImpl });
  if (!tok.ok) return { ...tok, files: [] };

  const clauses = [`'${parent.replace(/'/g, "\\'")}' in parents`, "trashed = false"];
  if (since) clauses.push(`createdTime > '${new Date(since).toISOString()}'`);

  const url = `${DRIVE_API}/files?${qs({
    q: clauses.join(" and "),
    fields: `files(${FILE_FIELDS})`,
    orderBy: "createdTime",
    pageSize,
    ...SHARED
  })}`;

  const res = await driveCall("GET", url, { token: tok.accessToken, env, fetchImpl, timeoutMs, signal, what: "drive list new takes" });
  const v = verdictOf(res, "drive list new takes");
  if (!v.ok) return { ...v, files: [] };

  const files = (v.body?.files || []).filter((f) => {
    const bytes = Number(f.size);
    if (!Number.isFinite(bytes) || bytes <= 0) return false;
    return String(f.mimeType || "").startsWith("video/");
  });
  return { ok: true, retryable: false, files, skipped: (v.body?.files || []).length - files.length };
}

/** getFileMeta — one file, including videoMediaMetadata (width/height/duration).
    That is where the 4K check in .claude/rules/video-4k-unless-ad.md gets its
    real numbers, rather than trusting what anyone typed. */
export async function getFileMeta(fileId, { env = process.env, fetchImpl, timeoutMs, signal } = {}) {
  const id = String(fileId || "").trim();
  if (!id) return { ok: false, retryable: false, error: "getFileMeta needs a fileId" };
  const tok = await driveAccessToken({ env, fetchImpl });
  if (!tok.ok) return tok;

  const url = `${DRIVE_API}/files/${encodeURIComponent(id)}?${qs({ fields: FILE_FIELDS, ...SHARED })}`;
  const res = await driveCall("GET", url, { token: tok.accessToken, env, fetchImpl, timeoutMs, signal, what: "drive get file" });
  const v = verdictOf(res, "drive get file");
  if (!v.ok) return v;
  const meta = v.body?.videoMediaMetadata || {};
  return {
    ok: true, retryable: false,
    file: v.body,
    width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : null,
    height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : null,
    durationSeconds: Number.isFinite(Number(meta.durationMillis)) ? Number(meta.durationMillis) / 1000 : null
  };
}

/** renameFile — files.update with a new name. The raw take gets its real name
    only after the transcript says which script it is; before that the phone's
    own file name is all anyone has. */
export async function renameFile(fileId, name, { env = process.env, fetchImpl, timeoutMs, signal } = {}) {
  const id = String(fileId || "").trim();
  const newName = String(name || "").trim();
  if (!id) return { ok: false, retryable: false, error: "renameFile needs a fileId" };
  if (!newName) return { ok: false, retryable: false, error: "renameFile needs a name" };

  const tok = await driveAccessToken({ env, fetchImpl });
  if (!tok.ok) return tok;

  const url = `${DRIVE_API}/files/${encodeURIComponent(id)}?${qs({ fields: "id,name", ...SHARED })}`;
  const res = await driveCall("PATCH", url, {
    token: tok.accessToken, body: JSON.stringify({ name: newName }),
    env, fetchImpl, timeoutMs, signal, what: "drive rename file"
  });
  const v = verdictOf(res, "drive rename file");
  return v.ok ? { ok: true, retryable: false, fileId: id, name: v.body?.name || newName } : v;
}

/* ensureFolder — find it or make it. Idempotent on purpose: the sweeper reruns
   every five minutes and a second pass must not leave two folders called 043. */
export async function ensureFolder({ parentId, name, env = process.env, fetchImpl, timeoutMs, signal } = {}) {
  const parent = String(parentId || "").trim();
  const folderName = String(name || "").trim();
  if (!parent) return { ok: false, retryable: false, error: "ensureFolder needs a parentId" };
  if (!folderName) return { ok: false, retryable: false, error: "ensureFolder needs a name" };

  const tok = await driveAccessToken({ env, fetchImpl });
  if (!tok.ok) return tok;

  const q = `'${parent.replace(/'/g, "\\'")}' in parents and trashed = false and ` +
            `mimeType = '${FOLDER_MIME}' and name = '${folderName.replace(/'/g, "\\'")}'`;
  const findUrl = `${DRIVE_API}/files?${qs({ q, fields: "files(id,name)", pageSize: 10, ...SHARED })}`;
  const found = await driveCall("GET", findUrl, { token: tok.accessToken, env, fetchImpl, timeoutMs, signal, what: "drive find folder" });
  const fv = verdictOf(found, "drive find folder");
  if (!fv.ok) return fv;
  const existing = (fv.body?.files || [])[0];
  if (existing?.id) return { ok: true, retryable: false, folderId: String(existing.id), created: false };

  const makeUrl = `${DRIVE_API}/files?${qs({ fields: "id,name", ...SHARED })}`;
  const made = await driveCall("POST", makeUrl, {
    token: tok.accessToken,
    body: JSON.stringify({ name: folderName, mimeType: FOLDER_MIME, parents: [parent] }),
    env, fetchImpl, timeoutMs, signal, what: "drive create folder"
  });
  const mv = verdictOf(made, "drive create folder");
  if (!mv.ok) return mv;
  const id = mv.body?.id;
  if (!id) return { ok: false, retryable: false, error: "Drive made a folder but returned no id" };
  return { ok: true, retryable: false, folderId: String(id), created: true };
}

/* ─────────────────────────────────────────────────────────────────────────
   uploadTextFile — the one-page brief that rides beside the video.

   Multipart upload, because a text body is the one thing the chokepoint can
   carry. The boundary is random per call: a fixed boundary that happened to
   appear inside the brief would split the request in the middle of the copy.
   ───────────────────────────────────────────────────────────────────────── */
export async function uploadTextFile({
  parentId, name, content, mimeType = "text/plain",
  env = process.env, fetchImpl, timeoutMs, signal
} = {}) {
  const parent = String(parentId || "").trim();
  const fileName = String(name || "").trim();
  const text = String(content ?? "");
  if (!parent) return { ok: false, retryable: false, error: "uploadTextFile needs a parentId" };
  if (!fileName) return { ok: false, retryable: false, error: "uploadTextFile needs a name" };
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_TEXT_UPLOAD_BYTES) {
    return { ok: false, retryable: false,
      error: `uploadTextFile carries text, not media: ${bytes} bytes is over the ${MAX_TEXT_UPLOAD_BYTES}-byte cap` };
  }

  const tok = await driveAccessToken({ env, fetchImpl });
  if (!tok.ok) return tok;

  let boundary = `fundhub-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  while (text.includes(boundary)) boundary += Math.random().toString(36).slice(2);

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: fileName, parents: [parent] })}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${text}\r\n` +
    `--${boundary}--\r\n`;

  const url = `${DRIVE_UPLOAD_API}/files?${qs({ uploadType: "multipart", fields: "id,name", ...SHARED })}`;
  const res = await driveCall("POST", url, {
    token: tok.accessToken, body, contentType: `multipart/related; boundary=${boundary}`,
    env, fetchImpl, timeoutMs, signal, what: "drive upload brief"
  });
  const v = verdictOf(res, "drive upload brief");
  if (!v.ok) return v;
  const id = v.body?.id;
  if (!id) return { ok: false, retryable: false, error: "Drive accepted the brief but returned no file id" };
  return { ok: true, retryable: false, fileId: String(id), name: v.body?.name || fileName };
}

/* ─────────────────────────────────────────────────────────────────────────
   uploadVideo — REFUSES, ON PURPOSE. Read limit 2 in the header.

   src/lib/outbound-fetch.mjs reads every response with res.text(). A resumable
   upload PUT of a 4K MP4 cannot go through it, and a helper here that quietly
   opened its own socket would be the exact hole
   src/lib/no-unfenced-transmit.test.mjs exists to close.

   So this is a named gap, not a silent one. The bytes move in a laptop script,
   the same way scripts/slo-broll-upload.mjs already moves b-roll.
   ───────────────────────────────────────────────────────────────────────── */
export const VIDEO_UPLOAD_UNSUPPORTED =
  "moving video bytes is not built. src/lib/outbound-fetch.mjs reads every response as text, " +
  "so an MP4 cannot travel through the fence in either direction. The finished file has to be " +
  "copied by a script on the laptop (the pattern is scripts/slo-broll-upload.mjs). " +
  "See docs/journeys/ad-video-flow.md.";

export async function uploadVideo() {
  return { ok: false, retryable: false, unsupported: true, error: VIDEO_UPLOAD_UNSUPPORTED };
}

/** send — provider contract. Writes the brief; refuses anything else. */
export async function send(message = {}, options = {}) {
  try {
    const res = await uploadTextFile({
      parentId: message.to || message.parentId,
      name: message.name,
      content: message.body,
      mimeType: message.mimeType,
      ...options
    });
    if (res.ok) return success(res.fileId);
    return res.retryable === false ? rejection(res.error) : failure(res.error);
  } catch (err) {
    return failure(`google drive write provider error: ${String((err && err.message) || err)}`);
  }
}

export default {
  PROVIDER, CHANNELS, ADDRESS_FIELD, ENABLED, TRANSMITS, send,
  driveAccessToken, resetTokenCache, grantsWrite,
  listNewVideos, getFileMeta, renameFile, ensureFolder, uploadTextFile, uploadVideo
};
