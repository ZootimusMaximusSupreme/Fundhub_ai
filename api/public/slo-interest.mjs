// GET/POST/OPTIONS /api/public/slo-interest
//
// The /roadmap widget's step 1 (name, email, phone) used to live only in the
// browser. This door saves it when the email is real, even if they never
// press Pay. A page open is saved once per browser session.
//
// It does not create a client, mint a card page, charge anyone, or send mail.
// Pay is still POST /api/public/slo-checkout.
//
// Each row says actor "person" or "agent", and why. See src/slo/visitor.mjs.

import { db as defaultDb } from "../../src/db.mjs";
import { emit } from "../../src/events/bus.mjs";
import { safeError } from "../../src/http/health.mjs";
import { pickAttribution } from "../../src/ads/attribution-keys.mjs";
import { parseSloPhone } from "./slo-checkout.mjs";
import { classifyVisitor, phoenixDay } from "../../src/slo/visitor.mjs";
import { answerPreflight, applySloCors } from "../../src/slo/cors.mjs";

const METHODS = "GET, POST, OPTIONS";
const SESSION = /^[A-Za-z0-9_-]{8,80}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req?.body === "string" ? req.body : (typeof req?.rawBody === "string" ? req.rawBody : "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function header(req, name) {
  const h = req?.headers || {};
  return h[name] || h[name.toLowerCase()] || "";
}

const clip = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * One visit or one step-1 contact. → { ok, actor, saved } or { ok:false, error }.
 * saved false means we already had this one (same session, or same email today).
 */
export async function recordInterest(body, deps = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const kind = clip(body.kind, 20);
  if (kind !== "visit" && kind !== "contact") return { ok: false, error: "kind_invalid" };

  const sessionId = clip(body.session_id, 80);
  if (kind === "visit" && !SESSION.test(sessionId)) return { ok: false, error: "session_invalid" };

  const email = clip(body.email, 160).toLowerCase();
  if (kind === "contact" && !EMAIL.test(email)) return { ok: false, error: "email_required" };

  const who = classifyVisitor({
    email: kind === "contact" ? email : "",
    userAgent: deps.userAgent,
    webdriver: body.webdriver === true || body.webdriver === "true"
  });

  const payload = {
    actor: who.actor,
    actor_reason: who.reason,
    landing_path: clip(body.landing_path, 200) || null,
    attribution: pickAttribution(body)
  };

  let name = "slo.visit";
  let idempotencyKey = `slo-visit:${sessionId}`;
  if (kind === "contact") {
    const phone = parseSloPhone(body.phone);
    const first = clip(body.first_name, 80);
    const last = clip(body.last_name, 80);
    name = "slo.contact_started";
    idempotencyKey = `slo-contact:${email}:${phoenixDay(deps.now)}`;
    payload.email = email;
    payload.name = [first, last].filter(Boolean).join(" ").trim() || null;
    payload.phone = phone.error ? null : phone.value;
  }

  const sent = await (deps.emit || emit)(
    deps.db || defaultDb,
    name,
    payload,
    {
      orgId: deps.orgId,
      allowNonCanonical: true,
      skipInngest: true,
      idempotencyKey
    }
  );
  return { ok: true, actor: who.actor, saved: sent?.deduped !== true };
}

export default async function handler(req, res, deps = {}) {
  applySloCors(req, res, METHODS);
  res.setHeader("Cache-Control", "no-store");
  if (answerPreflight(req, res, METHODS)) return;
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET") return res.status(200).json({ ok: true });
  if (method !== "POST") {
    res.setHeader("allow", METHODS);
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  try {
    const result = await recordInterest(readBody(req), {
      ...deps,
      userAgent: deps.userAgent || header(req, "user-agent")
    });
    if (!result.ok) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
