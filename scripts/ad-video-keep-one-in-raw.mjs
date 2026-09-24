#!/usr/bin/env node
/**
 * Leave exactly ONE take in the Raw folder and move the rest back to the
 * SLO Ads root. The sweeper only watches Raw, so this is the pilot switch:
 * whatever is left in Raw is what gets sent to Submagic and billed.
 *
 * The reverse of scripts/ad-video-move-takes-to-raw.mjs, and it shares that
 * script's auth and request shape on purpose.
 *
 *   node --env-file=.env scripts/ad-video-keep-one-in-raw.mjs <fileId>           # dry-run
 *   node --env-file=.env scripts/ad-video-keep-one-in-raw.mjs <fileId> --apply
 */
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const SLO_ADS_ROOT = "13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ";
const RAW_FOLDER = process.env.DRIVE_RAW_FOLDER_ID || "12L_RH8QycTZFeaXn4rHs9AIeGq7XokWU";
const APPLY = process.argv.includes("--apply");
const KEEP = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!KEEP) {
  console.error("Name the one file id to keep in Raw. Nothing was moved.");
  process.exit(1);
}

const config = driveConfigFromEnv(process.env);
const cand = (config.oauthCandidates || [])[0];
if (!cand?.credentials?.refreshToken) {
  console.error("Drive OAuth not ready.");
  process.exit(1);
}
const tok = await fetchOAuthAccessToken(cand.credentials);
const token = tok.accessToken;

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) throw new Error(`${res.status} ${json?.error?.message || text.slice(0, 200)}`);
  return json;
}

async function listDirectChildren(parentId) {
  const q = encodeURIComponent(
    `'${parentId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`
  );
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    "&fields=files(id,name,mimeType,parents)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true";
  const json = await api(url);
  return json.files || [];
}

async function moveOut(fileId, name) {
  await api(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&addParents=${SLO_ADS_ROOT}&removeParents=${RAW_FOLDER}`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }
  );
  console.log("  moved out", name);
}

const files = await listDirectChildren(RAW_FOLDER);
const keep = files.find((f) => f.id === KEEP);
if (!keep) {
  console.error(`File ${KEEP} is not in Raw. Nothing was moved.`);
  process.exit(1);
}
const rest = files.filter((f) => f.id !== KEEP);

console.log(`Raw holds ${files.length} file(s).`);
console.log(`Keeping: ${keep.name}`);
for (const f of rest) {
  if (!APPLY) { console.log("  would move out", f.name); continue; }
  await moveOut(f.id, f.name);
}
console.log(APPLY ? `\nRaw now holds 1 take: ${keep.name}` : "\nDry run. Re-run with --apply.");
