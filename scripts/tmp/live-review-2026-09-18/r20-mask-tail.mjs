// r20 — does Netlify's secret mask keep the real last 4 characters? If so, the tail of
// the Google token's mask tells us the live value is non-empty and ends like JSON.
// Prints only a CLASS of the tail (e.g. "ends with }", "4 digits"), never the characters.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cwd = "/Users/chrisstanbridge/Developer/fundhub-platform";
const { siteId } = JSON.parse(readFileSync(`${cwd}/.netlify/state.json`, "utf8"));
const vars = JSON.parse(execFileSync("netlify", ["api", "getEnvVars", "--data", JSON.stringify({ account_id: "zootimusmaximusbackup", site_id: siteId })], { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
function cls(tail) {
  if (/^\*+$/.test(tail)) return "all asterisks";
  const parts = [];
  if (/\}$/.test(tail)) parts.push("ends with }");
  if (/"/.test(tail)) parts.push("has a quote");
  if (/^\d{4}$/.test(tail)) parts.push("4 digits");
  else if (/^[0-9a-f]{4}$/i.test(tail)) parts.push("4 hex chars");
  else if (/^[A-Za-z0-9_-]{4}$/.test(tail)) parts.push("4 token chars");
  return parts.join(", ") || "other";
}
for (const key of ["GOOGLE_DRIVE_OAUTH_TOKEN_JSON", "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "PULSE_SMS_TO", "INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY"]) {
  const v = vars.find((x) => x.key === key);
  const prod = v?.values?.find((x) => x.context === "production") || v?.values?.find((x) => x.context === "all");
  const s = String(prod?.value ?? "");
  const tail = s.slice(16);
  console.log(`${key}: mask_len=${s.length} leading_asterisks=${(s.match(/^\*+/) || [""])[0].length} tail_class=${cls(tail)}`);
}
