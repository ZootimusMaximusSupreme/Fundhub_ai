#!/usr/bin/env node
/**
 * Refresh .env from Netlify API and rebuild cloud-env paste file.
 *
 * Netlify stores real secrets but returns MASKS via CLI and API for --secret vars.
 * If .env already contains those masks, this script CANNOT recover them — use
 * Netlify UI (reveal) or vendor dashboards, then re-run.
 *
 * Usage:
 *   node scripts/env-refresh-local-from-netlify.mjs
 *   node scripts/env-refresh-local-from-netlify.mjs --merge-revealed credentials/env.revealed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMaskPlaceholder } from "./env-audit-masks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
const SNAPSHOT_PATH = path.join(ROOT, "credentials", "env.full.snapshot");
const CLOUD_PATH = path.join(ROOT, "credentials", "cloud-env-for-claude.txt");

const mergePath = (() => {
  const i = process.argv.indexOf("--merge-revealed");
  return i >= 0 ? process.argv[i + 1] : null;
})();

function loadNetlifyToken() {
  const home = process.env.HOME || "";
  for (const cfg of [
    path.join(home, "Library/Preferences/netlify/config.json"),
    path.join(home, ".config/netlify/config.json"),
  ]) {
    if (!fs.existsSync(cfg)) continue;
    const users = JSON.parse(fs.readFileSync(cfg, "utf8")).users || {};
    for (const u of Object.values(users)) {
      const t = (u.auth && u.auth.token) || u.token;
      if (t) return t;
    }
  }
  throw new Error("Netlify CLI not logged in — run netlify login on the Mac");
}

async function fetchSiteEnv(siteId, token) {
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Netlify env API ${res.status}`);
  return res.json();
}

function pickProductionValue(entry) {
  const values = entry?.values || [];
  const prod = values.find((v) => v.context === "production");
  return (prod || values[0])?.value ?? null;
}

function parseKeyValues(text) {
  const map = new Map();
  for (const line of text.split(/\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const eq = s.indexOf("=");
    map.set(s.slice(0, eq).trim(), s.slice(eq + 1).trim());
  }
  return map;
}

function rebuildCloudBlock(envText) {
  const lines = [];
  for (const [k, v] of parseKeyValues(envText)) {
    if (!isMaskPlaceholder(v)) lines.push(`${k}=${v}`);
  }
  const slPath = path.join(ROOT, ".claude", "settings.local.json");
  if (fs.existsSync(slPath)) {
    const data = JSON.parse(fs.readFileSync(slPath, "utf8"));
    const tok =
      data.SUPABASE_ACCESS_TOKEN ||
      (data.env && data.env.SUPABASE_ACCESS_TOKEN);
    if (tok && !isMaskPlaceholder(tok)) lines.push(`SUPABASE_ACCESS_TOKEN=${tok}`);
  }
  const statePath = path.join(ROOT, ".netlify", "state.json");
  if (fs.existsSync(statePath)) {
    const sid = JSON.parse(fs.readFileSync(statePath, "utf8")).siteId;
    if (sid) lines.push(`NETLIFY_SITE_ID=${sid}`);
  }
  const home = process.env.HOME || "";
  for (const cfg of [
    path.join(home, "Library/Preferences/netlify/config.json"),
    path.join(home, ".config/netlify/config.json"),
  ]) {
    if (!fs.existsSync(cfg)) continue;
    for (const u of Object.values(JSON.parse(fs.readFileSync(cfg, "utf8")).users || {})) {
      const t = (u.auth && u.auth.token) || u.token;
      if (t && !isMaskPlaceholder(t)) {
        lines.push(`NETLIFY_AUTH_TOKEN=${t}`);
        break;
      }
    }
    break;
  }
  return `${lines.join("\n")}\n`;
}

const siteId =
  JSON.parse(fs.readFileSync(path.join(ROOT, ".netlify", "state.json"), "utf8"))
    .siteId || "5905dba4-9942-480c-a510-813a3fe2b073";

const token = loadNetlifyToken();
const remote = await fetchSiteEnv(siteId, token);
const remoteByKey = new Map(remote.map((e) => [e.key, pickProductionValue(e)]));

const revealed = mergePath
  ? parseKeyValues(fs.readFileSync(path.join(ROOT, mergePath), "utf8"))
  : new Map();

const outLines = [];
let fixedFromRemote = 0;
let fixedFromRevealed = 0;
let stillMasked = 0;

for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    outLines.push(line);
    continue;
  }
  const eq = trimmed.indexOf("=");
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }

  if (!isMaskPlaceholder(val)) {
    outLines.push(line);
    continue;
  }

  const fromReveal = revealed.get(key);
  if (fromReveal && !isMaskPlaceholder(fromReveal)) {
    outLines.push(`${key}=${fromReveal}`);
    fixedFromRevealed += 1;
    continue;
  }

  const fromRemote = remoteByKey.get(key);
  if (fromRemote && !isMaskPlaceholder(fromRemote)) {
    outLines.push(`${key}=${fromRemote}`);
    fixedFromRemote += 1;
    continue;
  }

  outLines.push(line);
  stillMasked += 1;
}

const nextEnv = `${outLines.join("\n").replace(/\n?$/, "\n")}`;

console.log(
  JSON.stringify(
    {
      fixedFromRemote,
      fixedFromRevealed,
      stillMasked,
      netlifyEnvUrl:
        "https://app.netlify.com/projects/transcendent-wisp-888771/configuration/env#environment-variables",
      hint:
        stillMasked > 0
          ? "Netlify cannot unmask --secret vars via API. Reveal in UI → paste into credentials/env.revealed → re-run with --merge-revealed."
          : "ok",
    },
    null,
    2
  )
);

fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
fs.writeFileSync(SNAPSHOT_PATH, nextEnv);
fs.writeFileSync(CLOUD_PATH, rebuildCloudBlock(nextEnv));

if (stillMasked > 0) process.exit(1);
