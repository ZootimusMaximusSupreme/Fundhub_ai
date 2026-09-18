/* Hole N3 (2026-09-18) — opening Ops Admin must only read.
 *
 * Seen live: every load of /app/ops-admin.html sent POST /api/messages-outbound
 * {action:"status"} to fill the Outbound Mail panel. The action only read, but a
 * page load that fires a POST looks like a write, and a POST is the same door
 * that sends mail. The fix: GET /api/messages-outbound answers "status" and
 * nothing else; the panel reads with FHData.outboxStatus() (a GET); every
 * button that does something stays a POST.
 *
 * Two halves:
 *   1. the handler — a GET returns the status, runs only SELECTs, and cannot be
 *      talked into any other action;
 *   2. the page — the real panel script from ops-admin.html, run against the
 *      real data.js with a recording fetch, makes no request that is not a GET
 *      on load, and still paints what the status said.
 *
 * Lives under src/ so npm test's glob picks it up (CLAUDE.md §12).
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { db } from "../db.mjs";
import handler from "../../api/messages-outbound.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "../../public/app");

const ORG = "11111111-1111-4111-8111-111111111111";
const STAFF = "44444444-4444-4444-8444-444444444444";

const realQuery = db.query;
let calls = [];

function stubDb({ role = "owner" } = {}) {
  calls = [];
  db.query = async (text, params) => {
    calls.push({ text, params });
    if (/FROM live JOIN staff s/i.test(text)) {
      return { rows: [{
        session_id: "sess-1", expires_at: new Date(Date.now() + 3_600_000),
        staff_id: STAFF, org_id: ORG, role, email: "e@example.com",
        name: "A Staffer", status: "active", active_flag: "true"
      }] };
    }
    if (/FROM messaging_settings/i.test(text)) {
      return { rows: [{ org_id: ORG, outbound_enabled: true, daily_send_cap: 500, alert_email: null }] };
    }
    if (/FROM messages\b/i.test(text) && /count\(\*\) FILTER/i.test(text)) {
      return { rows: [{ queued: 2, due: 1, sending: 0, failed: 0, blocked: 0, sent_today: 3 }] };
    }
    if (/FROM message_channel_routing/i.test(text)) {
      return { rows: [{ channel: "email", provider: "resend", enabled: true }] };
    }
    return { rows: [] };
  };
}

function mkRes() {
  return {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; }
  };
}

/* Every query the handler ran, minus the session lookup (which slides the
   session's expiry on every request, GET or not — that is sign-in plumbing,
   not this endpoint). */
const handlerQueries = () => calls.filter((c) => !/FROM live JOIN staff s/i.test(c.text));
const writes = () => handlerQueries().filter((c) => /\b(INSERT|UPDATE|DELETE)\b/i.test(c.text));

afterEach(() => { db.query = realQuery; });

describe("GET /api/messages-outbound — the page-load read", () => {
  test("a GET answers the status and only reads", async () => {
    stubDb({ role: "owner" });
    const r = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: {} }, r);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "status");
    assert.equal(r.body.counts.queued, 2);
    assert.equal(r.body.settings.outbound_enabled, true);
    assert.ok(typeof r.body.message === "string" && r.body.message.length > 0);
    assert.ok(handlerQueries().length > 0, "the status read ran");
    assert.deepEqual(writes(), [], "a GET must not write anything");
  });

  test("a GET cannot be talked into sending or changing a setting", async () => {
    for (const action of ["dispatch", "settings", "email_invoice_backlog", "email_invoice"]) {
      stubDb({ role: "owner" });
      const r = mkRes();
      await handler({
        method: "GET",
        headers: { authorization: "Bearer tok" },
        query: { action, outbound_enabled: "false" },
        body: { action, outbound_enabled: false, invoice_id: "22222222-2222-4222-8222-222222222222" }
      }, r);
      assert.equal(r.statusCode, 200, action);
      assert.equal(r.body.action, "status", `GET with action=${action} must still only read`);
      assert.deepEqual(writes(), [], `GET with action=${action} wrote something`);
    }
  });

  test("a narrower staff role can read the status with a GET", async () => {
    stubDb({ role: "closer" });
    const r = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: {} }, r);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.action, "status");
  });

  test("POST actions still gate the same way (a closer cannot dispatch)", async () => {
    stubDb({ role: "closer" });
    const r = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { action: "dispatch" } }, r);
    assert.equal(r.statusCode, 403);
  });

  test("other methods are refused and told GET and POST", async () => {
    stubDb({ role: "owner" });
    const r = mkRes();
    await handler({ method: "PUT", headers: { authorization: "Bearer tok" }, body: {} }, r);
    assert.equal(r.statusCode, 405);
    assert.equal(r.headers.allow, "GET, POST");
  });
});

