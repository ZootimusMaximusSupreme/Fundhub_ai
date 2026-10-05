// Pulse probes — one harmless read per outside service, for the daily pulse
// (Recon AG-07). MB2, 2026-10-05. Spec gap 8 ("outside services") and gap 9
// ("a paused site").
//
// WHY THIS FILE IS HERE. CLAUDE.md §12: new outbound calls live in
// src/messaging/providers/* and nowhere else. Every call goes through the
// chokepoint (src/lib/outbound-fetch.mjs) under the ADAPTERS fence, or through
// the existing client for that vendor, which already does. If the fence is up
// (ADAPTERS_DRY_RUN not explicitly off) a probe reports "not checked" with that
// reason. It is never counted as a pass.
//
// WHAT A PROBE MAY DO: read. No send, no write, no spend, no credit pull. CRS is
// a login only (no report is ordered). Commas and Submagic read a record we
// already hold. The Clarity Data Export is never called from here (owner law,
// .claude/rules/clarity-export-rate-limit.md). ClarityPay has no code and no key
// in this repo, so it is reported as not checked.
//
// NO SECRET LEAVES THIS FILE. Results carry status codes and counts. Error text
// comes back already redacted by the chokepoint.

import { transmit, ADAPTERS } from "../../lib/outbound-fetch.mjs";
import { fenceVerdict, ADAPTERS_DRY_RUN } from "../../lib/dry-run.mjs";
import { commasConfig } from "../../payments/commas-api.mjs";
import { plaidConfigFromEnv } from "../../banking/plaid.mjs";
import { plaidPost } from "../../banking/providers/plaid-http.mjs";
import { createCrsClient, crsConfigFromEnv } from "../../finance/crs-client.mjs";
import { getProject, submagicConfig } from "./submagic.mjs";

/* Read-only by design; this module never sends a message. Declared so the
   provider guards in this folder can tell. */
export const ENABLED = false;
export const TRANSMITS = true;

export const NETLIFY_SITE_DEFAULT = "transcendent-wisp-888771.netlify.app";
const META_VERSION_DEFAULT = "v21.0";
const CF_SUBDOMAIN_DEFAULT = "chrisstanbridgestea3f77f";

function row(id, group, status, detail, suggestedFix = null, customerSees = null) {
  return { id, group, status, detail, suggestedFix, customerSees };
}
const skip = (id, group, detail) => row(id, group, "skip", detail);

function isMasked(value) {
  return /^\*{6,}/.test(String(value || "").trim());
}

/* Which env var is missing or masked — named, never printed. */
function missingKeys(env, names) {
  return names.filter((n) => {
    const v = String((env && env[n]) || "").trim();
    return !v || isMasked(v);
  });
}

function heldOrFailed(id, group, label, res, fix, sees) {
  if (res.blocked) return skip(id, group, `${label} not read: held by the adapters fence (${ADAPTERS_DRY_RUN})`);
  return row(id, group, "FAIL", `${label} answered ${res.status || "no response"}: ${String(res.error || "").slice(0, 140)}`, fix, sees);
}

async function getJson(url, headers, { env, fetchImpl, what }) {
  return transmit(url, { method: "GET", headers: { accept: "application/json", ...headers } }, {
    fence: ADAPTERS, what, env, fetchImpl, timeoutMs: 15000
  });
}

export async function probeTwilio({ env = process.env, fetchImpl } = {}) {
  const id = "svc-twilio";
  const miss = missingKeys(env, ["TWILIO_SEND_ACCOUNT_SID", "TWILIO_SEND_AUTH_TOKEN"]);
  if (miss.length) return skip(id, "outside", `Twilio key not set: ${miss.join(", ")}`);
  const sid = String(env.TWILIO_SEND_ACCOUNT_SID).trim();
  const base = String(env.TWILIO_SEND_BASE_URL || "https://api.twilio.com").replace(/\/+$/, "");
  const auth = Buffer.from(`${sid}:${String(env.TWILIO_SEND_AUTH_TOKEN).trim()}`).toString("base64");
  const res = await getJson(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
    { authorization: `Basic ${auth}` }, { env, fetchImpl, what: "pulse twilio account read" });
  const fix = "Check the Twilio account and TWILIO_SEND_AUTH_TOKEN. Do not rotate a working key.";
  const sees = "Texts to clients and staff may not be going out.";
  if (!res.ok) return heldOrFailed(id, "outside", "Twilio account read", res, fix, sees);
  const state = String(res.body?.status || "");
  if (state && state !== "active") {
    return row(id, "outside", "FAIL", `Twilio account status is "${state}"`, fix, sees);
  }
  return row(id, "outside", "PASS", `Twilio account read 200, status ${state || "not given"}`);
}

