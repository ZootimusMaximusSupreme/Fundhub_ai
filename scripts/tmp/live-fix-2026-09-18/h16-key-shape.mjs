// HOLE 16 — which AI keys does PRODUCTION hold, and in what shape? NEVER prints a
// value: only "set / not set", whether it looks masked (has an asterisk), its
// length, and whether it matches the local .env copy (by sha256, compared here,
// never shown). Read-only: netlify env:get only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const NAMES = ["OPENAI_API_KEY", "COMPANY_BRAIN_OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_MODEL", "OPENAI_API_BASE"];
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
for (const name of NAMES) {
  let prod = "";
  try {
    prod = execFileSync("netlify", ["env:get", name, "--context", "production"], {
      cwd: "/Users/chrisstanbridge/Developer/fundhub-platform",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    prod = "";
  }
  if (/^No value set|not found/i.test(prod)) prod = "";
  const local = process.env[name] || "";
  console.log(JSON.stringify({
    name,
    prod_set: Boolean(prod),
    prod_len: prod.length,
    prod_masked: prod.includes("*"),
    local_set: Boolean(local),
    local_masked: local.includes("*"),
    same_as_local: Boolean(prod) && Boolean(local) && sha(prod) === sha(local)
  }));
}
