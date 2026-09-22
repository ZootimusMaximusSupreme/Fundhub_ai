// Put Desktop/broll into the SLO Ads folder on Drive.
// Fundhub + DirectRoas → Marketing Videos → SLO Ads → broll
// Copies only. Does not watermark. Does not touch the videos.
//
//   node --env-file=.env scripts/slo-broll-upload.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const SLO_ADS = "13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ";
const SOURCE = process.env.BROLL_SOURCE || "/Users/chrisstanbridge/Desktop/broll";
const FOLDERS = ["approvals", "portal", "deliverables"];

const config = driveConfigFromEnv(process.env);
const cand = (config.oauthCandidates || [])[0];
if (!cand?.credentials?.refreshToken) {
  console.error("Drive login is not ready. Nothing was uploaded.");
  process.exit(1);
}
const tok = await fetchOAuthAccessToken(cand.credentials);
const token = tok.accessToken;

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) }
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    throw new Error(`${res.status} ${json?.error?.message || text.slice(0, 180)}`);
  }
  return json;
}

async function children(parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
  const json = await api(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`
  );
  return json.files || [];
}

async function folder(parentId, name) {
  const existing = (await children(parentId)).find(
    (f) => f.name === name && f.mimeType === "application/vnd.google-apps.folder"
  );
  if (existing) return existing.id;
  const made = await api("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    })
  });
  console.log("made folder", name);
  return made.id;
}

function mimeOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function upload(parentId, filePath) {
  const name = path.basename(filePath);
  const have = (await children(parentId)).some((f) => f.name === name);
  if (have) {
    console.log("already there", name);
    return;
  }
  const bytes = readFileSync(filePath);
  const type = mimeOf(filePath);
  const start = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": type,
        "x-upload-content-length": String(bytes.length)
      },
      body: JSON.stringify({ name, parents: [parentId] })
    }
  );
  if (!start.ok) {
    const text = await start.text();
    throw new Error(`start ${name} ${start.status} ${text.slice(0, 180)}`);
  }
  const location = start.headers.get("location");
  const put = await fetch(location, {
    method: "PUT",
    headers: { "content-type": type, "content-length": String(bytes.length) },
    body: bytes
  });
  if (!put.ok) {
    const text = await put.text();
    throw new Error(`put ${name} ${put.status} ${text.slice(0, 180)}`);
  }
  console.log("uploaded", name, bytes.length);
}

const brollId = await folder(SLO_ADS, "broll");
let count = 0;
for (const name of FOLDERS) {
  const dir = path.join(SOURCE, name);
  const id = await folder(brollId, name);
  const files = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isFile() && !f.startsWith("."));
  for (const file of files) {
    await upload(id, path.join(dir, file));
    count += 1;
  }
}
console.log("folder", `https://drive.google.com/drive/folders/${brollId}`);
console.log("files", count);
