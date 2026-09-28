import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  parseRb2bPayload,
  secretsMatch,
  storeRb2bVisitor
} from "../../api/public/rb2b-webhook.mjs";

const SECRET = "test-rb2b-secret-for-unit-tests";

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function samplePayload(overrides = {}) {
  return {
    "LinkedIn URL": "https://www.linkedin.com/in/retentionadam/",
    "First Name": "Adam",
    "Last Name": "Robinson",
    Title: "CEO @ Retention.com",
    "Company Name": "Retention.com",
    "Business Email": "adam@retention.com",
    Website: "https://retention.com",
    Industry: "Internet Technology & Services",
    "Employee Count": "1-10",
    "Estimate Revenue": "$22M rev",
    City: "Austin",
    State: "Texas",
    Zipcode: "73301",
    "Seen At": "2024-01-01T12:34:56.00+00:00",
    Referrer: "https://google.com",
    "Captured URL": "https://fundhub.ai/roadmap/",
    Tags: "Hot Page, Hot Lead",
    ...overrides
  };
}

function memoryDb(seed = []) {
  const rows = seed.map((r) => ({ ...r, payload: { ...r.payload } }));
  return {
    rows,
    async query(sql, params) {
      if (/SELECT id, payload FROM events/i.test(sql)) {
        const [, idem] = params;
        const hit = rows.find((r) => r.idempotency_key === idem);
        return { rows: hit ? [{ id: hit.id, payload: hit.payload }] : [] };
      }
      if (/UPDATE events SET payload/i.test(sql)) {
        const [payload, id] = params;
        const row = rows.find((r) => r.id === id);
        if (row) row.payload = payload;
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
}

test("parseRb2bPayload maps documented Title Case fields", () => {
  const out = parseRb2bPayload(samplePayload());
  assert.equal(out.ok, true);
  assert.equal(out.email, "adam@retention.com");
  assert.equal(out.name, "Adam Robinson");
  assert.equal(out.linkedin_url, "https://www.linkedin.com/in/retentionadam/");
  assert.equal(out.company, "Retention.com");
  assert.equal(out.job_title, "CEO @ Retention.com");
  assert.equal(out.page_url, "https://fundhub.ai/roadmap/");
  assert.ok(out.seen_at);
});

test("parseRb2bPayload skips company-only profiles with no email", () => {
  const out = parseRb2bPayload(
    samplePayload({ "Business Email": null, "First Name": "Acme" })
  );
  assert.equal(out.ok, false);
  assert.equal(out.skip, true);
  assert.equal(out.error, "email_missing");
});

test("parseRb2bPayload rejects junk", () => {
  assert.equal(parseRb2bPayload(null).error, "invalid_json");
  assert.equal(parseRb2bPayload({ foo: 1 }).error, "not_rb2b_payload");
});

test("secretsMatch accepts the right secret and rejects the wrong one", () => {
  assert.equal(secretsMatch(SECRET, SECRET), true);
  assert.equal(secretsMatch("nope", SECRET), false);
  assert.equal(secretsMatch(SECRET, ""), false);
});

test("storeRb2bVisitor inserts once then updates the same email row", async () => {
  const db = memoryDb();
  const emitted = [];
  const deps = {
    db,
    orgId: "org-1",
    async emit(_db, name, payload, opts) {
      emitted.push({ name, payload, opts });
      db.rows.push({
        id: "evt-1",
        idempotency_key: opts.idempotencyKey,
        payload: { ...payload }
      });
      return { id: "evt-1", deduped: false };
    }
  };

  const first = await storeRb2bVisitor(samplePayload(), deps);
  assert.equal(first.ok, true);
  assert.equal(first.saved, true);
  assert.equal(first.updated, false);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, "rb2b.visitor_identified");
  assert.equal(emitted[0].opts.skipInngest, true);
  assert.equal(emitted[0].opts.idempotencyKey, "rb2b:adam@retention.com");
  assert.equal(emitted[0].payload.email, "adam@retention.com");
  assert.equal(emitted[0].payload.page_url, "https://fundhub.ai/roadmap/");

  const second = await storeRb2bVisitor(
    samplePayload({
      "Captured URL": "https://fundhub.ai/optimize/",
      Title: "Founder",
      is_repeat_visit: true
    }),
    deps
  );
  assert.equal(second.ok, true);
  assert.equal(second.updated, true);
  assert.equal(emitted.length, 1, "second visit must not insert another event");
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].payload.page_url, "https://fundhub.ai/optimize/");
  assert.equal(db.rows[0].payload.job_title, "Founder");
  assert.equal(db.rows[0].payload.is_repeat_visit, true);
});

test("POST without secret is 401; with secret stores", async () => {
  const db = memoryDb();
  const deps = {
    secret: SECRET,
    db,
    orgId: "org-1",
    async emit(_db, name, payload, opts) {
      db.rows.push({
        id: "evt-2",
        idempotency_key: opts.idempotencyKey,
        payload: { ...payload }
      });
      return { id: "evt-2", deduped: false };
    }
  };

  const denied = fakeRes();
  await handler(
    { method: "POST", query: {}, body: samplePayload() },
    denied,
    deps
  );
  assert.equal(denied.statusCode, 401);

  const ok = fakeRes();
  await handler(
    {
      method: "POST",
      query: { secret: SECRET },
      body: samplePayload({ "Business Email": "Buyer@Example.com" })
    },
    ok,
    deps
  );
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.saved, true);
  assert.equal(db.rows[0].payload.email, "buyer@example.com");
});

test("GET is a no-write uptime door", async () => {
  const res = fakeRes();
  await handler({ method: "GET" }, res, { secret: SECRET });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, "rb2b-webhook");
});

test("POST with RB2B shape but no email returns 200 skipped", async () => {
  const res = fakeRes();
  await handler(
    {
      method: "POST",
      query: { secret: SECRET },
      body: samplePayload({ "Business Email": "" })
    },
    res,
    { secret: SECRET, db: memoryDb() }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.saved, false);
  assert.equal(res.body.skipped, "email_missing");
});
