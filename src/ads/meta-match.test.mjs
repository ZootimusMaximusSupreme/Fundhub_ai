// src/ads/meta-match.test.mjs — fbc / fbp kept for a later server Purchase.
// PURE UNIT TEST, NO DATABASE.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanFbclid,
  clientMetaClickIds,
  fbcFromFbclid,
  fbclidFromUrl,
  pickMetaClickIds,
  storeClientMetaClickIds
} from "./meta-match.mjs";

const FBC = "fb.1.1727800000000.IwAR2abcDEF_123-xyz";
const FBP = "fb.1.1727800000000.1234567890";

test("fbclid → fbc in Meta's own format, junk refused", () => {
  assert.equal(fbcFromFbclid("IwAR2abc_DEF-1", 1727800000123), "fb.1.1727800000123.IwAR2abc_DEF-1");
  assert.equal(fbcFromFbclid("has space", 1727800000123), null);
  assert.equal(fbcFromFbclid("<script>", 1727800000123), null);
  assert.equal(fbcFromFbclid("", 1727800000123), null);
  assert.equal(cleanFbclid("a@b.com"), null, "an email can never ride in as a click id");
});

test("fbclid off a landing URL", () => {
  assert.equal(fbclidFromUrl("https://apply.fundhub.ai/watch?utm_source=fb&fbclid=IwAR2abc"), "IwAR2abc");
  assert.equal(fbclidFromUrl("/roadmap?fbclid=IwZX_9-z"), "IwZX_9-z");
  assert.equal(fbclidFromUrl("https://apply.fundhub.ai/watch"), null);
  assert.equal(fbclidFromUrl(null), null);
});

test("pickMetaClickIds: first clean value per key; fbc built from fbclid only when no fbc was sent", () => {
  assert.deepEqual(pickMetaClickIds([{ fbc: "junk" }, { fbc: FBC, fbp: FBP }]), { fbc: FBC, fbp: FBP });
  assert.deepEqual(pickMetaClickIds([{ fbclid: "IwAR9" }], { seenAtMs: 1727800000000 }), { fbc: "fb.1.1727800000000.IwAR9", fbp: null });
  assert.deepEqual(pickMetaClickIds([{ fbc: FBC, fbclid: "IwAR9" }]), { fbc: FBC, fbp: null });
  assert.deepEqual(
    pickMetaClickIds([{}], { fbclidUrl: "https://x.test/?fbclid=IwAR7", seenAtMs: 1727800000001 }),
    { fbc: "fb.1.1727800000001.IwAR7", fbp: null }
  );
  assert.deepEqual(pickMetaClickIds([null, "x", [1], { email: "a@b.co" }]), { fbc: null, fbp: null });
});

test("storeClientMetaClickIds fills blanks only, org-bound, and writes nothing when there is nothing", async () => {
  const calls = [];
  const db = { async query(sql, params) { calls.push({ sql: String(sql), params }); return { rows: [{ id: params[0] }] }; } };
  assert.equal(await storeClientMetaClickIds(db, { orgId: "o", clientId: "c" }), false);
  assert.equal(await storeClientMetaClickIds(db, { orgId: "o", clientId: "c", fbc: "junk" }), false);
  assert.equal(calls.length, 0);
  assert.equal(await storeClientMetaClickIds(db, { orgId: "o", clientId: "c", fbc: FBC, fbp: FBP }), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["c", "o", FBC, FBP]);
  assert.match(calls[0].sql, /WHERE id = \$1::uuid AND org_id = \$2::uuid/);
  // First touch: each key is written only when the stored one is blank.
  assert.match(calls[0].sql, /CASE WHEN COALESCE\(custom_fields->>'meta_fbc', ''\) = '' THEN \$3::text END/);
  assert.match(calls[0].sql, /CASE WHEN COALESCE\(custom_fields->>'meta_fbp', ''\) = '' THEN \$4::text END/);
  assert.match(calls[0].sql, /jsonb_strip_nulls/);
});

test("clientMetaClickIds reads clean values only", () => {
  assert.deepEqual(clientMetaClickIds({ meta_fbc: FBC, meta_fbp: FBP }), { fbc: FBC, fbp: FBP });
  assert.deepEqual(clientMetaClickIds({ meta_fbc: "x" }), { fbc: null, fbp: null });
  assert.deepEqual(clientMetaClickIds(null), { fbc: null, fbp: null });
});
