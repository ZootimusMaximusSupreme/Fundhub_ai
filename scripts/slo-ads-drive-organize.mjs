#!/usr/bin/env node
/**
 * SLO Ads Drive folder: dedupe MP4s + keep Chris's SLO naming (`SLO … / TAKE #`).
 *
 *   node --env-file=.env scripts/slo-ads-drive-organize.mjs          # dry-run
 *   node --env-file=.env scripts/slo-ads-drive-organize.mjs --apply    # trash + rename
 */
import { writeFileSync } from "node:fs";
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const SLO_ADS = "13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ";
const APPLY = process.argv.includes("--apply");

/** Any current basename → canonical SLO name on Drive */
const TO_CANONICAL = {
  // Normalize (missing take number)
  "SLO Ad 1.mp4": "SLO Ad 1 Take 1.mp4",

  // Undo wrong script-ID renames (2026-09-23 mistake)
  "LOCKED-AD-01-take-1.mp4": "SLO Ad 1 Take 1.mp4",
  "LOCKED-AD-07-take-1.mp4": "SLO Ad 6 Take 1.mp4",
  "LOCKED-AD-07-take-2.mp4": "SLO Ad 6 Take 2.mp4",
  "LOCKED-AD-07-take-3.mp4": "SLO Ad 6 Take 3.mp4",
  "LOCKED-AD-07-take-4.mp4": "SLO Ad 6 Take 4.mp4",
  "LOCKED-AD-07-take-5.mp4": "SLO Ad 6 Take 5.mp4",
  "LOCKED-AD-07-take-6.mp4": "SLO Ad 6 Take 6.mp4",
  "LOCKED-AD-07-take-7.mp4": "SLO Ad 6 Take 7.mp4",
  "LOCKED-AD-two-sides-variant.mp4": "SLO Ad Two Sides.mp4",
  "AD-07-call-pitch-take-1.mp4": "SLO Ad 7 Call Pitch Take 1.mp4",
  "AD-07-call-pitch-take-2.mp4": "SLO Ad 7 Call Pitch Take 2.mp4",
  "Retarget-checkout-abandon-take-2.mp4": "SLO Checkout Abandon Take 2.mp4",
  "Retarget-checkout-abandon-take-3.mp4": "SLO Checkout Abandon Take 3.mp4",
  "VSL-01-Sales-open.mp4": "SLO VSL 1 Open.mp4",
  "VSL-01-Sales-middle.mp4": "SLO VSL 1 Middle.mp4",
  "VSL-01-Sales-FAQ.mp4": "SLO VSL 1 FAQ.mp4",
  "VSL-01-Sales-close.mp4": "SLO VSL 1 Close.mp4",
  "VSL-02-Booking.mp4": "SLO VSL 2 Booking.mp4",

  // iPhone export — ~344 MB, ~2× VSL 2 Booking size/duration → full VSL 1 take (script-check name)
  "8FEE9AD2-4920-4D91-99F7-D45180DEF6C1.mp4": "SLO VSL Take 1.mp4",
};

const UUID_MP4 = /^[0-9A-F-]{36}\.mp4$/i;

/** Always trash (useless clip per script check) */
const TRASH_NAMES = new Set(["SLO Ad 1 Take 2.mp4"]);

function canonicalName(name) {
  if (TO_CANONICAL[name]) return TO_CANONICAL[name];
  if (UUID_MP4.test(name)) return "SLO VSL Take 1.mp4";
  return name;
}

function nameScore(name) {
  let s = 0;
  if (/^DUPLICATE/i.test(name)) s -= 100;
  if (UUID_MP4.test(name)) s -= 50;
  if (/^LOCKED-AD|^VSL-0|^Retarget-|^AD-07-call-pitch/i.test(name)) s -= 30;
  if (/^SLO /i.test(name)) s += 20;
  return s;
}

