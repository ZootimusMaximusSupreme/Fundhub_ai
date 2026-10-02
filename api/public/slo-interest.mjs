// GET/POST/OPTIONS /api/public/slo-interest
//
// The /roadmap widget's step 1 (name, email, phone) used to live only in the
// browser. This door saves it as soon as a valid email is typed, even if they
// never press Pay: one slo.contact_started row per email per day. A phone or
// name typed later merges into that same row. A page open is saved once per
// browser session.
//
// The same step-1 contact is copied to ClickFunnels (src/slo/cf-contact.mjs,
// upsert matched on email, so the step-3 write in src/slo/pull.mjs updates the
// same contact). Real people only. The answer never waits on or fails because
// of ClickFunnels; the outcome is recorded on the row as payload.cf_contact.
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
import { syncSloClickfunnelsContact } from "../../src/slo/cf-contact.mjs";
import { inngest } from "../../src/workflows/client.mjs";

const METHODS = "GET, POST, OPTIONS";
const SESSION = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_SECONDS = 24 * 60 * 60;

// A step-1 email, checked here and not only in the browser, because this door
// now also writes a ClickFunnels contact. Stricter than the shared
// /^[^\s@]+@[^\s@]+\.[^\s@]+$/: a real domain, a letter top-level domain, and
// 160 characters at most (a longer one is refused, never cut short).
// public/funnel/fh-attribution.js checks the same pattern before it posts.
export const CONTACT_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const MAX_EMAIL = 160;

// How long the door gives the ClickFunnels write before it answers anyway.
// The answer is already decided and never depends on ClickFunnels. Without
// this short wait the function host (AWS Lambda under Netlify) can freeze
// once the answer goes out, before the ClickFunnels call has finished.
export const CF_WAIT_MS = 3000;

// kind "page" and "click": one step open, one button press, on the /watch path
// or the /roadmap path (public/funnel/fh-events.js). Pages are an allow-list so
// a stranger cannot invent step names; a target is a short lowercase label.
const FUNNEL_PAGES = new Set([
  "/watch", "/apply", "/funding-book-call", "/thank-you",
  "/roadmap", "/roadmap-book", "/roadmap-thank-you"
]);
const TARGET = /^[a-z0-9][a-z0-9_:.-]{0,63}$/;
const MAX_CLICKS_PER_SESSION = 60;

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

/** Lower-cased email when it passes CONTACT_EMAIL, else "". */
export function contactEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.length <= MAX_EMAIL && CONTACT_EMAIL.test(email) ? email : "";
}

/**
 * Copy this step-1 contact to ClickFunnels without holding up the answer.
 * Real people only: agents and test emails stay out of Paul's contacts.
 * Never rejects. The outcome lands on the same events row as cf_contact.
 */
function startCfWrite(db, rowId, contact, who, deps) {
  if (who.actor !== "person") return null;
  const job = (async () => {
    let out;
    try {
      out = await (deps.syncCf || syncSloClickfunnelsContact)(contact, {
        env: deps.env || process.env
      });
    } catch (err) {
      out = { ok: false, error: "clickfunnels_threw", message: String(err?.message || err).slice(0, 200) };
    }
    if (!rowId) return out;
    const note = { ok: out?.ok === true, at: new Date().toISOString() };
    if (out?.id != null) note.contact_id = out.id;
    if (out?.skipped) note.skipped = out.reason || "skipped";
    if (out?.error) note.error = out.error;
    if (out?.status) note.status = out.status;
    if (out?.message) note.message = out.message;
    try {
      // Patch one key so a phone merge landing at the same moment is kept.
      await db.query(
        `UPDATE events SET payload = payload || $1::jsonb WHERE id = $2`,
        [{ cf_contact: note }, rowId]
      );
    } catch (err) {
      console.error("slo-interest: ClickFunnels result not recorded —", err?.message || err);
    }
    return out;
  })();
  if (typeof deps.onCfWrite === "function") deps.onCfWrite(job);
  return job;
}

/** Wait for a promise, but never longer than ms. Never rejects. */
function settleWithin(promise, ms) {
  if (!promise || !(ms > 0)) return Promise.resolve();
  let timer;
  return Promise.race([
    Promise.resolve(promise).then(() => {}, () => {}),
    new Promise((resolve) => { timer = setTimeout(resolve, ms); })
  ]).finally(() => clearTimeout(timer));
}

/**
 * One visit, one step-1 contact, or one engagement summary per session.
 * → { ok, actor, saved } or { ok:false, error }.
 * saved false means we already had this one (same session, or same email today
 * with nothing new typed). For engage, saved true means the session row was
 * inserted or updated. For contact, saved true means the row was inserted or a
 * phone / name merged in; the ClickFunnels copy is handed to deps.onCfWrite.
 */
