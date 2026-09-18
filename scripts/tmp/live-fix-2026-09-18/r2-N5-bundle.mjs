// Hole N5 — build each timed job's zip with Netlify's own bundler (the
// zip-it-and-ship-it inside the installed netlify-cli), then:
//   1. print the runtime style Netlify assigned (runtimeAPIVersion 2 = the
//      newer style, which accepts only a Response or undefined), and
//   2. import the BUNDLED entry and call its default export the way Netlify
//      does, with no DATABASE_URL, and print what came back.
// Builds into a scratch folder. Deploys nothing, touches no database: with no
// DATABASE_URL every sweep fails at its first query and returns.
//
// Run: node scripts/tmp/live-fix-2026-09-18/r2-N5-bundle.mjs <outDir>
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

delete process.env.DATABASE_URL;
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] || "/tmp/r2-n5-bundle");
const CLI = execFileSync("sh", ["-c", "dirname $(dirname $(readlink -f $(which netlify)))"]).toString().trim();
const zisi = await import(pathToFileURL(path.join(CLI, "node_modules/@netlify/zip-it-and-ship-it/dist/main.js")).href);

const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
const block = toml.split("[functions]")[1].split(/\n\[/)[0];
const included = [...block.matchAll(/^\s*"([^"]+)",?\s*(#.*)?$/gm)].map((m) => m[1]);
const external = JSON.parse(block.match(/external_node_modules\s*=\s*(\[[^\]]*\])/)[1]);
const names = [...toml.matchAll(/\[functions\."([^"]+)"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const rows = [];
for (const name of names) {
  const dir = path.join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const res = await zisi.zipFunction(path.join(ROOT, "netlify/functions", `${name}.mjs`), dir, {
    basePath: ROOT,
    repositoryRoot: ROOT,
    config: { "*": { nodeBundler: "esbuild", includedFiles: included, externalNodeModules: external } }
  });
  const unz = path.join(dir, "unzipped");
  execFileSync("unzip", ["-q", "-o", res.path, "-d", unz]);
  const entry = [path.join(unz, "netlify/functions", `${name}.mjs`), path.join(unz, `${name}.mjs`)].find(existsSync);
  let returned = "entry not found";
  if (entry) {
    try {
      const mod = await import(pathToFileURL(entry).href);
      const r = await mod.default(new Request(`https://fundhub.ai/.netlify/functions/${name}`, { method: "POST" }), {});
      returned = r instanceof Response ? `Response ${r.status}` : r === undefined ? "undefined"
        : (r && typeof r === "object" && "statusCode" in r) ? "{ statusCode, body } (REJECTED by Netlify)" : typeof r;
    } catch (e) {
      returned = `THREW: ${String(e.message).split("\n")[0]}`;
    }
  }
  rows.push({ name, runtimeAPIVersion: res.runtimeAPIVersion, schedule: res.schedule ?? null, returned });
}
console.log(JSON.stringify(rows, null, 2));
