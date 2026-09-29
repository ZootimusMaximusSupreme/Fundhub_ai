import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { recordInterest } from "../../api/public/slo-interest.mjs";

function fakeRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function capture() {
  const events = [];
  return {
    events,
    async emit(_db, name, payload, opts) {
      events.push({ name, payload, opts });
      return { id: "evt-1", deduped: false };
    }
  };
}

test("a step-1 email is saved with no client and no card", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "contact",
    email: "Pat@Gmail.com",
    first_name: "Pat",
    last_name: "Lee",
    phone: "(415) 555-0134",
    session_id: "abcdefghij123456",
    landing_path: "/roadmap/",
    utm_source: "fb_ad",
    utm_content: "oVid: SLO3"
  }, { emit: cap.emit, userAgent: "Mozilla/5.0", now: new Date("2026-09-27T18:00:00Z") });

  assert.equal(out.ok, true);
  assert.equal(out.actor, "person");
  assert.equal(out.saved, true);
  assert.equal(cap.events.length, 1);
  assert.equal(cap.events[0].name, "slo.contact_started");
  assert.equal(cap.events[0].opts.skipInngest, false,
    "a real contact must reach Inngest for the genuine follow-up");
  assert.equal(cap.events[0].opts.idempotencyKey, "slo-contact:pat@gmail.com:2026-09-27");
  assert.equal(cap.events[0].payload.email, "pat@gmail.com");
  assert.equal(cap.events[0].payload.name, "Pat Lee");
  assert.equal(cap.events[0].payload.phone, "+14155550134");
  assert.equal(cap.events[0].payload.actor, "person");
  assert.equal(cap.events[0].payload.attribution.utm_source, "fb_ad");
  assert.equal(cap.events[0].payload.client_id, undefined);
});

test("a company email on step 1 is marked an agent", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "contact",
    email: "sam@fundhub.ai",
    first_name: "Sam"
  }, { emit: cap.emit, userAgent: "Mozilla/5.0 (Macintosh)", now: new Date("2026-09-27T18:00:00Z") });
  assert.equal(out.actor, "agent");
  assert.equal(cap.events[0].payload.actor_reason, "company_email");
});

test("a page open from an automated browser is an agent visit", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "visit",
    session_id: "session-12345678",
    landing_path: "/roadmap/",
    webdriver: true
  }, { emit: cap.emit, userAgent: "Mozilla/5.0" });
  assert.equal(out.actor, "agent");
  assert.equal(cap.events[0].name, "slo.visit");
  assert.equal(cap.events[0].opts.idempotencyKey, "slo-visit:session-12345678");
  assert.equal(cap.events[0].opts.skipInngest, true, "visits stay local-only");
  assert.equal(cap.events[0].payload.email, undefined);
});

test("a contact without an email is refused", async () => {
  const out = await recordInterest({ kind: "contact", first_name: "Pat" }, { emit: async () => { throw new Error("no"); } });
  assert.equal(out.ok, false);
  assert.equal(out.error, "email_required");
});

test("GET writes nothing", async () => {
  const res = fakeRes();
  await handler({ method: "GET", headers: { origin: "https://apply.fundhub.ai" } }, res, {
    db: { query: async () => { throw new Error("GET must not touch the database"); } }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.headers["access-control-allow-origin"], "https://apply.fundhub.ai");
});

test("a contact without a phone is saved but does not start the follow-up", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "contact",
    email: "early@gmail.com",
    first_name: "Early"
  }, { emit: cap.emit, userAgent: "Mozilla/5.0", now: new Date("2026-09-27T18:00:00Z") });
  assert.equal(out.ok, true);
  assert.equal(cap.events[0].payload.phone, null);
  assert.equal(cap.events[0].opts.skipInngest, true,
    "no phone yet — do not start the 15-minute text job");
});

