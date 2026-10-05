import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchContext, formatPromptBlock } from "./context.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT = "550e8400-e29b-41d4-a716-446655440000";

function mockDb(extra = {}) {
  return {
    async query(sql) {
      if (/FROM clients/i.test(sql)) {
        return {
          rows: [{
            id: CLIENT, first_name: "Jane", last_name: "Doe",
            email: "jane@x.test", phone: null, funded: true,
            funded_amount: 50000, tags: [], outcome_tier: null,
            dnd_sms: false, dnd_email: false, dnd_voice: false,
            ...(extra.client || {})
          }]
        };
      }
      if (/FROM conversations/i.test(sql)) return { rows: [] };
      if (/FROM messages/i.test(sql)) return { rows: extra.messages || [] };
      if (/FROM cards/i.test(sql)) return { rows: [] };
      if (/FROM funding_rounds/i.test(sql)) return { rows: [] };
      if (/FROM client_custom_fields/i.test(sql)) return { rows: [extra.cf || {}] };
      if (/FROM crs_results/i.test(sql)) return { rows: extra.crs || [] };
      if (/FROM customer_insights/i.test(sql)) {
        return { rows: extra.insights || [] };
      }
      if (/FROM call_outcomes/i.test(sql)) {
        return { rows: extra.calls || [] };
      }
      if (/FROM client_waypoints/i.test(sql)) {
        return {
          rows: extra.waypoints || [{
            id: "wp-1",
            key: "paydown_capital_one",
            title: "Pay Capital One down to $300",
            detail: null,
            position: 1,
            owner_kind: "client",
            state: "in_progress",
            due_at: "2026-10-01T00:00:00Z",
            paid_alternative_price_cents: null
          }]
        };
      }
      return { rows: [] };
    }
  };
}

test("fetchContext includes interview answers and the recording link", async () => {
  const ctx = await fetchContext(mockDb({
    insights: [{
      stage: "post",
      channel: "google_meet",
      answers: { what_almost_stopped_you: "Price" },
      notes: "Loved the closer",
      recording_url: "https://drive.google.com/file/d/rec",
      meeting_url: "https://meet.google.com/abc",
      occurred_at: "2026-08-15T16:00:00Z"
    }],
    calls: [{
      outcome: "deposit",
      notes: "Closed",
      recording_url: "https://drive.google.com/file/d/call",
      transcript: "three thousand is a start and part of ten percent",
      logged_at: "2026-08-14T16:00:00Z"
    }]
  }), { orgId: ORG, clientId: CLIENT });

  assert.equal(ctx.insights.length, 1);
  assert.equal(ctx.insights[0].answers.what_almost_stopped_you, "Price");
  assert.equal(ctx.recent_calls[0].outcome, "deposit");
  assert.match(ctx.as_prompt_block, /Price/);
  assert.match(ctx.as_prompt_block, /Loved the closer/);
  assert.match(ctx.as_prompt_block, /deposit/);
  assert.match(ctx.as_prompt_block, /three thousand is a start/);
});

test("fetchContext includes open checklist step for the coach", async () => {
  const ctx = await fetchContext(mockDb(), { orgId: ORG, clientId: CLIENT });
  assert.ok(ctx.checklist?.open_step);
  assert.match(ctx.checklist.open_step.title, /Capital One/);
  assert.match(ctx.as_prompt_block, /Open checklist step/);
});

test("formatPromptBlock omits empty interview blocks", () => {
  const text = formatPromptBlock({
    client: { first_name: "Jane", last_name: "Doe" },
    snapshot: {},
    survey: {},
    insights: [],
    recent_calls: []
  });
  assert.doesNotMatch(text, /Customer interviews/);
  assert.match(text, /Jane Doe/);
});

