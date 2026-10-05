// Unit tests for the client dossier and its running summary. No database:
// a fake db answers by table name. The Postgres proof is dossier.pg.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildDossier,
  dossierItems,
  renderDossier,
  rollUpFunnel,
  readClientAdLink
} from "./dossier.mjs";
import {
  refreshDossierSummary,
  splitOlder,
  batchesOf,
  SUMMARY_MODEL,
  SUMMARY_MAX_TOKENS
} from "./dossier-summary.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT = "550e8400-e29b-41d4-a716-446655440000";

function at(i) {
  return new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString();
}

function fakeDb(tables = {}, { writes = [] } = {}) {
  const seen = [];
  return {
    seen,
    writes,
    async query(sql, params) {
      seen.push({ sql, params });
      if (/^\s*INSERT INTO client_dossier_summaries/i.test(sql)) {
        writes.push(params);
        return { rows: [] };
      }
      const m = /FROM\s+([a-z_]+)/i.exec(sql);
      const table = m ? m[1] : "";
      if (table === "clients") {
        return { rows: [{ id: CLIENT, org_id: ORG, first_name: "Jane", last_name: "Doe",
          custom_fields: { cf_svy_your_why: "grow", social_security_number: "123-45-6789" } }] };
      }
      return { rows: tables[table] || [] };
    }
  };
}

function messages(n, body = (i) => `text ${i}`) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m-${i}`, direction: i % 2 ? "inbound" : "outbound", channel: "sms",
    body: body(i), sender_kind: "system", created_at: at(i)
  })).reverse();
}

test("every dossier query filters by org_id (these tables have no row-level security)", () => {
  const src = readFileSync(fileURLToPath(new URL("./dossier.mjs", import.meta.url)), "utf8");
  const queries = src.match(/db\.query\(\s*`[^`]+`/g) || [];
  assert.ok(queries.length >= 20, `found ${queries.length} queries`);
  for (const q of queries) assert.match(q, /org_id = \$1/, q.slice(0, 120));
  // No count limit and no text cut anywhere in the dossier.
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /\bLIMIT\b/);
});

test("buildDossier keeps every message in full and names inbound by direction", async () => {
  const long = "x".repeat(5000);
  const d = await buildDossier(fakeDb({ messages: messages(50, (i) => `${long} #${i}`) }),
    { orgId: ORG, clientId: CLIENT });
  assert.equal(d.messages.length, 50);
  assert.equal(d.counts.messages, 50);
  assert.equal(d.counts.messages_inbound, 25);
  const r = renderDossier(d, { budgetChars: 10_000_000 });
  assert.equal(r.mode, "full");
  assert.equal(r.items_in_full, 50);
  for (let i = 0; i < 50; i++) assert.ok(r.text.includes(`${long} #${i}`), `message ${i} cut`);
  // sender_kind is 'system' on these rows; the inbound ones still read as the client.
  assert.match(r.text, /\[sms CLIENT\]/);
});

test("buildDossier withholds SSNs by name, never silently", async () => {
  const d = await buildDossier(fakeDb(), { orgId: ORG, clientId: CLIENT });
  assert.equal(d.profile.custom_fields.social_security_number, undefined);
  assert.deepEqual(d.profile.withheld_keys, ["clients.custom_fields.social_security_number"]);
  assert.equal(d.profile.survey.cf_svy_your_why, "grow");
  assert.match(renderDossier(d).text, /Withheld \(sensitive, never sent to a model\): clients\.custom_fields\.social_security_number/);
});

test("buildDossier returns null for a client outside the org", async () => {
  const db = { async query() { return { rows: [] }; } };
  assert.equal(await buildDossier(db, { orgId: ORG, clientId: CLIENT }), null);
});