test("a later phone on the same email upgrades the row and starts follow-up", async () => {
  const row = {
    id: "evt-contact-1",
    payload: {
      actor: "person",
      actor_reason: "browser",
      email: "later@gmail.com",
      name: "Later Buyer",
      phone: null
    }
  };
  const updates = [];
  const fanouts = [];
  const db = {
    async query(sql, params) {
      if (/SELECT id, payload FROM events/.test(sql)) return { rows: [row] };
      if (/UPDATE events SET payload/.test(sql)) {
        updates.push(params[0]);
        row.payload = params[0];
        return { rows: [{ id: row.id }] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
  const out = await recordInterest({
    kind: "contact",
    email: "later@gmail.com",
    first_name: "Later",
    last_name: "Buyer",
    phone: "4155550199"
  }, {
    db,
    orgId: "org-contact",
    userAgent: "Mozilla/5.0",
    now: new Date("2026-09-27T18:00:00Z"),
    emit: async () => ({ id: null, deduped: true }),
    fanout: async (job) => { fanouts.push(job); }
  });
  assert.equal(out.ok, true);
  assert.equal(out.saved, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].phone, "+14155550199");
  assert.equal(fanouts.length, 1);
  assert.equal(fanouts[0].name, "slo.contact_started");
  assert.equal(fanouts[0].payload.phone, "+14155550199");
});

test("POST from the sales page saves the contact", async () => {
  const cap = capture();
  const res = fakeRes();
  await handler({
    method: "POST",
    headers: { origin: "https://apply.fundhub.ai", "user-agent": "Mozilla/5.0" },
    body: { kind: "contact", email: "buyer@gmail.com", first_name: "Bo", phone: "4155550100" }
  }, res, { emit: cap.emit, now: new Date("2026-09-27T18:00:00Z") });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.actor, "person");
  assert.equal(cap.events[0].name, "slo.contact_started");
  assert.equal(cap.events[0].opts.skipInngest, false);
});

test("engage stores seconds and whether the form was reached", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "engage",
    session_id: "engage-session-01",
    seconds_on_page: 47,
    reached_form: true,
    landing_path: "/roadmap/",
    utm_source: "fb"
  }, {
    emit: cap.emit,
    userAgent: "Mozilla/5.0",
    orgId: "org-engage",
    db: { query: async () => ({ rows: [] }) }
  });
  assert.equal(out.ok, true);
  assert.equal(out.actor, "person");
  assert.equal(out.saved, true);
  assert.equal(cap.events.length, 1);
  assert.equal(cap.events[0].name, "slo.engagement");
  assert.equal(cap.events[0].opts.idempotencyKey, "slo-engage:engage-session-01");
  assert.equal(cap.events[0].opts.skipInngest, true);
  assert.equal(cap.events[0].payload.seconds_on_page, 47);
  assert.equal(cap.events[0].payload.reached_form, true);
  assert.equal(cap.events[0].payload.session_id, "engage-session-01");
  assert.equal(cap.events[0].payload.actor, "person");
  assert.equal(cap.events[0].payload.attribution.utm_source, "fb");
  assert.equal(cap.events[0].payload.client_id, undefined);
  assert.equal(cap.events[0].payload.email, undefined);
});

test("engage keeps one row and raises seconds / form reach on update", async () => {
  const row = {
    id: "evt-engage-1",
    payload: {
      actor: "person",
      actor_reason: "browser",
      session_id: "engage-session-02",
      seconds_on_page: 30,
      reached_form: false,
      landing_path: "/roadmap/"
    }
  };
  const updates = [];
  const db = {
    async query(sql, params) {
      if (/SELECT id, payload FROM events/.test(sql)) return { rows: [row] };
      if (/UPDATE events SET payload/.test(sql)) {
        updates.push(params[0]);
        row.payload = params[0];
        return { rows: [{ id: row.id }] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
  const out = await recordInterest({
    kind: "engage",
    session_id: "engage-session-02",
    seconds_on_page: 90,
    reached_form: true,
    webdriver: false
  }, {
    db,
    orgId: "org-engage",
    userAgent: "Mozilla/5.0",
    emit: async () => { throw new Error("must update, not insert"); }
  });
  assert.equal(out.ok, true);
  assert.equal(out.saved, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].seconds_on_page, 90);
  assert.equal(updates[0].reached_form, true);
});

test("engage from an automated browser is an agent", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "engage",
    session_id: "engage-bot-12345",
    seconds_on_page: 12,
    reached_form: false,
    webdriver: true
  }, {
    emit: cap.emit,
    userAgent: "Mozilla/5.0",
    orgId: "org-engage",
    db: { query: async () => ({ rows: [] }) }
  });
  assert.equal(out.actor, "agent");
  assert.equal(cap.events[0].payload.actor_reason, "automated_browser");
  assert.equal(cap.events[0].payload.reached_form, false);
  assert.equal(cap.events[0].payload.seconds_on_page, 12);
});

test("engage without a session is refused", async () => {
  const out = await recordInterest({
    kind: "engage",
    seconds_on_page: 5,
    reached_form: false
  }, { emit: async () => { throw new Error("no"); } });
  assert.equal(out.ok, false);
  assert.equal(out.error, "session_invalid");
});
