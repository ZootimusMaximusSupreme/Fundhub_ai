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
