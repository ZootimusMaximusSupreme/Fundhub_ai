// HOLE 15 — ONE proxy auth check with the local .env Oxylabs login, through the
// app's own verify(). Prints only status and exit country/region. No secrets.
import { oxylabsConfigFromEnv, buildProxyUsername, verify, generateSessid } from "../../../src/adapters/oxylabs.mjs";
const cfg = oxylabsConfigFromEnv(process.env);
const shape = {
  ready: cfg.ready,
  raw_user_had_customer_prefix: /^customer-/i.test(String(process.env.OXYLABS_USERNAME || "")),
  user_has_whitespace: /\s/.test(String(process.env.OXYLABS_USERNAME || "")),
  pass_has_whitespace_edges: /^\s|\s$/.test(String(process.env.OXYLABS_PASSWORD || "")),
  pass_looks_masked: /^\*{4,}/.test(String(process.env.OXYLABS_PASSWORD || "")),
  pass_len: String(process.env.OXYLABS_PASSWORD || "").length,
};
try {
  const u = buildProxyUsername({ username: cfg.username, state: "AZ", sessid: generateSessid(), level: "state" });
  const v = await verify({ proxyUsername: u, proxyPassword: cfg.password, env: process.env });
  console.log(JSON.stringify({ shape, result: "OK", ok: v.ok, country: v.country, region: v.region }));
} catch (e) {
  console.log(JSON.stringify({ shape, result: "FAIL", error: e.message }));
}
