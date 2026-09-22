import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/public/slo-pull.mjs";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REF = "slo_0123456789abcdef01234567";

function fakeRes() {
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

test("GET on slo-pull is 405", async () => {
  const res = fakeRes();
  await handler({ method: "GET", headers: {} }, res, { db: { query: async () => ({ rows: [] }) } });
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.ok, false);
});

test("POST without the matching ref is not_found, never a guessed person", async () => {
  const res = fakeRes();
  await handler({
    method: "POST",
    headers: {},
    body: {
      ref: REF,
      client_id: CLIENT,
      first_name: "Ada",
      last_name: "Byron",
      dob: "1990-01-02",
      ssn: "987654321",
      address: "100 Test Ave",
      city: "Denton",
      state: "TX",
      zip: "76205",
      consent: true
    }
  }, res, {
    db: { query: async () => ({ rows: [] }) },
    emit: async () => { throw new Error("must not emit"); }
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "not_found");
  assert.equal(JSON.stringify(res.body).includes("987654321"), false);
});

/* Owner-set 2026-09-22: "make it work but no soft pull". With demo on, the form
   is checked, then NOTHING is written and no pull runs; the widget goes to booking. */
test("DEMO: a valid submit writes nothing, runs no pull, and answers next:'book'", async () => {
  const res = fakeRes();
  const touched = [];
  const trap = (name) => async () => { touched.push(name); throw new Error(`${name} must not run in demo`); };
  await handler({
    method: "POST", headers: {},
    body: {
      ref: REF, client_id: CLIENT, first_name: "Ada", last_name: "Byron", dob: "1990-01-02",
      ssn: "987654321", address: "100 Test Ave", city: "Denton", state: "TX", zip: "76205", consent: true
    }
  }, res, {
    demo: true,
    db: { query: trap("db.query") },
    findOrder: trap("findOrder"), storeIdentity: trap("storeIdentity"), captureConsent: trap("captureConsent"),
    emit: trap("emit"), startDemoPull: trap("startDemoPull"), stampSlo: trap("stampSlo"),
    checkAddresses: async () => []
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.next, "book");
  assert.equal(res.body.pull_requested, false);
  assert.equal(res.body.stored, false);
  assert.equal(res.body.book_url, "https://apply.fundhub.ai/roadmap-book");
  assert.deepEqual(touched, []);
  assert.equal(JSON.stringify(res.body).includes("987654321"), false);
});

test("DEMO: an address the geocoder cannot find still gets the warning first", async () => {
  const res = fakeRes();
  await handler({
    method: "POST", headers: {},
    body: {
      ref: REF, client_id: CLIENT, first_name: "Ada", last_name: "Byron", dob: "1990-01-02",
      ssn: "987654321", address: "100 Nowhere Ave", city: "Denton", state: "TX", zip: "76205", consent: true
    }
  }, res, {
    demo: true,
    checkAddresses: async () => [{ field: "address", code: "address_unverified", message: "We couldn't find that address." }]
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, "address_unverified");
});

test("DEMO: bad fields are still refused by field", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: {}, body: { ref: REF, client_id: CLIENT, consent: true } }, res, { demo: true });
  assert.equal(res.statusCode >= 400, true);
  assert.equal(res.body.ok, false);
});