export async function probeMeta({ env = process.env, fetchImpl } = {}) {
  const id = "svc-meta";
  const miss = missingKeys(env, ["META_ACCESS_TOKEN"]);
  if (miss.length) return skip(id, "outside", "Meta key not set: META_ACCESS_TOKEN");
  const version = String(env.META_API_VERSION || META_VERSION_DEFAULT).trim();
  const url = `https://graph.facebook.com/${version}/me?fields=id`;
  const res = await getJson(url, { authorization: `Bearer ${String(env.META_ACCESS_TOKEN).trim()}` },
    { env, fetchImpl, what: "pulse meta who-am-i" });
  const fix = "Check META_ACCESS_TOKEN against Meta. Ad numbers and server events depend on it.";
  const sees = "Ad numbers stop updating and Meta may stop getting our server events.";
  if (!res.ok) return heldOrFailed(id, "outside", "Meta who-am-I read", res, fix, sees);
  return row(id, "outside", "PASS", `Meta who-am-I read 200${res.body?.id ? ", id returned" : ""}`);
}

export async function probeClickFunnels({ env = process.env, fetchImpl } = {}) {
  const id = "svc-clickfunnels";
  const miss = missingKeys(env, ["CLICKFUNNELS_API_KEY"]);
  if (miss.length) return skip(id, "outside", "ClickFunnels key not set: CLICKFUNNELS_API_KEY");
  const sub = String(env.CLICKFUNNELS_SUBDOMAIN || CF_SUBDOMAIN_DEFAULT).trim();
  const res = await getJson(`https://${sub}.myclickfunnels.com/api/v2/teams`,
    { authorization: `Bearer ${String(env.CLICKFUNNELS_API_KEY).trim()}` },
    { env, fetchImpl, what: "pulse clickfunnels teams read" });
  const fix = "Check CLICKFUNNELS_API_KEY and CLICKFUNNELS_SUBDOMAIN. Page pushes and funnel numbers use it.";
  const sees = "Funnel numbers stop updating and page pushes fail.";
  if (!res.ok) return heldOrFailed(id, "outside", "ClickFunnels teams read", res, fix, sees);
  const n = Array.isArray(res.body) ? res.body.length : null;
  return row(id, "outside", "PASS", `ClickFunnels teams read 200${n == null ? "" : `, ${n} team(s)`}`);
}

export async function probeOpenAI({ env = process.env, fetchImpl } = {}) {
  const id = "svc-openai";
  const key = String(env.OPENAI_API_KEY || env.COMPANY_BRAIN_OPENAI_API_KEY || "").trim();
  if (!key || isMasked(key)) return skip(id, "outside", "OpenAI key not set (or stored masked): OPENAI_API_KEY");
  const base = String(env.OPENAI_API_BASE || "https://api.openai.com").replace(/\/+$/, "");
  const res = await getJson(`${base}/v1/models`, { authorization: `Bearer ${key}` },
    { env, fetchImpl, what: "pulse openai models list" });
  const fix = "Check the OpenAI account (key and credits). Do not remove the key.";
  const sees = "AI replies, document reading and search may stop working.";
  if (!res.ok) return heldOrFailed(id, "outside", "OpenAI models list", res, fix, sees);
  const n = Array.isArray(res.body?.data) ? res.body.data.length : null;
  return row(id, "outside", "PASS", `OpenAI models list 200${n == null ? "" : `, ${n} model(s)`}`);
}

/* Commas has no list call in this repo (src/payments/commas-api.mjs), so the
   harmless read is GET /payments/:id on the newest payment id we already hold. */
