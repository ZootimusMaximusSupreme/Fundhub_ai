#!/usr/bin/env node
/** Wait until no fetch-logos.mjs, then sync logo_path from disk. */
import { execSync } from "node:child_process";

function anyFetch() {
  try {
    return execSync("pgrep -f 'fetch-logos.mjs'", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

while (anyFetch()) {
  console.log(new Date().toISOString(), "waiting for fetch-logos…");
  execSync("sleep 30");
}

execSync("node --env-file=.env scripts/tmp/lenderlogos-sync-logo-path.mjs", {
  stdio: "inherit",
  cwd: new URL("../..", import.meta.url).pathname
});
