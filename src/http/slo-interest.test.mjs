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

/* No test here ever reaches ClickFunnels or a real database. */
const noCf = async () => ({ ok: false, skipped: true, reason: "no_credentials" });
const quietDb = { query: async () => ({ rows: [] }) };

/* An events table that behaves like the real one for this door: one row per
   idempotency key, and UPDATE ... payload || $1 merges keys like jsonb does. */
function eventsTable() {
  const rows = [];
  let n = 0;
  return {
    rows,
    async emit(_db, name, payload, opts) {
      if (rows.some((r) => r.idempotency_key === opts.idempotencyKey)) return { id: null, deduped: true };
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      rows.push({ id, name, payload: structuredClone(payload), idempotency_key: opts.idempotencyKey, skipInngest: opts.skipInngest });
      return { id, deduped: false };
    },
    db: {
      async query(sql, params) {
        if (/SELECT id, payload FROM events/.test(sql)) {
          const row = rows.find((r) => r.idempotency_key === params[1]);
          return { rows: row ? [{ id: row.id, payload: structuredClone(row.payload) }] : [] };
        }
        if (/UPDATE events SET payload = payload \|\| \$1::jsonb WHERE id = \$2/.test(sql)) {
          const row = rows.find((r) => r.id === params[1]);
          if (row) Object.assign(row.payload, structuredClone(params[0]));
          return { rows: [] };
        }
        throw new Error(`unexpected sql: ${sql}`);
      }
    }
  };
}

/* ClickFunnels as its docs describe the upsert: one contact per email, and an
   empty value never clears a field. */
function fakeClickfunnels() {
  const contacts = new Map();
  const calls = [];
  return {
    contacts,
    calls,
    async syncCf(input) {
      calls.push(structuredClone(input));
      const key = String(input.email).toLowerCase();
      const prev = contacts.get(key) || { id: contacts.size + 1 };
      const next = { ...prev, email: key };
      for (const k of ["firstName", "lastName", "phone"]) if (input[k]) next[k] = input[k];
      contacts.set(key, next);
      return { ok: true, id: next.id };
    }
  };
}

function contactDeps(table, cf, extra = {}) {
  const jobs = [];
  return {
    jobs,
    deps: {
      db: table.db,
      emit: table.emit,
      orgId: "org-contact",
      userAgent: "Mozilla/5.0",
      now: new Date("2026-10-01T18:00:00Z"),
      syncCf: cf.syncCf,
      fanout: extra.fanout || (async () => {}),
      onCfWrite: (job) => { jobs.push(job); },
      ...extra
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
  }, { emit: cap.emit, db: quietDb, syncCf: noCf, userAgent: "Mozilla/5.0", now: new Date("2026-09-27T18:00:00Z") });

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

test("a contact without a phone is saved and still starts the follow-up", async () => {
  const cap = capture();
  const out = await recordInterest({
    kind: "contact",
    email: "early@gmail.com",
    first_name: "Early"
  }, { emit: cap.emit, db: quietDb, syncCf: noCf, userAgent: "Mozilla/5.0", now: new Date("2026-09-27T18:00:00Z") });
  assert.equal(out.ok, true);
  assert.equal(cap.events[0].payload.phone, null);
  assert.equal(cap.events[0].opts.skipInngest, false,
    "email-only contact still starts the 15-minute follow-up for email");
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
        row.payload = { ...row.payload, ...params[0] };
        return { rows: [{ id: row.id }] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
  const jobs = [];
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
    fanout: async (job) => { fanouts.push(job); },
    syncCf: noCf,
    onCfWrite: (job) => { jobs.push(job); }
  });
  await Promise.all(jobs);
  assert.equal(out.ok, true);
  assert.equal(out.saved, true);
  const merges = updates.filter((u) => !("cf_contact" in u));
  assert.equal(merges.length, 1);
  assert.equal(merges[0].phone, "+14155550199");
  assert.equal(row.payload.phone, "+14155550199");
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
  }, res, { emit: cap.emit, db: quietDb, syncCf: noCf, now: new Date("2026-09-27T18:00:00Z") });
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

// ── Step 1 saves on a valid email alone; phone and name merge in later ──────

