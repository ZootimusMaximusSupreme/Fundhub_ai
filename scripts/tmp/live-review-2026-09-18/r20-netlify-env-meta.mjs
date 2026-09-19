// r20 — read-only: metadata (never values) of the Google keys on the LIVE Netlify site.
// Shows which Google OAuth keys exist on production, their scopes, when they were last
// set, and the SHAPE of the production value (length, asterisks, parses as JSON or not,
// which JSON field NAMES it has). Never prints a value.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cwd = "/Users/chrisstanbridge/Developer/fundhub-platform";
const { siteId } = JSON.parse(readFileSync(`${cwd}/.netlify/state.json`, "utf8"));
const out = execFileSync("netlify", ["api", "getEnvVars", "--data", JSON.stringify({ account_id: "zootimusmaximusbackup", site_id: siteId })], { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const vars = JSON.parse(out);
console.log(`env vars on site: ${vars.length}`);
for (const v of vars.filter((x) => /GOOGLE|GMAIL|OAUTH|PULSE_SMS|INNGEST/i.test(x.key)).sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`${v.key}: secret=${v.is_secret} scopes=${JSON.stringify(v.scopes)} updated_at=${v.updated_at || "?"}`);
  for (const val of v.values || []) {
    const s = String(val.value ?? "");
    const stars = (s.match(/\*/g) || []).length;
    let json = "not json";
    let fields = "";
    try { const p = JSON.parse(s); json = "json"; fields = Object.keys(p).sort().join(","); } catch { /* shape only */ }
    console.log(`   context=${val.context} value_len=${s.length} asterisks=${stars} ${json}${fields ? ` fields=[${fields}]` : ""} value_updated=${val.updated_at || "?"}`);
  }
}
