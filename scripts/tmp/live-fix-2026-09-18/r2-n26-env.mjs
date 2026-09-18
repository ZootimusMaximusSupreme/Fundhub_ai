// N26 — which Google token keys live on Netlify, when each was last set, and whether
// each one's masked tail matches the laptop token minted 2026-09-18 (the one Gmail uses).
// READ ONLY. Netlify's CLI mask keeps the real last 4 characters; this prints
// yes/no only — never characters, never a value.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/r2-n26-env.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cwd = "/Users/chrisstanbridge/Developer/fundhub-platform";
const vars = JSON.parse(execFileSync("netlify", ["api", "getEnvVars", "--data", JSON.stringify({
  account_id: "zootimusmaximusbackup", site_id: "5905dba4-9942-480c-a510-813a3fe2b073"
})], { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));

const path = String(process.env.GOOGLE_GMAIL_OAUTH_TOKEN_PATH || "").replace(/^~\//, `${process.env.HOME}/`);
const pretty = readFileSync(path, "utf8");
const tails = new Set([
  pretty.slice(-4),
  pretty.replace(/\n+$/, "").slice(-4),
  JSON.stringify(JSON.parse(pretty)).slice(-4)
]);

for (const v of vars.filter((x) => /GOOGLE/.test(x.key)).sort((a, b) => a.key.localeCompare(b.key))) {
  const prod = v.values?.find((x) => x.context === "production" || x.context === "all");
  const val = String(prod?.value ?? "");
  const tail = val.slice(16);
  console.log(`${v.key} updated_at=${v.updated_at} contexts=${(v.values || []).map((x) => x.context).join("+")} prod_len=${val.length} tail_matches_laptop_new_token=${tails.has(tail) ? "YES" : "no"}`);
}
