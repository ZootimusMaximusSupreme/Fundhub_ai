#!/usr/bin/env node
/**
 * Replace masked placeholders in .env with real values from Netlify.
 * Production context first; if Netlify returns a mask (****), try dev context.
 *
 * Never prints secret values. Writes credentials/env.full.snapshot (gitignored).
 *
 * Usage: node scripts/env-refresh-local-from-netlify.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
const SNAPSHOT_PATH = path.join(ROOT, "credentials", "env.full.snapshot");
const CLOUD_PATH = path.join(ROOT, "credentials", "cloud-env-for-claude.txt");
const dryRun = process.argv.includes("--dry-run");

function isMasked(value) {
  const v = String(value ?? "").trim();
  if (!v) return true;
  return v.replace(/\*/g, "").length === 0 || (v.includes("*") && v.replace(/\*/g, "").length <= 8);
}

function netlifyGet(key, context) {
  const res = spawnSync("netlify", ["env:get", key, "--context", context], {
    encoding: "utf8",
    cwd: ROOT,
  });
  const out = (res.stdout || "").trim();
  if (res.status !== 0 || !out || out.startsWith("No value")) return null;
  return out;
}

function resolveValue(key) {
  const prod = netlifyGet(key, "production");
  if (prod && !isMasked(prod)) return { value: prod, source: "production" };
  const dev = netlifyGet(key, "dev");
  if (dev && !isMasked(dev)) return { value: dev, source: "dev" };
  return { value: null, source: null };
}

function parseEnvLines(text) {
  return text.split(/\n/);
}

function rebuildCloudBlock(envText) {
  const lines = [];
  for (const raw of envText.split(/\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const eq = s.indexOf("=");
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if (v && !isMasked(v)) lines.push(`${k}=${v}`);
  }
  const slPath = path.join(ROOT, ".claude", "settings.local.json");
  if (fs.existsSync(slPath)) {
    const data = JSON.parse(fs.readFileSync(slPath, "utf8"));
    const tok =
      data.SUPABASE_ACCESS_TOKEN ||
      (data.env && data.env.SUPABASE_ACCESS_TOKEN);
    if (tok && !isMasked(tok)) {
      lines.push(`SUPABASE_ACCESS_TOKEN=${tok}`);
    }
  }
  const statePath = path.join(ROOT, ".netlify", "state.json");
  if (fs.existsSync(statePath)) {
    const sid = JSON.parse(fs.readFileSync(statePath, "utf8")).siteId;
    if (sid) lines.push(`NETLIFY_SITE_ID=${sid}`);
  }
  const home = process.env.HOME || "";
  for (const cfg of [
    path.join(home, ".config/netlify/config.json"),
    path.join(home, "Library/Preferences/netlify/config.json"),
  ]) {
    if (!fs.existsSync(cfg)) continue;
    const users = JSON.parse(fs.readFileSync(cfg, "utf8")).users || {};
    for (const u of Object.values(users)) {
      const t = (u.auth && u.auth.token) || u.token;
      if (t && !isMasked(t)) {
        lines.push(`NETLIFY_AUTH_TOKEN=${t}`);
        break;
      }
    }
    break;
  }
  return `${lines.join("\n")}\n`;
}

if (!fs.existsSync(ENV_PATH)) {
  console.error(".env missing");
  process.exit(1);
}

const original = fs.readFileSync(ENV_PATH, "utf8");
const outLines = [];
let refreshed = 0;
let stillMasked = 0;
const devFallback = [];

for (const line of parseEnvLines(original)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    outLines.push(line);
    continue;
  }
  const eq = trimmed.indexOf("=");
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);

  if (!isMasked(val)) {
    outLines.push(line);
    continue;
  }

  const { value, source } = resolveValue(key);
  if (value) {
    outLines.push(`${key}=${value}`);
    refreshed += 1;
    if (source === "dev") devFallback.push(key);
  } else {
    outLines.push(line);
    stillMasked += 1;
  }
}

const nextEnv = `${outLines.join("\n").replace(/\n?$/, "\n")}`;

console.log(
  JSON.stringify(
    {
      dryRun,
      refreshed,
      stillMasked,
      devFallbackCount: devFallback.length,
      devFallbackKeys: devFallback.slice(0, 15),
    },
    null,
    2
  )
);

if (stillMasked > 0) {
  console.error(
    "Some keys stayed masked — set them in Netlify UI, then re-run."
  );
  process.exit(1);
}

if (!dryRun) {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, nextEnv);
  fs.writeFileSync(ENV_PATH, nextEnv);
  fs.writeFileSync(CLOUD_PATH, rebuildCloudBlock(nextEnv));
  console.log(`wrote ${SNAPSHOT_PATH}`);
  console.log(`wrote ${CLOUD_PATH}`);
}
