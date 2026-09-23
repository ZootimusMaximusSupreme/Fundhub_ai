#!/usr/bin/env node
/**
 * Publish the branded approval proofs to Drive broll/approvals.
 *
 *   node --env-file=.env scripts/proof-crops-publish.mjs <dir>
 *
 * Uploads every .png in <dir> into  Fundhub + DirectRoas -> ... -> SLO Ads -> broll -> approvals.
 * Skips a name that is already there (never overwrites the 22 high-res originals).
 * Does not trash, rename or touch anything already in that folder.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const BROLL = "1GclLLeMNOVjVSQOJUVBgQYp7WAd3pF11";  // the broll folder itself
const SRC = process.argv[2];
if (!SRC) { console.error("usage: proof-crops-publish.mjs <dir>"); process.exit(1); }

const config = driveConfigFromEnv(process.env);
let token = null;
for (const c of (config.oauthCandidates || [])) {
  if (!c?.credentials?.refreshToken) continue;
  try { token = (await fetchOAuthAccessToken(c.credentials)).accessToken; break; } catch { /* next token */ }
}
if (!token) { console.error("Drive login is not ready. Nothing was uploaded."); process.exit(1); }

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${res.status} ${json?.error?.message || text.slice(0, 180)}`);
  return json;
}
async function children(parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
  const j = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=400&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return j.files || [];
}
async function folder(parentId, name) {
  const found = (await children(parentId)).find((f) => f.name === name && f.mimeType === "application/vnd.google-apps.folder");
  if (found) return found.id;
  const made = await api("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  return made.id;
}
async function upload(parentId, filePath, existing) {
  const name = path.basename(filePath);
  if (existing.has(name)) { console.log("already there", name); return false; }
  const bytes = readFileSync(filePath);
  const type = name.endsWith(".png") ? "image/png" : "application/octet-stream";
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8",
               "x-upload-content-type": type, "x-upload-content-length": String(bytes.length) },
    body: JSON.stringify({ name, parents: [parentId] })
  });
  if (!start.ok) throw new Error(`start ${name} ${start.status}`);
  const put = await fetch(start.headers.get("location"), {
    method: "PUT", headers: { "content-type": type, "content-length": String(bytes.length) }, body: bytes
  });
  if (!put.ok) throw new Error(`put ${name} ${put.status}`);
  console.log("uploaded", name, bytes.length);
  return true;
}

const approvals = await folder(BROLL, "approvals");
const existing = new Set((await children(approvals)).map((f) => f.name));
console.log(`broll/approvals already holds ${existing.size} files — none will be overwritten`);
const files = readdirSync(SRC).filter((f) => f.endsWith(".png") && statSync(path.join(SRC, f)).isFile());
let n = 0;
for (const f of files.sort()) if (await upload(approvals, path.join(SRC, f), existing)) n += 1;
console.log(`\nuploaded ${n} of ${files.length}`);
console.log(`folder https://drive.google.com/drive/folders/${approvals}`);
