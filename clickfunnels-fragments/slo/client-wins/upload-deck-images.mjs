#!/usr/bin/env node
/**
 * Put the deck crops into the ClickFunnels image library so /roadmap can load them.
 *
 *   node clickfunnels-fragments/slo/client-wins/upload-deck-images.mjs
 *
 * The ClickFunnels Images API only copies from a public URL (a data: URI answers 422),
 * so the crops ride a Netlify DRAFT deploy (never production) as the pickup point, then
 * POST /workspaces/{id}/images copies each one to statics.myclickfunnels.com.
 * Writes image { url, width, height, cf_image_id } back into deck.json for each card
 * that has a crop and no url yet. Auth: CLICKFUNNELS_API_KEY from .env. Never prints it.
 */
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const DECK = join(HERE, "deck.json");
const SITE = "transcendent-wisp-888771";

for (const line of existsSync(join(ROOT, ".env")) ? readFileSync(join(ROOT, ".env"), "utf8").split("\n") : []) {
  const i = line.indexOf("=");
  if (!line || line.startsWith("#") || i < 1) continue;
  if (process.env[line.slice(0, i)] === undefined) process.env[line.slice(0, i)] = line.slice(i + 1);
}
const key = String(process.env.CLICKFUNNELS_API_KEY ?? "").trim();
if (!key) throw new Error("CLICKFUNNELS_API_KEY is not set");
const sub = String(process.env.CLICKFUNNELS_SUBDOMAIN ?? "chrisstanbridgestea3f77f").trim().toLowerCase();
const base = `https://${sub}.myclickfunnels.com/api/v2`;
const headers = {
  authorization: `Bearer ${key}`,
  "user-agent": "FundHub-CF-Push/1.0 (+https://fundhub.ai)",
  "content-type": "application/json",
};
async function api(path, init = {}) {
  const res = await fetch(base + path, { headers, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickFunnels ${res.status} on ${path}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
async function workspaceId() {
  if (process.env.CLICKFUNNELS_WORKSPACE_ID) return String(process.env.CLICKFUNNELS_WORKSPACE_ID).trim();
  const teams = await api("/teams");
  for (const t of teams) {
    const ws = await api(`/teams/${t.id}/workspaces`);
    const hit = ws.find((w) => w.subdomain === sub) || (ws.length === 1 ? ws[0] : null);
    if (hit) return hit.id;
  }
  throw new Error(`workspace not found for ${sub}`);
}
function jpegSize(file) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length; ) {
    const len = b.readUInt16BE(i + 2);
    if (b[i + 1] >= 0xc0 && b[i + 1] <= 0xc3) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error(`no size in ${file}`);
}

const deck = JSON.parse(readFileSync(DECK, "utf8"));
const todo = deck.cards.filter((c) => c.crop && !c.image?.url);
if (!todo.length) {
  console.log("every crop already has a ClickFunnels url");
  process.exit(0);
}

const stage = mkdtempSync(join(tmpdir(), "fh-deck-"));
for (const c of todo) copyFileSync(join(ROOT, c.crop), join(stage, basename(c.crop)));
const d = spawnSync(
  "netlify",
  ["deploy", "--dir", ".", "--site", SITE, "--no-build", "--json", "--message", "temp pickup point for ClickFunnels image import (roadmap proof deck)"],
  { cwd: stage, encoding: "utf8" },
);
if (d.status !== 0) throw new Error(`netlify draft deploy failed: ${(d.stderr || d.stdout).slice(-400)}`);
const draft = JSON.parse(d.stdout.slice(d.stdout.indexOf("{"))).deploy_url;
console.log(`draft pickup: ${draft}`);

const ws = await workspaceId();
for (const c of todo) {
  const file = basename(c.crop);
  const made = await api(`/workspaces/${ws}/images`, {
    method: "POST",
    body: JSON.stringify({ image: { name: `fundhub-roadmap-${c.id}`, alt_text: c.alt || c.id, upload_source_url: `${draft}/${file}` } }),
  });
  let url = null;
  for (let k = 0; k < 20 && !url; k++) {
    const got = await api(`/images/${made.id}`);
    if (String(got.url).startsWith("https://statics.myclickfunnels.com/")) url = got.url;
    else await new Promise((r) => setTimeout(r, 1500));
  }
  if (!url) throw new Error(`${c.id}: ClickFunnels never finished image ${made.id}`);
  c.image = { url, ...jpegSize(join(ROOT, c.crop)), cf_image_id: made.id };
  console.log(`${c.id} -> ${url}`);
}
writeFileSync(DECK, JSON.stringify(deck, null, 2) + "\n");
