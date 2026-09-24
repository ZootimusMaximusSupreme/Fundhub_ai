#!/usr/bin/env node
/**
 * Rename the B-roll clips in Drive so the planner can actually find them.
 *
 * WHY THIS EXISTS. src/ad-videos/broll.mjs tags a clip using its FILE NAME and
 * nothing else. It lowercases the name, splits on every character that is not a
 * letter or a number, throws away words under 3 letters and bare numbers, and
 * then asks for an EXACT word match against what Chris says out loud. There is
 * no stemming: "bank" does not match "banks", "approval" does not match
 * "approve", "account" does not match "accounts".
 *
 * Measured 2026-09-23: we own 62 approval screenshots and not one of them
 * carries the word "approve", so none of them fired when Chris said "the banks
 * that will approve you". The folder is called approvals, but a folder name is
 * not part of a file name, so the matcher never saw it.
 *
 * This adds the spoken words to the front of each name and keeps the old name
 * on the end, so nothing is lost and the pictures stay identifiable.
 *
 *   node --env-file=.env scripts/broll-rename-for-matcher.mjs          # dry-run
 *   node --env-file=.env scripts/broll-rename-for-matcher.mjs --apply
 */
import { driveConfigFromEnv } from "../src/company-brain/config.mjs";
import { fetchOAuthAccessToken } from "../src/company-brain/auth.mjs";

const BROLL = "1GclLLeMNOVjVSQOJUVBgQYp7WAd3pF11";
const APPLY = process.argv.includes("--apply");

const config = driveConfigFromEnv(process.env);
const cand = (config.oauthCandidates || [])[0];
if (!cand?.credentials?.refreshToken) { console.error("Drive OAuth not ready."); process.exit(1); }
const token = (await fetchOAuthAccessToken(cand.credentials)).accessToken;

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) throw new Error(`${res.status} ${json?.error?.message || text.slice(0, 200)}`);
  return json;
}

async function children(parentId, foldersOnly = false) {
  const type = foldersOnly
    ? "and mimeType = 'application/vnd.google-apps.folder'"
    : "and mimeType != 'application/vnd.google-apps.folder'";
  const q = encodeURIComponent(`'${parentId}' in parents and trashed = false ${type}`);
  const json = await api(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    "&fields=files(id,name,mimeType)&pageSize=300&supportsAllDrives=true&includeItemsFromAllDrives=true"
  );
  return json.files || [];
}

async function rename(id, name) {
  await api(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
}

/* The words Chris actually says, per ad, from docs/ads/fundhub-297/FundHub-LOCKED-ADS.md.
   Both singular and plural are spelled out because the matcher will not bridge them. */
const APPROVAL_WORDS = "approve-approved-approval-approvals";

const EXACT = new Map(Object.entries({
  // deliverables — the documents he names out loud
  "bank-lender-match-list.png":        "list-banks-bank-approve-approved-lender-match-list.png",
  "credit-analysis-report.png":        "credit-score-scores-bureaus-bureau-report-credit-analysis.png",
  "credit-optimization-roadmap.png":   "roadmap-document-documents-optimized-optimization-credit-roadmap.png",
  "funding-snapshot.png":              "funding-qualify-qualifies-capital-money-funding-snapshot.png",
  "letter-round-1-equifax.png":        "letter-letters-accounts-account-dispute-equifax-round-1.png",
  "letter-round-1-experian.png":       "letter-letters-accounts-account-dispute-experian-round-1.png",
  "letter-round-2-experian.png":       "letter-letters-accounts-account-dispute-experian-round-2.png",
  // portal — two of these were firing on the wrong word
  "what-you-own.png":                  "portal-dashboard-assets-own.png",          // fired on "you", in every ad
  "send-a-file.png":                   "portal-upload-send-documents.png",          // fired on "file", meaning credit file
  "unlock-more.png":                   "portal-unlock-upgrade.png",                 // fired on "more", unrelated screen
  "advisor.png":                       "advisor-advisors-portal-team.png",
  "portal.png":                        "portal-dashboard-account-login.png",
  "refer.png":                         "refer-referral-portal-share.png",
  "sign.png":                          "sign-signature-agreement-portal.png",
  "status.png":                        "status-progress-portal-tracking.png",
  "welcome.png":                       "welcome-portal-start-onboarding.png"
}));

let planned = 0, skipped = 0;

async function walk(folderId, label, prefixWords) {
  const files = await children(folderId);
  for (const f of files) {
    if (/\.pdf$/i.test(f.name)) { skipped++; continue; }   // a PDF cannot be shown as B-roll
    let next = EXACT.get(f.name);
    if (!next) {
      if (!prefixWords) { skipped++; continue; }
      if (f.name.toLowerCase().startsWith(prefixWords)) { skipped++; continue; }
      next = `${prefixWords}-${f.name}`;
    }
    if (next === f.name) { skipped++; continue; }
    planned++;
    if (!APPLY) { console.log(`  ${label}: ${f.name}\n      -> ${next}`); continue; }
    await rename(f.id, next);
    console.log(`  renamed ${label}: ${next}`);
  }
}

const folders = await children(BROLL, true);
const byName = new Map(folders.map((f) => [f.name, f.id]));

if (byName.has("approvals")) await walk(byName.get("approvals"), "approvals", APPROVAL_WORDS);
if (byName.has("portal")) await walk(byName.get("portal"), "portal", null);
if (byName.has("deliverables")) await walk(byName.get("deliverables"), "deliverables", null);

console.log(`\n${planned} rename(s), ${skipped} left alone.`);
if (!APPLY) console.log("Dry run. Re-run with --apply.");