test("closer context reads spoken words from call_outcomes.transcript", () => {
  // The call query moved into the dossier (M0 step 9); fetchContext reads it from there.
  const dossierSrc = readFileSync(fileURLToPath(new URL("../clients/dossier.mjs", import.meta.url)), "utf8");
  assert.match(dossierSrc, /SELECT id, outcome, belief_failed, notes, cash_collected_cents, transaction_id,\s+recording_url, transcript,[^`]*FROM call_outcomes/);
  assert.match(dossierSrc, /said: /);
  const src = readFileSync(fileURLToPath(new URL("./context.mjs", import.meta.url)), "utf8");
  assert.match(src, /buildDossier\(db, \{ orgId, clientId \}\)/);
  assert.match(src, /said: /);
});

test("fetchContext puts every call transcript in the prompt in full (no cut)", async () => {
  const long = "word ".repeat(2000).trim(); // 9,999 chars; the old cut was 1,200
  const ctx = await fetchContext(mockDb({
    calls: Array.from({ length: 5 }, (_, i) => ({
      id: `co-${i}`, outcome: "callback", notes: `call ${i}`, recording_url: null,
      transcript: `${long} END-${i}`, logged_at: `2026-08-1${i}T16:00:00Z`
    }))
  }), { orgId: ORG, clientId: CLIENT });
  assert.equal(ctx.recent_calls.length, 5);
  for (let i = 0; i < 5; i++) assert.match(ctx.as_prompt_block, new RegExp(`END-${i}`));
  assert.ok(ctx.as_prompt_block.includes(long));
  assert.equal(ctx.dossier_render.mode, "full");
});

test("nothing sensitive reaches fetchContext().as_prompt_block or the context JSON", async () => {
  // Every value is made up; key-shaped ones are assembled at runtime so secret
  // scanning does not read this file as a leak.
  const SSN = "123-45-6789";
  const SSN_PLAIN = "987654321";
  const CARD = ["4111", "1111", "1111", "1111"].join("");
  const TOKEN = ["sk", "live", "FAKEFAKEFAKE0000TESTONLY"].join("_");
  const DOB = "02/03/1980";
  const PASSWORD = "Hunter2Secret!";
  const ACCOUNT = "5524880012345678";
  const ctx = await fetchContext(mockDb({
    client: { custom_fields: { ssn: SSN_PLAIN, date_of_birth: "1980-02-03", note: `dob: ${DOB}` } },
    cf: {
      social_security_number: SSN,
      agent_context: `client said ssn ${SSN}, password is ${PASSWORD}, card ${CARD}`,
      cf_svy_self_reported_fico: "640"
    },
    messages: [{
      id: "m-1", direction: "inbound", channel: "sms", created_at: "2026-09-01T00:00:00Z",
      body: `here you go: SSN ${SSN_PLAIN}, born on ${DOB}, pin: 4821, link https://x.test/a?token=${TOKEN}`
    }],
    insights: [{
      stage: "mid", channel: "call", occurred_at: "2026-09-02T00:00:00Z",
      answers: { pin: 4821, bank_account: 123456789012, how_it_went: "good" }, notes: `pwd: ${PASSWORD}`
    }],
    calls: [{
      outcome: "deposit", logged_at: "2026-09-03T00:00:00Z",
      transcript: `my social is ${SSN} and the card is ${CARD.match(/.{4}/g).join(" ")}`
    }],
    crs: [{
      id: "crs-1", provider: "crs", created_at: "2026-09-04T00:00:00Z",
      result: {
        scores: { tu: 640 },
        tradelines: [{ creditorName: "CAPITAL ONE", accountIdentifier: ACCOUNT, currentBalanceAmount: 100 }],
        bureaus: { TU: { creditFiles: [{ ssns: [{ ssn: SSN_PLAIN }], dobs: [{ dob: "1980-02-03" }] }] } }
      }
    }]
  }), { orgId: ORG, clientId: CLIENT });

  const block = ctx.as_prompt_block;
  const json = JSON.stringify(ctx);
  for (const secret of [SSN, SSN_PLAIN, CARD, TOKEN, DOB, "1980-02-03", PASSWORD, ACCOUNT, "4821", "123456789012"]) {
    assert.ok(!block.includes(secret), `${secret} reached the prompt`);
    assert.ok(!json.includes(secret), `${secret} reached the context JSON`);
  }
  // The useful facts are still there.
  assert.match(block, /CAPITAL ONE/);
  assert.match(block, /how_it_went: good/);
  assert.match(block, /cf_svy_self_reported_fico: 640/);
  // Profile and survey are printed once, not twice.
  assert.equal(block.split("cf_svy_self_reported_fico").length - 1, 1);
  assert.equal(block.split("Jane").length - 1, 1);
});