test("email alone saves the row and starts the same ClickFunnels contact", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const { deps, jobs } = contactDeps(table, cf);
  const out = await recordInterest({ kind: "contact", email: " Pat@Gmail.com " }, deps);
  await Promise.all(jobs);

  assert.deepEqual(out, { ok: true, actor: "person", saved: true });
  assert.equal(table.rows.length, 1);
  const row = table.rows[0];
  assert.equal(row.name, "slo.contact_started");
  assert.equal(row.idempotency_key, "slo-contact:pat@gmail.com:2026-10-01");
  assert.equal(row.skipInngest, false, "email-only still starts the follow-up (email now, text when a phone lands)");
  assert.equal(row.payload.email, "pat@gmail.com");
  assert.equal(row.payload.phone, null);
  assert.equal(row.payload.name, null);
  assert.deepEqual(cf.calls, [{ email: "pat@gmail.com", firstName: null, lastName: null, phone: null }]);
  assert.equal(row.payload.cf_contact.ok, true);
  assert.equal(row.payload.cf_contact.contact_id, 1);
});

test("a phone and name typed later merge into the same row and the same ClickFunnels contact", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const fanouts = [];
  const { deps, jobs } = contactDeps(table, cf, { fanout: async (j) => { fanouts.push(j); } });

  await recordInterest({ kind: "contact", email: "pat@gmail.com" }, deps);
  const second = await recordInterest({
    kind: "contact", email: "pat@gmail.com", first_name: "Pat", last_name: "Lee", phone: "4155550134"
  }, deps);
  await Promise.all(jobs);

  assert.equal(second.saved, true);
  assert.equal(table.rows.length, 1, "one row per email per day");
  const p = table.rows[0].payload;
  assert.equal(p.phone, "+14155550134");
  assert.equal(p.name, "Pat Lee");
  assert.equal(p.email, "pat@gmail.com");
  assert.equal(fanouts.length, 1, "the phone arriving starts the follow-up with the phone");
  assert.equal(fanouts[0].id, table.rows[0].id);
  assert.equal(fanouts[0].payload.phone, "+14155550134");

  assert.equal(cf.calls.length, 2);
  assert.ok(cf.calls.every((c) => c.email === "pat@gmail.com"), "every write is keyed on the same email");
  assert.equal(cf.contacts.size, 1, "no second ClickFunnels contact");
  assert.deepEqual(cf.contacts.get("pat@gmail.com"),
    { id: 1, email: "pat@gmail.com", firstName: "Pat", lastName: "Lee", phone: "+14155550134" });
});

test("the same contact posted again writes nothing and calls ClickFunnels once", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const { deps, jobs } = contactDeps(table, cf);
  const body = { kind: "contact", email: "pat@gmail.com", first_name: "Pat", phone: "4155550134" };
  await recordInterest(body, deps);
  const again = await recordInterest(body, deps);
  await Promise.all(jobs);
  assert.equal(again.saved, false);
  assert.equal(cf.calls.length, 1);
});

test("a name typed after the email updates the row without restarting the follow-up", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const fanouts = [];
  const { deps, jobs } = contactDeps(table, cf, { fanout: async (j) => { fanouts.push(j); } });
  await recordInterest({ kind: "contact", email: "pat@gmail.com", first_name: "Pa" }, deps);
  const out = await recordInterest({ kind: "contact", email: "pat@gmail.com", first_name: "Pat", last_name: "Lee" }, deps);
  await Promise.all(jobs);
  assert.equal(out.saved, true);
  assert.equal(table.rows[0].payload.name, "Pat Lee", "latest name wins");
  assert.equal(fanouts.length, 0);
  assert.equal(cf.contacts.get("pat@gmail.com").lastName, "Lee");
});

test("a phone already on the row is not replaced by a later post", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const fanouts = [];
  const { deps, jobs } = contactDeps(table, cf, { fanout: async (j) => { fanouts.push(j); } });
  await recordInterest({ kind: "contact", email: "pat@gmail.com", phone: "4155550134" }, deps);
  const out = await recordInterest({ kind: "contact", email: "pat@gmail.com", phone: "4155550999" }, deps);
  await Promise.all(jobs);
  assert.equal(out.saved, false);
  assert.equal(table.rows[0].payload.phone, "+14155550134");
  assert.equal(fanouts.length, 0);
  assert.equal(cf.calls.length, 1);
});

