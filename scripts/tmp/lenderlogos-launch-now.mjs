#!/usr/bin/env node
/** Split current missing targets into N slug-sorted slices; spawn one fetch per slice. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const LOG_DIR = "/tmp/lenderlogos";
const lanes = Math.min(4, Math.max(1, Number(process.argv[2]) || 4));
const concurrency = Number(process.argv[3]) || 5;
const startLane = Number(process.argv[4]) || 1; // 1-based; skip lower lanes (in-flight owns lane 1)

const { db, close } = await import("../../src/db.mjs");
const { targetsFromDb } = await import("../lenders-logos/targets-from-db.mjs");
const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [
  process.env.DEFAULT_ORG_SLUG || "fundhub"
]);
const all = (
  await targetsFromDb(db, {
    orgId: org.rows[0].id,
    exists: (rel) =>
      fs.existsSync(path.join(ROOT, "public", String(rel).replace(/^\//, "")))
  })
).sort((a, b) => a.slug.localeCompare(b.slug));
await close();

fs.mkdirSync(LOG_DIR, { recursive: true });
const chunk = Math.ceil(all.length / lanes);
const started = [];

for (let i = startLane - 1; i < lanes; i++) {
  const slice = all.slice(i * chunk, (i + 1) * chunk);
  if (!slice.length) continue;
  const slugFile = path.join(LOG_DIR, `only-slugs-lane-${i + 1}.txt`);
  fs.writeFileSync(slugFile, slice.map((t) => t.slug).join("\n") + "\n");
  const logPath = path.join(LOG_DIR, `lane-${i + 1}-now.log`);
  const args = [
    "--env-file=.env",
    "scripts/lenders-logos/fetch-logos.mjs",
    "--from-db",
    `--concurrency=${concurrency}`,
    `--only-slugs=${slugFile}`
  ];
  const child = spawn("node", args, {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", fs.openSync(logPath, "w"), fs.openSync(logPath, "w")]
  });
  child.unref();
  started.push({ lane: i + 1, pid: child.pid, banks: slice.length, slugFile, logPath });
}

console.log(JSON.stringify({ total: all.length, lanes, chunk, started }, null, 2));
