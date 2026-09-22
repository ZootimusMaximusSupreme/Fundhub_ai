// The Submagic webhook door: POST /api/webhooks/submagic
//
// NO ROUTES ENTRY, on purpose. netlify/functions/api.mjs routes `webhooks/` by
// PREFIX and src/http/routes.test.mjs fails if anybody adds a `webhooks/…` key
// to that map, so this door depends on no lookup ordering at all. The first
// test below pins that.
//
// THE PAYLOAD IS NOT EVIDENCE. Submagic documents no signature on this webhook
// (docs/specs/video-pipeline-api-verification-2026-09-22.md), so the body
// arrives unauthenticated from the open internet. Every test here is about what
// a stranger who guesses the URL can and cannot make happen.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handleWebhook } from "./router.mjs";
import { _resetOrgCache } from "../events/bus.mjs";
import { clearHandlers } from "../events/registry.mjs";
import { _resetRegistered } from "../register-all.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const reset = () => { _resetOrgCache(); clearHandlers(); _resetRegistered(); };

const db = { query: async () => ({ rows: [] }) };

const post = (body, env = {}) => handleWebhook({
  db, provider: "submagic",
  rawBody: typeof body === "string" ? body : JSON.stringify(body),
  headers: {}, env
});

describe("the open door", () => {
  test("a body that is not JSON is a clean 400", async () => {
    reset();
    const out = await post("not json");
    assert.equal(out.status, 400);
    assert.equal(out.body.ok, false);
  });

  test("a body with no project id is a clean 400", async () => {
    reset();
    const out = await post({ status: "completed" });
    assert.equal(out.status, 400);
    assert.equal(out.body.error, "no_project_id");
  });

  test("a well-formed ping that changes nothing still answers 200", async () => {
    reset();
    /* A non-200 makes a provider retry, and a retry storm on an open door is
       worse than a ping that did nothing. Nothing is load-bearing here: the
       sweeper polls the same project every five minutes. */
    const out = await post({ projectId: "p-unknown", status: "completed" }, { SUBMAGIC_API_KEY: "" });
    assert.equal(out.status, 200);
    assert.equal(out.body.ignored, true);
  });

  test("A FORGED 'FINISHED' PING CANNOT MOVE A ROW", async () => {
    reset();
    /* With no key the verification GET cannot run, so recordSubmagicWebhook
       refuses and nothing is written — which is exactly the shape a stranger's
       ping hits. The link in the body is never trusted on its own. */
    const out = await post({
      projectId: "p1", status: "completed", downloadUrl: "https://evil.test/out.mp4"
    }, {});
    assert.equal(out.status, 200);
    assert.equal(out.body.ignored, true);
    assert.ok(!JSON.stringify(out.body).includes("evil.test"),
      "a link from the payload must never be echoed back as if it were ours");
  });

  test("an unknown provider is still a clean 404 — the branch did not widen the door", async () => {
    reset();
    const out = await handleWebhook({ db, provider: "submagick", rawBody: "{}", headers: {}, env: {} });
    assert.equal(out.status, 404);
  });
});

describe("how it is wired", () => {
  test("there is NO webhooks/submagic key in the ROUTES map", () => {
    const api = fs.readFileSync(path.join(HERE, "../../netlify/functions/api.mjs"), "utf8");
    assert.ok(!/["']webhooks\/submagic["']\s*:/.test(api),
      "a key there works only while two lookups stay in the same order; the prefix branch depends on nothing");
  });

  test("the router asks Submagic for the truth rather than reading the body", () => {
    const src = fs.readFileSync(path.join(HERE, "router.mjs"), "utf8");
    const branch = src.slice(src.indexOf('provider === "submagic"'), src.indexOf('provider === "mailgun-events"'));
    assert.ok(/recordSubmagicWebhook/.test(branch));
    assert.ok(!/downloadUrl/.test(branch.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the branch must not read the payload's own download link");
  });

  test("a missing ad_videos store does not take the whole webhook router down", () => {
    const src = fs.readFileSync(path.join(HERE, "router.mjs"), "utf8");
    assert.ok(!/^import .*ad-videos\/store\.mjs/m.test(src),
      "Builder A's store is loaded at run time; a top-level import of a file that does not exist yet " +
      "would break every provider webhook, not just this one");
  });
});
