#!/usr/bin/env node
/**
 * Owner 2026-09-24: one folder for filmed video (SLO Ads root).
 * Moves MP4s out of the old Raw subfolder into SLO Ads root.
 * Same md5 already in root → moved to _md5-duplicates-from-raw (not deleted).
 *
 *   node --env-file=.env scripts/slo-consolidate-filmed-one-folder.mjs
 *   node --env-file=.env scripts/slo-consolidate-filmed-one-folder.mjs --apply
 */
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

export const SLO_ADS_ROOT = "13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ";
export const LEGACY_RAW_SUBFOLDER = "12L_RH8QycTZFeaXn4rHs9AIeGq7XokWU";
const DUPES_FOLDER_NAME = "_md5-duplicates-from-raw";
const APPLY = process.argv.includes("--apply");

const config = driveConfigFromEnv(process.env);
const cand = (config.oauthCandidates || [])[0];
if (!cand?.credentials?.refreshToken) {
  console.error("Drive OAuth not ready.");
  process.exit(1);
}
const { accessToken: token } = await fetchOAuthAccessToken(cand.credentials);

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

async function listVideos(parentId) {
  const q = encodeURIComponent(
    `'${parentId}' in parents and trashed = false and mimeType contains 'video/'`
  );
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    "&fields=files(id,name,mimeType,md5Checksum,parents)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true";
  return (await api(url)).files || [];
}

async function ensureFolder(parentId, name) {
  const q = encodeURIComponent(
    `'${parentId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}'`
  );
  const found = (await api(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`
  )).files?.[0];
  if (found) return found.id;
  if (!APPLY) return null;
  const created = await api("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  return created.id;
}

async function moveFile(fileId, addParent, removeParent) {
  const params = new URLSearchParams({ supportsAllDrives: "true", addParents: addParent });
  if (removeParent) params.set("removeParents", removeParent);
  await api(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

const rootFiles = await listVideos(SLO_ADS_ROOT);
const rootByMd5 = new Map();
const rootNames = new Set();
for (const f of rootFiles) {
  if (f.md5Checksum) rootByMd5.set(f.md5Checksum, f);
  rootNames.add(f.name);
}

const rawFiles = await listVideos(LEGACY_RAW_SUBFOLDER);
console.log(`Raw subfolder: ${rawFiles.length} video(s). SLO Ads root: ${rootFiles.length} video(s).`);

let dupesFolderId = null;
const plan = [];

for (const f of rawFiles) {
  const from = f.parents?.[0] || LEGACY_RAW_SUBFOLDER;
  if (f.md5Checksum && rootByMd5.has(f.md5Checksum)) {
    plan.push({ action: "dupe", file: f, reason: "md5 already in SLO Ads root" });
  } else if (rootNames.has(f.name)) {
    plan.push({ action: "rename-move", file: f, newName: f.name.replace(/\.mp4$/i, " (from Raw).mp4") });
  } else {
    plan.push({ action: "move", file: f });
  }
}

for (const row of plan) {
  const f = row.file;
  if (row.action === "move") {
    console.log(APPLY ? "move" : "would move", f.name, "→ SLO Ads root");
    if (APPLY) await moveFile(f.id, SLO_ADS_ROOT, f.parents?.[0]);
  } else if (row.action === "rename-move") {
    console.log(APPLY ? "move rename" : "would move rename", f.name, "→", row.newName);
    if (APPLY) {
      await api(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: row.newName }),
      });
      await moveFile(f.id, SLO_ADS_ROOT, f.parents?.[0]);
    }
  } else {
    console.log(APPLY ? "dupe" : "would dupe", f.name, "→", DUPES_FOLDER_NAME);
    if (APPLY) {
      dupesFolderId ??= await ensureFolder(SLO_ADS_ROOT, DUPES_FOLDER_NAME);
      if (dupesFolderId) await moveFile(f.id, dupesFolderId, f.parents?.[0]);
    }
  }
}

if (!APPLY) console.log("\nDry run. Re-run with --apply.");
