// GET/POST/OPTIONS /api/public/slo-interest
//
// The /roadmap widget's step 1 (name, email, phone) used to live only in the
// browser. This door saves it when the email is real, even if they never
// press Pay. A page open is saved once per browser session.
//
// kind "engage" stores seconds on the page and whether #fhw entered the
// viewport. One events row per browser session (insert, then UPDATE payload).
// The events table is append-only for new names; engage reuses its key.
//
// It does not create a client, mint a card page, charge anyone, or send mail.
// Pay is still POST /api/public/slo-checkout.
//
// Each row says actor "person" or "agent", and why. See src/slo/visitor.mjs.

import { db as defaultDb } from "../../src/db.mjs";
import { defaultOrgId, emit } from "../../src/events/bus.mjs";
import { safeError } from "../../src/http/health.mjs";
import { pickAttribution } from "../../src/ads/attribution-keys.mjs";
import { parseSloPhone } from "./slo-checkout.mjs";
import { classifyVisitor, phoenixDay } from "../../src/slo/visitor.mjs";
import { answerPreflight, applySloCors } from "../../src/slo/cors.mjs";
import { inngest } from "../../src/workflows/client.mjs";

const METHODS = "GET, POST, OPTIONS";
const SESSION = /^[A-Za-z0-9_-]{8,80}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SECONDS = 24 * 60 * 60;

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

function truthyFlag(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * One visit, one step-1 contact, or one engagement summary per session.
 * → { ok, actor, saved } or { ok:false, error }.
 * saved false means we already had this one (same session, or same email today).
 * For engage, saved true means the session row was inserted or updated.
 */
export async function recordInterest(body, deps = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const kind = clip(body.kind, 20);
  if (kind !== "visit" && kind !== "contact" && kind !== "engage") {
    return { ok: false, error: "kind_invalid" };
  }

  const sessionId = clip(body.session_id, 80);
  if ((kind === "visit" || kind === "engage") && !SESSION.test(sessionId)) {
    return { ok: false, error: "session_invalid" };
  }

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

  if (kind === "engage") {
    const seconds = Math.max(
      0,
      Math.min(MAX_SECONDS, Math.floor(Number(body.seconds_on_page) || 0))
    );
    const reached = truthyFlag(body.reached_form);
    payload.session_id = sessionId;
    payload.seconds_on_page = seconds;
    payload.reached_form = reached;

    const db = deps.db || defaultDb;
    const orgId = deps.orgId || (await (deps.defaultOrgId || defaultOrgId)(db));
    const idempotencyKey = `slo-engage:${sessionId}`;
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
        seconds_on_page: Math.max(Number(prev.seconds_on_page) || 0, seconds),
        reached_form: Boolean(prev.reached_form) || reached
      };
      await db.query(`UPDATE events SET payload = $1 WHERE id = $2`, [
        merged,
        existing.rows[0].id
      ]);
      return { ok: true, actor: who.actor, saved: true };
    }

    const sent = await (deps.emit || emit)(
      db,
      "slo.engagement",
      payload,
      {
        orgId,
        allowNonCanonical: true,
        skipInngest: true,
        idempotencyKey
      }
    );
    return { ok: true, actor: who.actor, saved: sent?.deduped !== true };
  }

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
    // Empty or invalid phone stays null. Email still starts the follow-up;
    // SMS waits until a phone lands (contact upgrade or checkout catch-up).
    payload.phone = phone.error ? null : phone.value;
  }

  const db = deps.db || defaultDb;

  // Visits stay local-only. A contact (email, with or without phone) fans out
  // to Inngest so the genuine unpaid follow-up can wait 15 minutes and
  // email/text if they bounce (src/workflows/slo-genuine-followup.mjs).
  // Agent / test actors still emit; that workflow skips them.
  const skipInngest = kind !== "contact";
  const sent = await (deps.emit || emit)(
    db,
    name,
    payload,
    {
      orgId: deps.orgId,
      allowNonCanonical: true,
      skipInngest,
      idempotencyKey
    }
  );

  // Same email already saved today without a phone (typed email first). Phone
  // just arrived — patch the row and start the follow-up now.
  if (
    kind === "contact" &&
    payload.phone &&
    sent?.deduped === true
  ) {
    const orgId = deps.orgId || (await (deps.defaultOrgId || defaultOrgId)(db));
    const existing = await db.query(
      `SELECT id, payload FROM events
       WHERE org_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [orgId, idempotencyKey]
    );
    const row = existing.rows[0];
    const prev = row?.payload && typeof row.payload === "object" ? row.payload : null;
    if (row && prev && !prev.phone) {
      const merged = {
        ...prev,
        ...payload,
        phone: payload.phone,
        name: payload.name || prev.name || null
      };
      await db.query(`UPDATE events SET payload = $1 WHERE id = $2`, [merged, row.id]);
      if (typeof deps.fanout === "function") {
        await deps.fanout({
          name: "slo.contact_started",
          id: row.id,
          payload: merged,
          orgId
        });
      } else if (process.env.INNGEST_EVENT_KEY) {
        void inngest
          .send({
            name: "slo.contact_started",
            data: { id: row.id, payload: merged, orgId, clientId: null }
          })
          .catch(() => {});
      }
      return { ok: true, actor: who.actor, saved: true };
    }
  }

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