export async function recordInterest(body, deps = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const kind = clip(body.kind, 20);
  if (kind !== "visit" && kind !== "contact" && kind !== "engage" && kind !== "page" && kind !== "click") {
    return { ok: false, error: "kind_invalid" };
  }

  const sessionId = clip(body.session_id, 80);
  if (kind !== "contact" && !SESSION.test(sessionId)) {
    return { ok: false, error: "session_invalid" };
  }

  const email = kind === "contact" ? contactEmail(body.email) : "";
  if (kind === "contact" && !email) return { ok: false, error: "email_required" };

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

  if (kind === "page" || kind === "click") {
    const page = clip(body.page, 60).toLowerCase().replace(/\/+$/, "");
    if (!FUNNEL_PAGES.has(page)) return { ok: false, error: "page_invalid" };
    const target = String(body.target ?? "").trim().toLowerCase();
    if (kind === "click" && !TARGET.test(target)) return { ok: false, error: "target_invalid" };

    payload.session_id = sessionId;
    payload.page = page;
    if (kind === "click") payload.target = target;

    const db = deps.db || defaultDb;
    const orgId = deps.orgId || (await (deps.defaultOrgId || defaultOrgId)(db));

    if (kind === "click") {
      // One session cannot fill the table with made-up labels.
      const used = await db.query(
        `SELECT count(*)::int AS n FROM events
         WHERE org_id = $1 AND name = 'funnel.click'
           AND created_at > now() - interval '1 day'
           AND idempotency_key LIKE $2`,
        [orgId, `funnel-click:${sessionId.replace(/[\\%_]/g, "\\$&")}:%`]
      );
      if ((used.rows[0]?.n ?? 0) >= MAX_CLICKS_PER_SESSION) {
        return { ok: true, actor: who.actor, saved: false };
      }
    }

    const sent = await (deps.emit || emit)(
      db,
      kind === "click" ? "funnel.click" : "funnel.page",
      payload,
      {
        orgId,
        allowNonCanonical: true,
        skipInngest: true,
        idempotencyKey: kind === "click"
          ? `funnel-click:${sessionId}:${page}:${target}`
          : `funnel-page:${sessionId}:${page}`
      }
    );
    return { ok: true, actor: who.actor, saved: sent?.deduped !== true };
  }

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
  let first = "";
  let last = "";
  if (kind === "contact") {
    const phone = parseSloPhone(body.phone);
    first = clip(body.first_name, 80);
    last = clip(body.last_name, 80);
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

  if (kind !== "contact") {
    return { ok: true, actor: who.actor, saved: sent?.deduped !== true };
  }

  // What ClickFunnels gets: the email, plus whatever name and phone are known.
  const cfContact = {
    email,
    firstName: first || null,
    lastName: last || null,
    phone: payload.phone
  };

  // First save of this email today (often email alone).
  if (sent?.deduped !== true) {
    startCfWrite(db, sent?.id || null, cfContact, who, deps);
    return { ok: true, actor: who.actor, saved: true };
  }

  // Same email already saved today. Merge what was typed since into that row:
  // the phone fills in when the row has none (it only ever arrives whole), the
  // name takes the latest non-empty value (it can arrive a few letters at a
  // time). Nothing new → nothing written, nothing sent to ClickFunnels.
  const orgId = deps.orgId || (await (deps.defaultOrgId || defaultOrgId)(db));
  const existing = await db.query(
    `SELECT id, payload FROM events
     WHERE org_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [orgId, idempotencyKey]
  );
  const row = existing.rows[0];
  const prev = row?.payload && typeof row.payload === "object" ? row.payload : null;
  if (!row || !prev) return { ok: true, actor: who.actor, saved: false };

  const patch = {};
  if (payload.phone && !prev.phone) patch.phone = payload.phone;
  if (payload.name && payload.name !== prev.name) patch.name = payload.name;
  if (!Object.keys(patch).length) return { ok: true, actor: who.actor, saved: false };

  // Patch only the changed keys, so a ClickFunnels result written at the same
  // moment (cf_contact) is not overwritten by this older copy of the row.
  await db.query(`UPDATE events SET payload = payload || $1::jsonb WHERE id = $2`, [patch, row.id]);
  const merged = { ...prev, ...patch };

  // Phone just arrived — start the follow-up now with it.
  if (patch.phone) {
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
  }

  startCfWrite(db, row.id, { ...cfContact, phone: merged.phone || null }, who, deps);
  return { ok: true, actor: who.actor, saved: true };
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
    let cfWrite = null;
    const result = await recordInterest(readBody(req), {
      ...deps,
      userAgent: deps.userAgent || header(req, "user-agent"),
      onCfWrite: (job) => {
        cfWrite = job;
        if (typeof deps.onCfWrite === "function") deps.onCfWrite(job);
      }
    });
    if (!result.ok) return res.status(400).json(result);
    // The answer is settled before ClickFunnels is waited on, and the wait is
    // capped. A ClickFunnels failure is recorded on the row, never returned.
    res.status(200).json(result);
    await settleWithin(cfWrite, deps.cfWaitMs ?? CF_WAIT_MS);
    return;
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