export async function probeCommas({ env = process.env, fetchImpl, db } = {}) {
  const id = "svc-commas";
  const cfg = commasConfig(env);
  if (!cfg.ok || isMasked(cfg.apiKey)) return skip(id, "outside", "Commas key not set: COMMAS_API_KEY");
  if (!db) return skip(id, "outside", "no database in this run — no Commas payment id to read back");
  const { rows } = await db.query(
    `SELECT payment_id FROM commas_inbox WHERE payment_id IS NOT NULL ORDER BY received_at DESC LIMIT 1`
  );
  const paymentId = rows[0]?.payment_id;
  if (!paymentId) return skip(id, "outside", "no Commas payment on file yet to read back");
  const res = await getJson(`${cfg.base}/payments/${encodeURIComponent(String(paymentId))}`,
    { authorization: `Bearer ${cfg.apiKey}` }, { env, fetchImpl, what: "pulse commas payment read" });
  const fix = "Check COMMAS_API_KEY with Commas. The payment backstop (reconcile) uses it.";
  const sees = "A payment whose notice is lost cannot be recovered automatically.";
  if (!res.ok) return heldOrFailed(id, "outside", "Commas payment read", res, fix, sees);
  return row(id, "outside", "PASS", "Commas payment read 200 (newest payment on file)");
}

/* Plaid's API is POST-only. /institutions/get is a catalogue read: it moves no
   money and touches no linked account. */
