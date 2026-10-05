// The ports the jobs run against (see src/ad-videos/worker-jobs.mjs): a work
// directory, child processes, downloads, R2 and Remotion. No decisions here.

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Run a binary, collecting output. Never throws on a non-zero exit; the job decides. */
export function run(bin, args, { timeoutMs = 20 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const MAX = 4 * 1024 * 1024; // loudnorm and silencedetect are small; a runaway log is not kept whole
    child.stdout.on("data", (d) => { if (stdout.length < MAX) stdout += d; });
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-MAX); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

/** Stream a URL to a file. Raw takes are written to this machine's disk only, never re-uploaded. */
export async function download({ url, headers = {} }, path) {
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
}

/**
 * A fresh work directory per job, removed when the job ends. These are the
 * worker's own scratch files (not Chris's raw library), so removing them is
 * not a data deletion (CLAUDE.md §11).
 */
export async function withWorkDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "fh-video-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function makeIo({ dir, r2, renderClip }) {
  return {
    dir,
    path: (name) => join(dir, name),
    writeText: (path, text) => writeFile(path, text),
    run,
    download,
    putFile: (key, path, type) => r2.putFile(key, path, type),
    getFile: (key, path) => r2.getFile(key, path),
    has: (key) => r2.has(key),
    renderClip,
  };
}
