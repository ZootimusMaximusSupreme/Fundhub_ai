// h20r2 — is the live GOOGLE_GMAIL_OAUTH_TOKEN_JSON (set 16:26 UTC) the token minted on this
// laptop at 16:07 UTC? Netlify's CLI mask keeps the REAL last 4 characters of a secret. The
// mint writes pretty JSON ending in `"<minted_at>"\n}`; set via "$(cat file)" or --set-netlify
// the tail is either `Z"\n}`-shaped or compact `NZ"}`-shaped. Prints match yes/no only — never
// the characters, never a value.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h20r2-mask-match.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cwd = "/Users/chrisstanbridge/Developer/fundhub-platform";
const vars = JSON.parse(execFileSync("netlify", ["api", "getEnvVars", "--data", JSON.stringify({
  account_id: "zootimusmaximusbackup", site_id: "5905dba4-9942-480c-a510-813a3fe2b073"
})], { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));

const path = String(process.env.GOOGLE_GMAIL_OAUTH_TOKEN_PATH || "").replace(/^~\//, `${process.env.HOME}/`);
const pretty = readFileSync(path, "utf8");
const candidates = {
  "file as written (pretty, trailing newline)": pretty.slice(-4),
  "file via $(cat) (pretty, newline stripped)": pretty.replace(/\n+$/, "").slice(-4),
  "file via --set-netlify (compact JSON)": JSON.stringify(JSON.parse(pretty)).slice(-4)
};

for (const key of ["GOOGLE_GMAIL_OAUTH_TOKEN_JSON", "GOOGLE_DRIVE_OAUTH_TOKEN_JSON"]) {
  const v = vars.find((x) => x.key === key);
  for (const ctx of ["production", "deploy-preview", "branch-deploy"]) {
    const val = String(v?.values?.find((x) => x.context === ctx)?.value ?? "");
    const tail = val.slice(16);
    const hits = Object.entries(candidates).filter(([, t]) => t === tail).map(([n]) => n);
    console.log(`${key} [${ctx}] mask_len=${val.length} tail matches laptop 16:07 token: ${hits.length ? `YES (${hits.join("; ")})` : "no"}`);
  }
}
