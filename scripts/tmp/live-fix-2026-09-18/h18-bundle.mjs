// Hole 18 — build ONE Netlify function zip the way `netlify deploy --build`
// does (zip-it-and-ship-it from the installed netlify-cli, the [functions]
// block of netlify.toml), then say whether @pdf-lib/fontkit made it into the
// zip and whether the bundled entry loads without "Cannot find module".
// Builds into a scratch folder. Deploys nothing, touches no database.
//
// Run: node scripts/tmp/live-fix-2026-09-18/h18-bundle.mjs <outDir> [functionName]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* H18_ROOT points at a build tree whose node_modules is a REAL folder. A
   worktree whose node_modules is a symlink zips the symlink itself, and the
   unzipped copy then resolves every package from the laptop — a false pass. */
const ROOT = path.resolve(process.env.H18_ROOT || new URL("../../..", import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] || "/tmp/h18-bundle");
const NAME = process.argv[3] || "commas-inbox-sweeper";
const CLI = execFileSync("sh", ["-c", "dirname $(dirname $(readlink -f $(which netlify)))"]).toString().trim();
const zisi = await import(pathToFileURL(path.join(CLI, "node_modules/@netlify/zip-it-and-ship-it/dist/main.js")).href);

const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
const block = toml.split("[functions]")[1].split(/\n\[/)[0];
const included = [...block.matchAll(/^\s*"([^"]+)",?\s*(#.*)?$/gm)].map((m) => m[1]);
const external = JSON.parse(block.match(/external_node_modules\s*=\s*(\[[^\]]*\])/)[1]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const res = await zisi.zipFunction(path.join(ROOT, "netlify/functions", `${NAME}.mjs`), OUT, {
  basePath: ROOT,
  repositoryRoot: ROOT,
  config: { "*": { nodeBundler: "esbuild", includedFiles: included, externalNodeModules: external } }
});

const zip = res.path;
const listing = execFileSync("unzip", ["-l", zip]).toString();
const hasFontkit = /node_modules\/@pdf-lib\/fontkit\/package\.json/.test(listing);
const unz = path.join(OUT, "unzipped");
execFileSync("unzip", ["-q", "-o", zip, "-d", unz]);

/* Load the bundled entry exactly as the platform would: import it. Loading
   only — the handler is never called, so no database is touched. */
const entry = [path.join(unz, "netlify/functions", `${NAME}.mjs`), path.join(unz, `${NAME}.mjs`)].find(existsSync);
let load = "not found";
if (entry) {
  try {
    const mod = await import(pathToFileURL(entry).href);
    load = `ok (default export: ${typeof mod.default})`;
  } catch (e) {
    load = `FAILED: ${String(e.message).split("\n")[0]}`;
  }
}
console.log(JSON.stringify({ name: NAME, bundler: res.bundler, zip, hasFontkit, entry, load }, null, 2));
