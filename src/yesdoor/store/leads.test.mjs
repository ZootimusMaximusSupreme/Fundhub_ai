// How a lead's first touch is read from what the visitor brought. Pure: the
// broker lookup is a fake. The database half (first touch written once, locked by
// trigger) is src/http/yesdoor-prescreen.pg.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cleanText, requireEmail, resolveSource } from "./leads.mjs";

/** A db that knows one broker code, and records what it was asked. */
function fakeDb(known = {}) {
  const asked = [];
  return {
    asked,
    query: async (sql, params) => {
      asked.push(params);
      const hit = known[String(params[1]).toLowerCase()];
      return { rows: hit ? [{ id: hit }] : [] };
    }
  };
}

const ORG = "org-1";

describe("resolveSource", () => {
  test("an active broker's code wins: kind broker, with the broker id", async () => {
    const db = fakeDb({ "yd-123456": "broker-1" });
    const s = await resolveSource(db, { orgId: ORG, source: { kind: "ad", adId: "43-x", brokerCode: "YD-123456" } });
    assert.deepEqual(s, { kind: "broker", adId: "43-x", brokerId: "broker-1" });
    assert.equal(db.asked[0][0], ORG, "the broker is looked up inside this company only");
  });

  test("a code that matches no active broker is ignored: the stated kind stands", async () => {
    const db = fakeDb({});
    assert.deepEqual(await resolveSource(db, { orgId: ORG, source: { kind: "organic", brokerCode: "YD-000000" } }),
      { kind: "organic", adId: null, brokerId: null });
  });

  test("kind broker with no valid code becomes direct (the database would refuse it)", async () => {
    const db = fakeDb({});
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "broker" } })).kind, "direct");
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "broker", brokerCode: "nope" } })).kind, "direct");
  });

  test("an ad with an id keeps it; an ad with no id is direct", async () => {
    const db = fakeDb({});
    assert.deepEqual(await resolveSource(db, { orgId: ORG, source: { kind: "ad", adId: "  87  " } }),
      { kind: "ad", adId: "87", brokerId: null });
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "ad" } })).kind, "direct");
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "ad", adId: "   " } })).kind, "direct");
  });

  test("an ad id is clipped, and only an ad carries one", async () => {
    const db = fakeDb({});
    const s = await resolveSource(db, { orgId: ORG, source: { kind: "ad", adId: "9".repeat(200) } });
    assert.equal(s.adId.length, 64);
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "referral", adId: "43" } })).adId, null);
  });

  test("unknown kinds, a missing source, or junk all fall back to direct and never throw", async () => {
    const db = fakeDb({});
    for (const source of [undefined, null, "ad", 5, [], {}, { kind: "admin" }, { kind: ["ad"] }, { brokerCode: 12345 }]) {
      const s = await resolveSource(db, { orgId: ORG, source });
      assert.deepEqual(s, { kind: "direct", adId: null, brokerId: null }, JSON.stringify(source));
    }
  });

  test("organic and referral are accepted as stated", async () => {
    const db = fakeDb({});
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "organic" } })).kind, "organic");
    assert.equal((await resolveSource(db, { orgId: ORG, source: { kind: "referral" } })).kind, "referral");
  });
});

describe("small input helpers", () => {
  test("requireEmail lower-cases and trims, and refuses what is not an email", () => {
    assert.equal(requireEmail("  Rita@Example.TEST "), "rita@example.test");
    for (const bad of [undefined, null, "", "   ", "no-at-sign", "a@b", "a b@c.d", 42, {}]) {
      assert.throws(() => requireEmail(bad), (e) => e.status === 400 && e.code === "email_required", String(bad));
    }
    assert.throws(() => requireEmail(`${"a".repeat(250)}@example.test`), (e) => e.code === "email_required");
  });

  test("cleanText trims, clips, and turns empty or non-text into null", () => {
    assert.equal(cleanText("  hi  ", 10), "hi");
    assert.equal(cleanText("abcdef", 3), "abc");
    for (const v of ["", "   ", null, undefined, 5, {}]) assert.equal(cleanText(v, 10), null);
  });
});