test("the ad section is a pending hookup that returns nulls (M0 step 5 views not built)", async () => {
  const ad = await readClientAdLink(null, { orgId: ORG, clientId: CLIENT });
  assert.equal(ad.ad_number, null);
  assert.equal(ad.offer_tag, null);
  assert.equal(ad.lead_level, null);
  assert.match(ad.pending, /v_client_ad_number/);
});

test("brain transcripts are joined chunk by chunk, in order, never cut", async () => {
  const d = await buildDossier(fakeDb({
    brain_files: [
      { file_id: "f1", name: "Call (2026-08-24 15:00 GMT-7) - Recording.mp4", created_at: at(1), chunk_index: 0, content: "part one" },
      { file_id: "f1", name: "Call (2026-08-24 15:00 GMT-7) - Recording.mp4", created_at: at(1), chunk_index: 1, content: "part two" }
    ]
  }), { orgId: ORG, clientId: CLIENT });
  assert.equal(d.brain.length, 1);
  assert.equal(d.brain[0].text, "part one\n\npart two");
  assert.match(renderDossier(d).text, /words:\npart one\n\npart two/);
});

test("rollUpFunnel counts every page, click and video event", () => {
  const ev = (name, page, props, i) => ({ name, created_at: at(i), payload: { page, funnel: "slo", props } });
  const r = rollUpFunnel([
    ev("funnel.page", "roadmap", {}, 1),
    ev("funnel.click", "roadmap", { label: "buy" }, 2),
    ev("funnel.click", "roadmap", { label: "buy" }, 3),
    ev("funnel.video", "roadmap", { video: "vsl", action: "play", pct: 10 }, 4),
    ev("funnel.video", "roadmap", { video: "vsl", action: "progress", pct: 75 }, 5),
    ev("funnel.page", "order", {}, 6)
  ]);
  assert.equal(r.pages.length, 2);
  const roadmap = r.pages.find((p) => p.page === "roadmap");
  assert.equal(roadmap.views, 1);
  assert.equal(roadmap.clicks, 2);
  assert.equal(roadmap.click_labels.buy, 2);
  assert.equal(r.videos[0].plays, 1);
  assert.equal(r.videos[0].max_pct, 75);
});

test("renderDossier: too big with a summary → summary plus every newer item in full", async () => {
  const d = await buildDossier(fakeDb({ messages: messages(10, (i) => `${"y".repeat(1000)} #${i}`) }),
    { orgId: ORG, clientId: CLIENT });
  const summary = { summary: "OLDER-SUMMARY", covers_until: at(5), items_covered: 6 };
  const r = renderDossier(d, { summary, budgetChars: 7000 });
  assert.equal(r.mode, "summary_plus_newer");
  assert.equal(r.items_summarized, 6);
  assert.equal(r.items_in_full, 4);
  assert.match(r.text, /OLDER-SUMMARY/);
  for (const i of [6, 7, 8, 9]) assert.ok(r.text.includes(`#${i}`), `newer item ${i} missing`);
  assert.ok(!r.text.includes("#5\n") && !r.text.includes(`${"y".repeat(1000)} #5`));
  assert.equal(r.summary_needed, false);
});

test("renderDossier: too big with no summary → still everything, flagged for a summary", async () => {
  const d = await buildDossier(fakeDb({ messages: messages(10, (i) => `${"y".repeat(1000)} #${i}`) }),
    { orgId: ORG, clientId: CLIENT });
  const r = renderDossier(d, { budgetChars: 3000 });
  assert.equal(r.mode, "full");
  assert.equal(r.items_in_full, 10);
  assert.equal(r.over_budget, true);
  assert.equal(r.summary_needed, true);
});

test("renderDossier flags a stale summary when a backdated record lands under it", async () => {
  const d = await buildDossier(fakeDb({ messages: messages(10, (i) => `${"y".repeat(1000)} #${i}`) }),
    { orgId: ORG, clientId: CLIENT });
  const r = renderDossier(d, { summary: { summary: "S", covers_until: at(5), items_covered: 5 }, budgetChars: 7000 });
  assert.equal(r.summary_needed, true);
});

