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
  callWithTimeout,
  SUMMARY_MODEL,
  SUMMARY_MAX_TOKENS,
  SUMMARY_TIMED_OUT
} from "./dossier-summary.mjs";
import { DEFAULT_MODEL } from "../agents/model.mjs";

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
  const long = "word ".repeat(1000);
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
  assert.equal(d.profile.custom_fields.social_security_number, "[withheld]");
  assert.deepEqual(d.profile.withheld_keys, ["profile.custom_fields.social_security_number"]);
  assert.equal(d.profile.survey.cf_svy_your_why, "grow");
  const text = renderDossier(d).text;
  assert.match(text, /Withheld \(sensitive, never sent to a model\): profile\.custom_fields\.social_security_number/);
  assert.ok(!text.includes("123-45-6789"));
});

test("a stored credit report, a card number and a token never reach renderDossier", async () => {
  const SSN = "123456789";
  const SSN_DASHED = "987-65-4321";
  const CARD = "4111111111111111";
  const CARD_SPACED = "4111 1111 1111 1111";
  // A made-up key in the live-key shape, assembled at runtime so secret
  // scanning does not mistake this test for a leaked key.
  const TOKEN = ["sk", "live", "FAKEFAKEFAKE0000TESTONLY"].join("_");
  const ACCOUNT = "5524880012345678";
  const report = {
    source: "crs",
    pulledAt: "2026-09-01T00:00:00Z",
    bureausPulled: ["TU"],
    scores: { tu: 702, ex: null, eq: null },
    tradelines: [{
      creditorName: "CAPITAL ONE", sourceType: "TransUnion", accountIdentifier: ACCOUNT,
      currentBalanceAmount: 900, creditLimitAmount: 3000, chargeOffAmount: 0, pastDueAmount: 0,
      accountOpenedDate: "2019-01-01"
    }, {
      creditorName: "MIDLAND CREDIT", sourceType: "TransUnion", accountIdentifier: "MC-778899",
      currentBalanceAmount: 1200, chargeOffAmount: 1200
    }],
    inquiries: [{ creditorName: "AMEX", inquiryDate: "2026-08-01", source: "TU" }],
    bureaus: {
      TU: {
        creditFiles: [{
          ssns: [{ ssn: SSN }],
          dobs: [{ dob: "1980-02-03" }],
          aliases: [{ firstName: "Jane", lastName: "Doe" }]
        }],
        tradelines: [{ accountIdentifier: ACCOUNT }]
      }
    }
  };
  const d = await buildDossier(fakeDb({
    crs_results: [{ id: "crs-1", provider: "crs", result: report, created_at: at(1) }],
    snapshots: [{ id: "snap-1", source: "crs", score: 702, data: report, created_at: at(1) }],
    transactions: [{
      id: "tx-1", status: "paid", created_at: at(2),
      raw_payload: { card: { number: CARD }, customer: { ssn: SSN_DASHED }, auth: { token: TOKEN }, note: `card ${CARD_SPACED}` }
    }],
    events: [{ id: "ev-1", name: "payment.received", created_at: at(3),
      payload: { checkout: `https://pay.example/x?token=${TOKEN}`, memo: `ssn ${SSN_DASHED} key ${TOKEN}` } }],
    messages: [{ id: "m-1", direction: "inbound", channel: "sms", created_at: at(4),
      body: `my social is ${SSN_DASHED} and my card is ${CARD}` }]
  }), { orgId: ORG, clientId: CLIENT });

  const text = renderDossier(d).text;
  const everything = `${text}\n${JSON.stringify(d)}`;
  for (const secret of [SSN, SSN_DASHED, CARD, CARD_SPACED, TOKEN, ACCOUNT, "1980-02-03", "MC-778899"]) {
    assert.ok(!everything.includes(secret), `${secret} leaked`);
  }
  // The parsed credit facts are there instead of the raw report.
  const facts = d.credit.results[0].facts;
  assert.equal(facts.scores.tu, 702);
  assert.equal(facts.tradeline_count, 2);
  assert.equal(facts.negative_count, 1);
  assert.equal(facts.tradelines[0].account_last4, "5678");
  assert.equal(facts.utilization_pct, 30);
  assert.equal(facts.inquiries[0].creditor, "AMEX");
  assert.deepEqual(facts.not_shown, ["bureaus"]);
  assert.match(text, /CAPITAL ONE/);
  assert.match(text, /MIDLAND CREDIT/);
  assert.ok(!("result" in d.credit.results[0]));
  assert.ok(!("data" in d.credit.snapshots[0]));
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
  const d = await buildDossier(fakeDb({ messages: messages(10, (i) => `${"yes ".repeat(250)} #${i}`) }),
    { orgId: ORG, clientId: CLIENT });
  const summary = { summary: "OLDER-SUMMARY", covers_until: at(5), items_covered: 6 };
  const r = renderDossier(d, { summary, budgetChars: 7000 });
  assert.equal(r.mode, "summary_plus_newer");
  assert.equal(r.items_summarized, 6);
  assert.equal(r.items_in_full, 4);
  assert.match(r.text, /OLDER-SUMMARY/);
  for (const i of [6, 7, 8, 9]) assert.ok(r.text.includes(`#${i}`), `newer item ${i} missing`);
  assert.ok(!r.text.includes("#5\n") && !r.text.includes(`${"yes ".repeat(250)} #5`));
  assert.equal(r.summary_needed, false);
});