const config = driveConfigFromEnv(process.env);
const cand = (config.oauthCandidates || [])[0];
if (!cand?.credentials?.refreshToken) {
  console.error("Drive OAuth not ready (GOOGLE_DRIVE_OAUTH_TOKEN_JSON or path).");
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

async function listFolder(parentId, out = []) {
  let pageToken = "";
  for (;;) {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}` +
      "&fields=nextPageToken,files(id,name,mimeType,size,md5Checksum,parents)" +
      "&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true" +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const json = await api(url);
    for (const f of json.files || []) {
      out.push(f);
      if (f.mimeType === "application/vnd.google-apps.folder") {
        await listFolder(f.id, out);
      }
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

async function trashFile(id) {
  await api(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

async function renameFile(id, name) {
  await api(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

const all = await listFolder(SLO_ADS);
const mp4s = all.filter((f) => f.mimeType === "video/mp4" || /\.mp4$/i.test(f.name));

const plan = { trash: [], rename: [], keep: [], md5Dedup: [] };

// 1) Explicit trash list + any DUPLICATE-prefixed copy
for (const f of mp4s) {
  if (TRASH_NAMES.has(f.name) || /^DUPLICATE/i.test(f.name)) {
    plan.trash.push({ id: f.id, name: f.name, reason: "duplicate_or_junk" });
  }
}

const trashIds = new Set(plan.trash.map((t) => t.id));

// 2) md5 dedup among remaining
const byMd5 = new Map();
for (const f of mp4s) {
  if (trashIds.has(f.id)) continue;
  const md5 = f.md5Checksum;
  if (!md5) continue;
  if (!byMd5.has(md5)) byMd5.set(md5, []);
  byMd5.get(md5).push(f);
}
for (const [, group] of byMd5) {
  if (group.length <= 1) continue;
  group.sort((a, b) => nameScore(b.name) - nameScore(a.name) || a.name.localeCompare(b.name));
  const keep = group[0];
  plan.keep.push({ id: keep.id, name: keep.name, reason: "md5_winner" });
  for (let i = 1; i < group.length; i++) {
    plan.trash.push({ id: group[i].id, name: group[i].name, reason: `md5_dup_of_${keep.name}` });
    trashIds.add(group[i].id);
  }
}

// 3) Renames to canonical SLO names (skip trashed)
const usedNames = new Set(mp4s.filter((f) => !trashIds.has(f.id)).map((f) => f.name));
for (const f of mp4s) {
  if (trashIds.has(f.id)) continue;
  const next = canonicalName(f.name);
  if (next === f.name) continue;
  if (usedNames.has(next) && next !== f.name) {
    plan.rename.push({
      id: f.id,
      from: f.name,
      to: next,
      note: "target_name_collision_will_apply_anyway",
    });
  } else {
    plan.rename.push({ id: f.id, from: f.name, to: next });
    usedNames.delete(f.name);
    usedNames.add(next);
  }
}

const inventory = mp4s.map((f) => ({
  id: f.id,
  name: f.name,
  size: f.size,
  md5: f.md5Checksum || null,
}));
const reportPath = "docs/workflows/slo-ads-drive-organize-2026-09-23.json";
writeFileSync(
  reportPath,
  JSON.stringify({ apply: APPLY, inventory, plan, mp4Count: mp4s.length }, null, 2)
);

console.log(`SLO Ads: ${mp4s.length} MP4s. Trash: ${plan.trash.length}. Rename: ${plan.rename.length}.`);
console.log(`Report: ${reportPath}`);
if (plan.trash.length) {
  console.log("\nTrash:");
  for (const t of plan.trash) console.log(`  - ${t.name} (${t.reason})`);
}
if (plan.rename.length) {
  console.log("\nRename:");
  for (const r of plan.rename) console.log(`  - ${r.from} → ${r.to}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to execute.");
  process.exit(0);
}

for (const t of plan.trash) {
  await trashFile(t.id);
  console.log("trashed", t.name);
}
for (const r of plan.rename) {
  await renameFile(r.id, r.to);
  console.log("renamed", r.from, "→", r.to);
}
console.log("Done.");
