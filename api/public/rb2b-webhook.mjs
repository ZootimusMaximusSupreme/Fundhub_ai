// GET/POST /api/public/rb2b-webhook
//
// RB2B (Retention.com) pushes identified US visitors here. Docs:
// https://support.rb2b.com/en/articles/8976614-setup-guide-webhook
//
// They paste ONE https URL in their dashboard. No custom headers — put the
// shared secret in the query string (?secret=…). They document no signature.
// Payload field names are Title Case with spaces and are not customizable.
//
// Storage only. One `events` row per email (idempotency_key rb2b:<email>),
// name rb2b.visitor_identified. Repeat visits UPDATE the same row and keep
// the latest Captured URL. No client, no mail, no Inngest, no text.
// Skip-list filtering happens on send later — we still STORE team matches.
//
// Form emails already land via slo.contact_started. This door is the other
// pile: people RB2B names who may never fill the form.

import crypto from "node:crypto";
import { db as defaultDb } from "../../src/db.mjs";
import { defaultOrgId, emit } from "../../src/events/bus.mjs";
import { safeError } from "../../src/http/health.mjs";

const METHODS = "GET, POST";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_NAME = "rb2b.visitor_identified";

const clip = (v, max) => String(v ?? "").trim().slice(0, max);

function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req?.body === "string" ? req.body : (typeof req?.rawBody === "string" ? req.rawBody : "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Constant-time compare so length alone does not leak the secret. */
export function secretsMatch(provided, expected) {
  const a = crypto.createHash("sha256").update(String(provided ?? "")).digest();
  const b = crypto.createHash("sha256").update(String(expected ?? "")).digest();
  return crypto.timingSafeEqual(a, b) && String(expected ?? "").length > 0;
}

/**
 * Map RB2B's fixed payload (Title Case keys) into our row shape.
 * → { ok, email, name, linkedin_url, company, job_title, page_url, seen_at, … }
 *   or { ok:false, error, skip? } — skip:true means well-formed RB2B but nothing to mail.
 */
export function parseRb2bPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_json" };
  }

  const linkedin = clip(body["LinkedIn URL"], 500);
  const captured = clip(body["Captured URL"], 2000);
  const first = clip(body["First Name"], 80);
  const last = clip(body["Last Name"], 80);
  // RB2B may send company-only profiles with a null Business Email.
  const email = clip(body["Business Email"], 160).toLowerCase();

  // Junk: nothing that looks like their fixed shape.
  if (!linkedin && !captured && !email && !first) {
    return { ok: false, error: "not_rb2b_payload" };
  }

  if (!EMAIL.test(email)) {
    // Still a real RB2B push (company-only or no email match). Answer 200 so
    // they do not disable the webhook; we just have nobody to mail later.
    return { ok: false, error: "email_missing", skip: true };
  }

  const name = [first, last].filter(Boolean).join(" ").trim() || null;
  // RB2B's sample "Seen At" is a quirky ISO string — store as text; parse later if needed.
  const seen_at = clip(body["Seen At"], 64) || null;

  return {
    ok: true,
    email,
    name,
    linkedin_url: linkedin || null,
    company: clip(body["Company Name"], 200) || null,
    job_title: clip(body["Title"], 300) || null,
    page_url: captured || null,
    seen_at,
    referrer: clip(body["Referrer"], 2000) || null,
    website: clip(body["Website"], 500) || null,
    industry: clip(body["Industry"], 200) || null,
    city: clip(body["City"], 120) || null,
    state: clip(body["State"], 80) || null,
    tags: clip(body["Tags"], 500) || null,
    is_repeat_visit: body.is_repeat_visit === true || body.is_repeat_visitor === true
  };
}

/**
 * Upsert one identified visitor by email. Latest page wins.
 * → { ok, saved, updated? } or { ok:false, error, skip? }
 */
export async function storeRb2bVisitor(body, deps = {}) {
  const parsed = parseRb2bPayload(body);
  if (!parsed.ok) return parsed;

  const db = deps.db || defaultDb;
  const orgId = deps.orgId || (await (deps.defaultOrgId || defaultOrgId)(db));
  const idempotencyKey = `rb2b:${parsed.email}`;

  const payload = {
    email: parsed.email,
    name: parsed.name,
    linkedin_url: parsed.linkedin_url,
    company: parsed.company,
    job_title: parsed.job_title,
    page_url: parsed.page_url,
    seen_at: parsed.seen_at,
    referrer: parsed.referrer,
    website: parsed.website,
    industry: parsed.industry,
    city: parsed.city,
    state: parsed.state,
    tags: parsed.tags,
    is_repeat_visit: parsed.is_repeat_visit,
    source: "rb2b"
  };

  const existing = await db.query(
    `SELECT id, payload FROM events
     WHERE org_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [orgId, idempotencyKey]
  );

  if (existing.rows.length) {
    const prev = existing.rows[0].payload && typeof existing.rows[0].payload === "object"
      ? existing.rows[0].payload
      : {};
    const merged = {
      ...prev,
      ...payload,
      // Keep the newest page when RB2B resends (repeat-visit toggle).
      page_url: payload.page_url || prev.page_url || null,
      seen_at: payload.seen_at || prev.seen_at || null
    };
    await db.query(`UPDATE events SET payload = $1, updated_at = now() WHERE id = $2`, [
      merged,
      existing.rows[0].id
    ]);
    return { ok: true, saved: true, updated: true, email: parsed.email };
  }

  await (deps.emit || emit)(db, EVENT_NAME, payload, {
    orgId,
    allowNonCanonical: true,
    skipInngest: true,
    idempotencyKey
  });
  return { ok: true, saved: true, updated: false, email: parsed.email };
}

export default async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET") {
    // Uptime ping only — writes nothing, needs no secret.
    return res.status(200).json({ ok: true, service: "rb2b-webhook" });
  }
  if (method !== "POST") {
    res.setHeader("allow", METHODS);
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const expected = deps.secret ?? process.env.RB2B_WEBHOOK_SECRET ?? "";
  if (!expected) {
    return res.status(503).json({ ok: false, error: "webhook_not_configured" });
  }
  const provided = String((req.query && req.query.secret) || "");
  if (!secretsMatch(provided, expected)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const result = await storeRb2bVisitor(readBody(req), deps);
    if (!result.ok) {
      // Well-formed RB2B with no email → 200 so they keep the integration on.
      if (result.skip) return res.status(200).json({ ok: true, saved: false, skipped: result.error });
      return res.status(400).json(result);
    }
    return res.status(200).json({ ok: true, saved: result.saved, updated: result.updated === true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