/* ── the page ───────────────────────────────────────────────────────────── */

function outboxScript() {
  const html = fs.readFileSync(path.join(APP, "ops-admin.html"), "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const block = blocks.find((b) => b.includes('$("outboxCard")'));
  assert.ok(block, "ops-admin.html must still carry the Outbound Mail panel script");
  return block;
}

function loadPanel(respond) {
  const fetches = [];
  const listeners = {};
  const els = {};
  const el = (id) => (els[id] ||= {
    id, textContent: "", innerHTML: "", style: { display: "none" }, onclick: null
  });
  for (const id of ["outboxCard", "outboxSummary", "outboxDetail", "outboxSend",
                    "outboxToggle", "outboxInvoices", "outboxMsg"]) el(id);

  const sandbox = {
    document: {
      getElementById: (id) => els[id] || null,
      querySelectorAll: () => [],
      addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); }
    },
    localStorage: {
      getItem: (k) => (k === "fh_token" ? "t0ken" : null),
      setItem: () => {}, removeItem: () => {}
    },
    location: { search: "" },
    confirm: () => false,
    fetch: (p, opts = {}) => {
      fetches.push({ path: p, method: (opts.method || "GET").toUpperCase(), body: opts.body || null });
      const r = respond(p, opts);
      return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.body) });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, "data.js"), "utf8"), sandbox, { filename: "data.js" });
  vm.runInContext(outboxScript(), sandbox, { filename: "ops-admin.html#outbox" });
  return { fetches, els, fire: (ev) => (listeners[ev] || []).forEach((fn) => fn()) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("ops-admin.html Outbound Mail panel — page load only reads", () => {
  test("loading the page makes no request that is not a GET, and still paints the status", async () => {
    const status = {
      ok: true, action: "status",
      settings: { outbound_enabled: true, daily_send_cap: 500, alert_email: null },
      counts: { queued: 0, due: 0, failed: 1, blocked: 0, sent_today: 4 },
      routing: [{ channel: "email", provider: "resend", enabled: true }],
      invoices_never_emailed: 1,
      message: "All caught up. 4 sent today."
    };
    const { fetches, els, fire } = loadPanel(() => ({ status: 200, body: status }));
    fire("DOMContentLoaded");
    for (let i = 0; i < 5; i++) await settle();

    assert.ok(fetches.length >= 1, "the panel read the outbound status");
    const notGet = fetches.filter((f) => f.method !== "GET");
    assert.deepEqual(notGet, [], "page load sent a request that is not a GET");
    assert.ok(fetches.some((f) => f.path === "/api/messages-outbound"),
      "the panel reads GET /api/messages-outbound");

    // Whatever the page needed from that call still shows.
    assert.equal(els.outboxSummary.textContent, "All caught up. 4 sent today.");
    assert.match(els.outboxDetail.innerHTML, /0 waiting · 4 sent today · 1 failed · 0 held by compliance/);
    assert.match(els.outboxDetail.innerHTML, /email via resend/);
    assert.match(els.outboxDetail.innerHTML, /1 invoice\(s\) were never emailed/);
    assert.equal(els.outboxToggle.textContent, "Pause sending");
    assert.equal(els.outboxToggle.style.display, "");
    assert.equal(els.outboxInvoices.style.display, "");
    assert.equal(els.outboxSend.style.display, "none", "nothing waiting, so no send button");
  });

  test("a failed read still shows the honest error and no buttons", async () => {
    const { fetches, els, fire } = loadPanel(() => ({ status: 500, body: { ok: false, error: "request_failed" } }));
    fire("DOMContentLoaded");
    for (let i = 0; i < 5; i++) await settle();
    assert.deepEqual(fetches.filter((f) => f.method !== "GET"), []);
    assert.match(els.outboxSummary.textContent, /Could not read the outbound queue/);
    assert.equal(els.outboxToggle.style.display, "none");
    assert.equal(els.outboxSend.style.display, "none");
    assert.equal(els.outboxInvoices.style.display, "none");
  });
});
