#!/usr/bin/env node
/**
 * After in-flight fetch-logos exits (or immediately if none), run N parallel lanes
 * on slug-sorted disjoint --skip/--limit slices.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const LOG_DIR = "/tmp/lenderlogos";

const parallelLanes = Math.min(4, Math.max(1, Number(process.argv[2]) || 4));
const concurrency = Number(process.argv[3]) || 5;
const waitForPid = Number(process.argv[4]) || 0;

function runningFetchPids() {
  try {
    const out = execSync("pgrep -fl fetch-logos.mjs", { encoding: "utf8" }).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => {
        const m = line.match(/^(\d+)\s/);
        return m ? Number(m[1]) : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function countMissing() {
  const { db, close } = await import("../../src/db.mjs");
  const { targetsFromDb } = await import("../lenders-logos/targets-from-db.mjs");
  const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [
    process.env.DEFAULT_ORG_SLUG || "fundhub"
  ]);
  const n = (
    await targetsFromDb(db, {
      orgId: org.rows[0].id,
      exists: (rel) =>
        fs.existsSync(path.join(ROOT, "public", String(rel).replace(/^\//, "")))
    })
  ).length;
  await close();
  return n;
}

function launchLanes(total, label) {
  const chunk = Math.ceil(total / parallelLanes);
  const pids = [];
  for (let i = 0; i < parallelLanes; i++) {
    const skip = i * chunk;
    if (skip >= total) break;
    const limit = Math.min(chunk, total - skip);
    const logPath = path.join(LOG_DIR, `${label}-lane-${i + 1}.log`);
    const args = [
      "--env-file=.env",
      "scripts/lenders-logos/fetch-logos.mjs",
      "--from-db",
      `--concurrency=${concurrency}`,
      `--skip=${skip}`,
      `--limit=${limit}`
    ];
    const child = spawn("node", args, {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", fs.openSync(logPath, "w"), fs.openSync(logPath, "w")]
    });
    child.unref();
    pids.push({ lane: i + 1, pid: child.pid, skip, limit, logPath });
  }
  return pids;
}

fs.mkdirSync(LOG_DIR, { recursive: true });

const blockPid = waitForPid || runningFetchPids().find((p) => p !== process.pid) || 0;
if (blockPid) {
  console.log(`Waiting for in-flight fetch-logos pid ${blockPid} (no slug overlap with new lanes)…`);
  try {
    execSync(`while kill -0 ${blockPid} 2>/dev/null; do sleep 15; done`, {
      stdio: "inherit",
      shell: "/bin/bash"
    });
  } catch {
    /* exited */
  }
}

const total = await countMissing();
console.log(`Missing logos (DB): ${total}`);
const started = launchLanes(total, `parallel-${Date.now()}`);
console.log(JSON.stringify({ parallelLanes, concurrency, total, started }, null, 2));