test("splitOlder keeps the newest items and folds the rest at one boundary time", () => {
  const items = [
    { at: at(4), text: "a".repeat(100) },
    { at: at(3), text: "b".repeat(100) },
    { at: at(3), text: "c".repeat(100) },
    { at: at(1), text: "d".repeat(100) }
  ];
  const { keep, older, coversUntil } = splitOlder(items, 250);
  assert.equal(keep.length, 1);
  assert.equal(older.length, 3);
  assert.equal(coversUntil, at(3));
});

test("batchesOf pages a record bigger than one batch instead of cutting it", () => {
  const big = { at: at(1), text: "z".repeat(250) };
  const batches = batchesOf([big, { at: at(2), text: "small" }], 100);
  assert.ok(batches.length >= 4);
  assert.match(batches[0], /record part 1 of/);
  const joined = batches.filter((b) => b.includes("record part")).map((b) => b.split("\n").slice(1).join("\n")).join("");
  assert.ok(joined.includes("z".repeat(250)));
});

test("refreshDossierSummary folds older items with an explicit Claude model and writes one row", async () => {
  const writes = [];
  const db = fakeDb({ messages: messages(10, (i) => `${"y".repeat(1000)} #${i}`) }, { writes });
  const calls = [];
  const out = await refreshDossierSummary(db, {
    orgId: ORG,
    clientId: CLIENT,
    env: { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "sk-should-not-be-used" },
    budgetChars: 5000,
    keepNewestChars: 3000,
    batchChars: 2500,
    callModelImpl: async (req) => {
      calls.push(req);
      return { mode: "live", text: `SUMMARY after ${calls.length}`, error: null };
    }
  });
  assert.equal(out.refreshed, true);
  assert.ok(calls.length >= 2, "paged into more than one call");
  for (const c of calls) {
    assert.equal(c.model, SUMMARY_MODEL);
    assert.equal(c.maxTokens, SUMMARY_MAX_TOKENS);
    assert.deepEqual(Object.keys(c.env), ["ANTHROPIC_API_KEY"]);
  }
  // Each fold carries the summary so far.
  assert.match(calls[1].user, /SUMMARY after 1/);
  assert.equal(writes.length, 1);
  const [org, client, summary, coversUntil, itemsCovered, model] = writes[0];
  assert.equal(org, ORG);
  assert.equal(client, CLIENT);
  assert.equal(summary, `SUMMARY after ${calls.length}`);
  assert.equal(coversUntil, out.covers_until);
  assert.equal(itemsCovered, out.items_covered);
  assert.equal(model, SUMMARY_MODEL);
});

test("refreshDossierSummary writes nothing when the model fails or there is no key", async () => {
  for (const reply of [{ mode: "shadow", text: null }, { mode: "live", text: null, error: "anthropic 500" }]) {
    const writes = [];
    const db = fakeDb({ messages: messages(10, (i) => `${"y".repeat(1000)} #${i}`) }, { writes });
    const out = await refreshDossierSummary(db, {
      orgId: ORG, clientId: CLIENT, env: {}, budgetChars: 5000, keepNewestChars: 3000,
      callModelImpl: async () => reply
    });
    assert.equal(out.refreshed, false);
    assert.equal(writes.length, 0);
  }
});

test("refreshDossierSummary is a no-op when the dossier fits", async () => {
  let called = false;
  const out = await refreshDossierSummary(fakeDb({ messages: messages(3) }), {
    orgId: ORG, clientId: CLIENT, callModelImpl: async () => { called = true; return {}; }
  });
  assert.equal(out.reason, "fits");
  assert.equal(called, false);
});

test("dossierItems sorts newest first", async () => {
  const d = await buildDossier(fakeDb({ messages: messages(5) }), { orgId: ORG, clientId: CLIENT });
  const items = dossierItems(d);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].at >= items[i].at);
});
