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
  assert.equal(cap.events[0].opts.skipInngest, true);
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

test("POST from the sales page saves the contact", async () => {
  const cap = capture();
  const res = fakeRes();
  await handler({
    method: "POST",
    headers: { origin: "https://apply.fundhub.ai", "user-agent": "Mozilla/5.0" },
    body: { kind: "contact", email: "buyer@gmail.com", first_name: "Bo" }
  }, res, { emit: cap.emit, now: new Date("2026-09-27T18:00:00Z") });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.actor, "person");
  assert.equal(cap.events[0].name, "slo.contact_started");
});