test("renderDossier: too big with no summary → still everything, flagged for a summary", async () => {
  const d = await buildDossier(fakeDb({ messages: messages(10, (i) => `${"yes ".repeat(250)} #${i}`) }),
    { orgId: ORG, clientId: CLIENT });
  const r = renderDossier(d, { budgetChars: 3000 });
  assert.equal(r.mode, "full");
  assert.equal(r.items_in_full, 10);
  assert.equal(r.over_budget, true);
  assert.equal(r.summary_needed, true);
});

test("renderDossier flags a stale summary when a backdated record lands under it", async () => {
  const d = await buildDossier(fakeDb({ messages: messages(10, (i) => `${"yes ".repeat(250)} #${i}`) }),
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
  const db = fakeDb({ messages: messages(10, (i) => `${"yes ".repeat(250)} #${i}`) }, { writes });
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
    const db = fakeDb({ messages: messages(10, (i) => `${"yes ".repeat(250)} #${i}`) }, { writes });
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

test("a summary call that hangs is abandoned at the timeout and writes nothing (trap 8)", async () => {
  const writes = [];
  const db = fakeDb({ messages: messages(10, (i) => `${"yes ".repeat(250)} #${i}`) }, { writes });
  let sawSignal = false;
  const out = await refreshDossierSummary(db, {
    orgId: ORG, clientId: CLIENT, env: { ANTHROPIC_API_KEY: "k" },
    budgetChars: 5000, keepNewestChars: 3000, timeoutMs: 30,
    fetchImpl: async (_u, init) => { sawSignal = !!init?.signal; return {}; },
    callModelImpl: async ({ fetchImpl }) => {
      await fetchImpl("https://api.anthropic.com/v1/messages", {});
      return new Promise(() => {}); // never answers
    }
  });
  assert.equal(sawSignal, true, "the fetch handed to the model call carries the abort signal");
  assert.equal(out.refreshed, false);
  assert.equal(out.reason, "model_error");
  assert.equal(out.detail, SUMMARY_TIMED_OUT);
  assert.equal(writes.length, 0);
});

test("callWithTimeout aborts the fetch it handed out", async () => {
  let signal = null;
  const res = await callWithTimeout(async ({ fetchImpl }) => {
    await fetchImpl("u", {});
    return new Promise(() => {});
  }, {}, { timeoutMs: 20, fetchImpl: async (_u, init) => { signal = init.signal; return {}; } });
  assert.equal(res.error, SUMMARY_TIMED_OUT);
  assert.equal(signal.aborted, true);
});

test("the summary model is the repo's central default, not a hardcoded id", () => {
  assert.equal(SUMMARY_MODEL, DEFAULT_MODEL);
});