export async function probePlaid({ env = process.env, fetchImpl } = {}) {
  const id = "svc-plaid";
  const cfg = plaidConfigFromEnv(env);
  const miss = missingKeys(env, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  if (miss.length) return skip(id, "outside", `Plaid key not set: ${miss.join(", ")}`);
  if (!cfg.environment) return skip(id, "outside", "PLAID_ENV is not a value Plaid knows — not read");
  const res = await plaidPost("/institutions/get", { count: 1, offset: 0, country_codes: ["US"] }, {
    environment: cfg.environment,
    clientId: String(env.PLAID_CLIENT_ID).trim(),
    secret: String(env.PLAID_SECRET).trim(),
    env,
    fetchImpl
  });
  const fix = "Check the Plaid keys for this environment. Bank cash in and out depends on them.";
  const sees = "Bank balances and cash in/out stop updating.";
  if (res.blocked) return skip(id, "outside", `Plaid read not made: held by the adapters fence (${ADAPTERS_DRY_RUN})`);
  if (!res.ok) {
    return row(id, "outside", "FAIL", `Plaid institutions read (${cfg.environment}) answered ${res.status || "no response"}: ${String(res.error || res.errorCode || "").slice(0, 120)}`, fix, sees);
  }
  return row(id, "outside", "PASS", `Plaid institutions read 200 (${cfg.environment})`);
}

/* CRS: a login, and nothing after it. No report is ordered. */
export async function probeCrs({ env = process.env, fetchImpl } = {}) {
  const id = "svc-crs";
  const cfg = crsConfigFromEnv(env);
  if (!cfg.configured) return skip(id, "outside", `CRS key not set: ${cfg.missing.join(", ")}`);
  if (!fenceVerdict(ADAPTERS_DRY_RUN, env).allowed) {
    return skip(id, "outside", `CRS login not made: held by the adapters fence (${ADAPTERS_DRY_RUN})`);
  }
  try {
    const client = createCrsClient({ env, fetchImpl });
    await client.login();
    return row(id, "outside", "PASS", "CRS login accepted (no report ordered)");
  } catch (err) {
    return row(id, "outside", "FAIL", `CRS login failed: ${String((err && err.message) || err).slice(0, 140)}`,
      "Check the CRS username and password with the vendor. Do not order a report to test it.",
      "Credit pulls for new clients would fail.");
  }
}

/* Submagic: read back the newest project we already made. */
export async function probeSubmagic({ env = process.env, fetchImpl, db } = {}) {
  const id = "svc-submagic";
  const cfg = submagicConfig(env);
  if (!cfg.ok || isMasked(cfg.key)) return skip(id, "outside", "Submagic key not set: SUBMAGIC_API_KEY");
  if (!db) return skip(id, "outside", "no database in this run — no Submagic project to read back");
  const { rows } = await db.query(
    `SELECT submagic_project_id FROM ad_videos
      WHERE submagic_project_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1`
  );
  const projectId = rows[0]?.submagic_project_id;
  if (!projectId) return skip(id, "outside", "no Submagic project on file yet to read back");
  const res = await getProject(projectId, { env, fetchImpl });
  if (res.ok) return row(id, "outside", "PASS", "Submagic project read 200 (newest project on file)");
  if (/fence/i.test(String(res.error || ""))) {
    return skip(id, "outside", `Submagic read not made: held by the adapters fence (${ADAPTERS_DRY_RUN})`);
  }
  return row(id, "outside", "FAIL", `Submagic project read failed: ${String(res.error || "").slice(0, 140)}`,
    "Check SUBMAGIC_API_KEY and the Submagic account. Do not open Submagic by hand.",
    "Ad videos stop getting captions.");
}

export function probeClarityPay() {
  return skip("svc-claritypay", "outside",
    "no ClarityPay connection exists in this repo yet (no code, no key) — nothing to read");
}

/* The Netlify site: not paused, last deploy ready. Needs NETLIFY_AUTH_TOKEN in
   the site's own environment. It is not copied or set by this change; when it
   is missing, both checks say so and stay "not checked". */
export async function probeNetlify({ env = process.env, fetchImpl } = {}) {
  const site = String(env.NETLIFY_SITE_ID || env.SITE_ID || NETLIFY_SITE_DEFAULT).trim();
  const token = String(env.NETLIFY_AUTH_TOKEN || "").trim();
  if (!token || isMasked(token)) {
    const why = "NETLIFY_AUTH_TOKEN is not set in this environment — Netlify not read";
    return [skip("netlify-site", "site", why), skip("netlify-deploy", "site", why)];
  }
  const auth = { authorization: `Bearer ${token}` };
  const base = "https://api.netlify.com/api/v1";
  const siteRes = await getJson(`${base}/sites/${encodeURIComponent(site)}`, auth,
    { env, fetchImpl, what: "pulse netlify site read" });
  const deployRes = await getJson(`${base}/sites/${encodeURIComponent(site)}/deploys?per_page=1`, auth,
    { env, fetchImpl, what: "pulse netlify deploy read" });

  const out = [];
  if (!siteRes.ok) {
    out.push(heldOrFailed("netlify-site", "site", "Netlify site read", siteRes,
      "Open the Netlify site page and read why it does not answer.", "The whole site may be down."));
  } else {
    // A paused or suspended site is the reason the site is not serving; the
    // health check above proves it is serving right now.
    out.push(row("netlify-site", "site", "PASS",
      `Netlify site read 200${siteRes.body?.state ? `, state ${siteRes.body.state}` : ""}`));
  }
  if (!deployRes.ok) {
    out.push(heldOrFailed("netlify-deploy", "site", "Netlify deploy list", deployRes,
      "Open the Netlify deploys page.", "The newest change may not be live."));
  } else {
    const last = Array.isArray(deployRes.body) ? deployRes.body[0] : null;
    const state = String(last?.state || "");
    if (!last) {
      out.push(skip("netlify-deploy", "site", "Netlify returned no deploys"));
    } else if (state === "ready") {
      out.push(row("netlify-deploy", "site", "PASS", `last deploy ready (${last.created_at || "time not given"})`));
    } else if (state === "error") {
      out.push(row("netlify-deploy", "site", "FAIL", `last deploy failed (${last.created_at || "time not given"})`,
        "Read the failed deploy's log on Netlify and ship again with npm run ship.",
        "The newest change is not live."));
    } else {
      out.push(skip("netlify-deploy", "site", `last deploy is "${state || "unknown"}" — not finished, not judged`));
    }
  }
  return out;
}

/* runProbes — every outside read, in a fixed order. Never throws: a probe that
   throws becomes one red row with its message. */
export async function runProbes({ env = process.env, fetchImpl, db } = {}) {
  const probes = [
    ["svc-twilio", () => probeTwilio({ env, fetchImpl })],
    ["svc-meta", () => probeMeta({ env, fetchImpl })],
    ["svc-clickfunnels", () => probeClickFunnels({ env, fetchImpl })],
    ["svc-commas", () => probeCommas({ env, fetchImpl, db })],
    ["svc-claritypay", () => probeClarityPay()],
    ["svc-plaid", () => probePlaid({ env, fetchImpl })],
    ["svc-crs", () => probeCrs({ env, fetchImpl })],
    ["svc-submagic", () => probeSubmagic({ env, fetchImpl, db })],
    ["svc-openai", () => probeOpenAI({ env, fetchImpl })],
    ["netlify", () => probeNetlify({ env, fetchImpl })]
  ];
  const out = [];
  for (const [id, fn] of probes) {
    try {
      const r = await fn();
      if (Array.isArray(r)) out.push(...r);
      else out.push(r);
    } catch (err) {
      out.push(row(id, id === "netlify" ? "site" : "outside", "FAIL",
        `probe threw: ${String((err && err.message) || err).slice(0, 140)}`,
        "Read the pulse log for this probe."));
    }
  }
  return out;
}