test("agents and test emails are saved as agents and never reach ClickFunnels", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const { deps, jobs } = contactDeps(table, cf);
  await recordInterest({ kind: "contact", email: "sam@fundhub.ai", phone: "4155550134" }, deps);
  await recordInterest({ kind: "contact", email: "e2e+sim@gmail.com" }, deps);
  await recordInterest({ kind: "contact", email: "pat@gmail.com", webdriver: true }, deps);
  await recordInterest({ kind: "contact", email: "bot@gmail.com" }, { ...deps, userAgent: "HeadlessChrome/120" });
  await Promise.all(jobs);
  assert.equal(table.rows.length, 4);
  assert.ok(table.rows.every((r) => r.payload.actor === "agent"));
  assert.equal(cf.calls.length, 0);
  assert.equal(jobs.length, 0);
});

test("the server refuses an email that is not a real address, and saves nothing", async () => {
  const table = eventsTable();
  const cf = fakeClickfunnels();
  const { deps } = contactDeps(table, cf);
  const bad = [
    "", "pat", "pat@gmail", "pat@gmail.c", "pat@@gmail.com", "pat@gmail..com", "pat@-gmail.com",
    "pat @gmail.com", "<script>@gmail.com", "pat@gmail.com>", "pat@gmail.123",
    `${"a".repeat(150)}@gmail.com`, `${"a".repeat(65)}@gmail.com`
  ];
  for (const email of bad) {
    const out = await recordInterest({ kind: "contact", email }, deps);
    assert.deepEqual(out, { ok: false, error: "email_required" }, JSON.stringify(email));
  }
  assert.equal(table.rows.length, 0);
  assert.equal(cf.calls.length, 0);
  for (const email of ["pat.lee+roadmap@gmail.com", "o'neil@sub.example.co.uk", "pat@xn--80ak6aa92e.xn--p1ai"]) {
    const out = await recordInterest({ kind: "contact", email }, deps);
    assert.equal(out.ok, true, email);
  }
});

test("ClickFunnels refusing does not fail the answer, and the refusal is recorded on the row", async () => {
  const table = eventsTable();
  const res = fakeRes();
  await handler({
    method: "POST",
    headers: { origin: "https://apply.fundhub.ai", "user-agent": "Mozilla/5.0" },
    body: { kind: "contact", email: "pat@gmail.com" }
  }, res, {
    db: table.db,
    emit: table.emit,
    orgId: "org-contact",
    syncCf: async () => ({ ok: false, error: "clickfunnels_refused", status: 422, message: "Email address is invalid" })
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, actor: "person", saved: true });
  assert.deepEqual(
    { ...table.rows[0].payload.cf_contact, at: "x" },
    { ok: false, error: "clickfunnels_refused", status: 422, message: "Email address is invalid", at: "x" }
  );
});

test("ClickFunnels throwing does not fail the answer either", async () => {
  const table = eventsTable();
  const res = fakeRes();
  await handler({
    method: "POST",
    headers: { "user-agent": "Mozilla/5.0" },
    body: JSON.stringify({ kind: "contact", email: "pat@gmail.com" })
  }, res, {
    db: table.db, emit: table.emit, orgId: "org-contact",
    syncCf: async () => { throw new Error("socket hang up"); }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.saved, true);
  assert.equal(table.rows[0].payload.cf_contact.ok, false);
  assert.equal(table.rows[0].payload.cf_contact.error, "clickfunnels_threw");
});

test("a slow ClickFunnels never holds the answer past the cap", async () => {
  const table = eventsTable();
  const res = fakeRes();
  let release;
  const started = Date.now();
  await handler({
    method: "POST",
    headers: { "user-agent": "Mozilla/5.0" },
    body: { kind: "contact", email: "pat@gmail.com" }
  }, res, {
    db: table.db, emit: table.emit, orgId: "org-contact",
    cfWaitMs: 30,
    syncCf: () => new Promise((r) => { release = r; })
  });
  assert.ok(Date.now() - started < 1000);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.saved, true);
  assert.equal(table.rows[0].payload.cf_contact, undefined, "still running, nothing recorded yet");
  release({ ok: true, id: 7 });
});
