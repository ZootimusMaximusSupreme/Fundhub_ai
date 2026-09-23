#!/usr/bin/env node
/**
 * Move SLO Ads root MP4s into the Raw subfolder (DRIVE_RAW_FOLDER_ID).
 * Sweeper only watches Raw — takes in the parent folder are invisible.
 *
 *   node --env-file=.env scripts/ad-video-move-takes-to-raw.mjs          # dry-run
 *   node --env-file=.env scripts/ad-video-move-takes-to-raw.mjs --apply
 */
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const SLO_ADS_ROOT = "13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ";
const RAW_FOLDER = process.env.DRIVE_RAW_FOLDER_ID || "12L_RH8QycTZFeaXn4rHs9AIeGq7XokWU";
const APPLY = process.argv.includes("--apply");

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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
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

async function moveToRaw(fileId, name) {
  await api(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&addParents=${RAW_FOLDER}&removeParents=${SLO_ADS_ROOT}`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }
  );
  console.log(APPLY ? "moved" : "would move", name);
}

const files = await listDirectChildren(SLO_ADS_ROOT);
const mp4s = files.filter((f) => f.mimeType === "video/mp4" || /\.mp4$/i.test(f.name));

console.log(`SLO Ads root: ${mp4s.length} MP4(s) to move → Raw (${RAW_FOLDER}).`);
for (const f of mp4s) {
  if (!APPLY) {
    console.log("  would move", f.name);
    continue;
  }
  await moveToRaw(f.id, f.name);
}
if (!APPLY) console.log("\nDry run. Re-run with --apply.");
