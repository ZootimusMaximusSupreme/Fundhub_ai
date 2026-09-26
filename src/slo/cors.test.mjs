// Cross-site rules for the /roadmap widget doors (src/slo/cors.mjs), and the
// preflight answer on each of the four handlers.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLO_WIDGET_ORIGINS,
  answerPreflight,
  sloCorsHeaders,
  sloReturnUrl
} from "./cors.mjs";
import checkout from "../../api/public/slo-checkout.mjs";
import pull from "../../api/public/slo-pull.mjs";
import status from "../../api/public/slo-status.mjs";
import repair from "../../api/public/slo-repair-checkout.mjs";

function fakeRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const NO_DB = { query: async () => { throw new Error("a preflight must not touch the database"); } };

test("the widget's origin is on the list; the headers echo it, never '*'", () => {
  assert.ok(SLO_WIDGET_ORIGINS.includes("https://apply.fundhub.ai"));
  const h = sloCorsHeaders("https://apply.fundhub.ai");
  assert.equal(h["Access-Control-Allow-Origin"], "https://apply.fundhub.ai");
  assert.equal(h.Vary, "Origin");
  assert.match(h["Access-Control-Allow-Headers"], /content-type/);
  assert.equal(h["Access-Control-Allow-Credentials"], undefined);
  for (const o of SLO_WIDGET_ORIGINS) {
    assert.notEqual(sloCorsHeaders(o)["Access-Control-Allow-Origin"], "*");
  }
});

test("an origin off the list gets no cross-site headers at all", () => {
  assert.deepEqual(sloCorsHeaders("https://evil.example"), {});
  assert.deepEqual(sloCorsHeaders("http://apply.fundhub.ai"), {});
  assert.deepEqual(sloCorsHeaders("https://apply.fundhub.ai.evil.example"), {});
  assert.deepEqual(sloCorsHeaders(""), {});
  assert.deepEqual(sloCorsHeaders(undefined), {});
});

test("answerPreflight only answers OPTIONS", () => {
  const res = fakeRes();
  assert.equal(answerPreflight({ method: "GET" }, res, "GET, OPTIONS"), false);
  assert.equal(res.statusCode, null);
  assert.equal(answerPreflight({ method: "OPTIONS" }, res, "GET, OPTIONS"), true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.allow, "GET, OPTIONS");
});

for (const [name, handler, methods] of [
  ["slo-checkout", checkout, "GET, POST, OPTIONS"],
  ["slo-pull", pull, "POST, OPTIONS"],
  ["slo-status", status, "GET, OPTIONS"],
  ["slo-repair-checkout", repair, "POST, OPTIONS"]
]) {
  test(`${name}: OPTIONS from the widget is answered with its origin, and reads nothing`, async () => {
    const res = fakeRes();
    await handler(
      { method: "OPTIONS", headers: { origin: "https://apply.fundhub.ai" } },
      res,
      { db: NO_DB }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["access-control-allow-origin"], "https://apply.fundhub.ai");
    assert.equal(res.headers["access-control-allow-methods"], methods);
  });

  test(`${name}: a stranger origin gets no Allow-Origin header`, async () => {
    const res = fakeRes();
    await handler(
      { method: "OPTIONS", headers: { origin: "https://evil.example" } },
      res,
      { db: NO_DB }
    );
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
}

test("return_url: https on an allow-listed origin only; query dropped, and every fragment but #fhw", () => {
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap"), "https://apply.fundhub.ai/roadmap");
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap?x=1#top"), "https://apply.fundhub.ai/roadmap");
  assert.equal(sloReturnUrl("http://apply.fundhub.ai/roadmap"), null);
  assert.equal(sloReturnUrl("https://evil.example/roadmap"), null);
  assert.equal(sloReturnUrl("https://user:pw@apply.fundhub.ai/"), null);
  assert.equal(sloReturnUrl("javascript:alert(1)"), null);
  assert.equal(sloReturnUrl(""), null);
  assert.equal(sloReturnUrl(null), null);
});

/* #fhw is the checkout widget's id. It is the one fragment that survives, so
   the payer lands on the checkout box and not at the top of the sales page. */
test("return_url: #fhw survives; the query string still does not", () => {
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap/#fhw"), "https://apply.fundhub.ai/roadmap/#fhw");
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap/?x=1#fhw"), "https://apply.fundhub.ai/roadmap/#fhw");
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap?x=1#fhw"), "https://apply.fundhub.ai/roadmap#fhw");
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap/#fhw-other"), "https://apply.fundhub.ai/roadmap/");
  assert.equal(sloReturnUrl("https://apply.fundhub.ai/roadmap/#FHW"), "https://apply.fundhub.ai/roadmap/");
});
