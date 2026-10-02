#!/usr/bin/env node
/**
 * Put the recorded B-roll clips into the Drive b-roll folders.
 *
 * WHICH FOLDER MATTERS. src/ad-videos/broll.mjs lists the folders in priority
 * order — deliverables, then portal, then approvals — and planBroll takes the
 * first clip that matches a word. So a clip's folder decides whether it ever
 * gets a slot, not just where it is filed.
 *
 *   node --env-file=.env scripts/broll-upload-clips.mjs          # dry-run
 *   node --env-file=.env scripts/broll-upload-clips.mjs --apply
 */
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const BROLL = process.env.DRIVE_BROLL_FOLDER_ID || "1GclLLeMNOVjVSQOJUVBgQYp7WAd3pF11";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/ops/workflows/slo-broll-2026-09-23-evidence/clips";
const APPLY = process.argv.includes("--apply");

/* The documents Chris names out loud go in deliverables so they win the early
   moments. The two portal screens go in portal. The approval reel goes last. */
const PLACE = {
  "list-banks-bank-approve-approval-approved.mp4": "deliverables",
  "roadmap-document-documents.mp4": "deliverables",
  "credit-score-scores-bureaus-bureau.mp4": "deliverables",
  "funding-qualify-qualified.mp4": "deliverables",
  "letter-letters-accounts-account.mp4": "deliverables",
  "inquiry-inquiries-soft.mp4": "portal",
  "declined-decline-why.mp4": "portal",
  "approval-approved-approvals.mp4": "approvals"
};

const cfg = driveConfigFromEnv(process.env);
const cand = (cfg.oauthCandidates || [])[0];
if (!cand?.credentials?.refreshToken) { console.error("Drive OAuth not ready."); process.exit(1); }
const token = (await fetchOAuthAccessToken(cand.credentials)).accessToken;

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) throw new Error(`${res.status} ${json?.error?.message || text.slice(0, 200)}`);
  return json;
}

const folders = (await api(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${BROLL}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`)}` +
  "&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true"
)).files || [];
const byName = new Map(folders.map((f) => [f.name, f.id]));

for (const [file, folder] of Object.entries(PLACE)) {
  const parent = byName.get(folder);
  if (!parent) { console.log(`  SKIP ${file}: no ${folder} folder`); continue; }
  const path = `${DIR}/${file}`;
  let size;
  try { size = statSync(path).size; } catch { console.log(`  SKIP ${file}: not on disk`); continue; }

  if (!APPLY) { console.log(`  would upload ${file} -> ${folder} (${(size / 1e6).toFixed(1)} MB)`); continue; }

  const meta = { name: basename(file), parents: [parent] };
  const boundary = `fundhub${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    readFileSync(path),
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const out = await api(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name",
    { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body }
  );
  console.log(`  uploaded ${out.name} -> ${folder}`);
}
console.log(APPLY ? "\nDone." : "\nDry run. Re-run with --apply.");
