// HOLE 16 — can the live FUNCTIONS see the AI keys? Netlify scopes each variable
// (builds / functions / runtime / post-processing). Prints ONLY the name, its
// scopes, whether it is a secret, and which contexts carry a value. Never a value.
import { execFileSync } from "node:child_process";

const SITE = "5905dba4-9942-480c-a510-813a3fe2b073";
const site = JSON.parse(execFileSync("netlify", ["api", "getSite", "--data", JSON.stringify({ site_id: SITE })], {
  cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
}));
const accountId = site.account_id;
for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
  let v = null;
  try {
    v = JSON.parse(execFileSync("netlify", ["api", "getEnvVar", "--data", JSON.stringify({ account_id: accountId, site_id: SITE, key })], {
      cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }));
  } catch {
    v = null;
  }
  console.log(JSON.stringify({
    key,
    found: Boolean(v),
    scopes: v?.scopes || null,
    is_secret: v?.is_secret ?? null,
    contexts: (v?.values || []).map((x) => x.context)
  }));
}
