import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_REPAIR_LETTERS_SENT,
  EMAIL_REPAIR_WELCOME,
  EMAIL_REPAIR_RESPONSE_RESULTS,
  EMAIL_REPAIR_ROUND_ADVANCED,
  EMAIL_REPAIR_RETAKE_PHOTO,
  EMAIL_REPAIR_TRIAL_COMPLETE_UPSELL,
  REPAIR_EMAIL_KEYS,
  TEMPLATE_BY_EVENT,
  formatAccountLine,
  formatAccountsList,
  formatOutcomesList,
  notifyRepairEmail,
  notifyRepairRetake,
  repairMergeContext
} from "./notify.mjs";
import { onRepairEvent } from "./handlers.mjs";
import { sendTemplated } from "../workflows/messaging.mjs";

describe("repair email templates map", () => {
  it("seeds six keys and maps each §7 event", () => {
    assert.equal(REPAIR_EMAIL_KEYS.length, 6);
    assert.equal(TEMPLATE_BY_EVENT["repair.enrolled"], EMAIL_REPAIR_WELCOME);
    assert.equal(TEMPLATE_BY_EVENT["repair.letters.sent"], EMAIL_REPAIR_LETTERS_SENT);
    assert.equal(TEMPLATE_BY_EVENT["repair.response.parsed"], EMAIL_REPAIR_RESPONSE_RESULTS);
    assert.equal(TEMPLATE_BY_EVENT["repair.round.escalated"], EMAIL_REPAIR_ROUND_ADVANCED);
    assert.equal(TEMPLATE_BY_EVENT["repair.response.retake"], EMAIL_REPAIR_RETAKE_PHOTO);
    assert.equal(TEMPLATE_BY_EVENT["repair.program.complete"], EMAIL_REPAIR_TRIAL_COMPLETE_UPSELL);
  });

  it("formats account lines with bureau names", () => {
    assert.equal(
      formatAccountLine({ creditor: "Chase", accountLast4: "1234", bureau: "EX" }),
      "Chase ending 1234 (Experian)"
    );
    assert.match(formatAccountsList([
      { creditor: "Chase", accountLast4: "1234", bureau: "EX" },
      { creditor: "Cap One", accountLast4: "9988", bureau: "EQ" }
    ]), /Chase ending 1234 \(Experian\)/);
  });

  it("formats outcomes in plain words without promising future results", () => {
    const text = formatOutcomesList([
      { creditor: "Midland", accountLast4: "4521", bureau: "TU", outcome: "deleted" },
      { creditor: "Bank", accountLast4: "1111", bureau: "EX", outcome: "verified" }
    ]);
    assert.match(text, /no longer listed/);
    assert.match(text, /verified/);
    assert.doesNotMatch(text, /will remove|guarantee|score will/i);
  });
});

describe("notifyRepairEmail", () => {
  it("D1: letters.sent queues EMAIL-REPAIR-LETTERS-SENT naming the accounts", async () => {
    const calls = [];
    const send = async (_db, args) => {
      calls.push(args);
      return { sent: true, messageId: "m1" };
    };
    const res = await notifyRepairEmail(null, {
      name: "repair.letters.sent",
      orgId: "org-1",
      clientId: "cl-1",
      payload: {
        eventId: "send-1",
        accounts: [
          { creditor: "Chase", accountLast4: "4321", bureau: "EX" },
          { creditor: "LVNV", accountLast4: "7788", bureau: "EQ" }
        ],
        bureaus: ["EX", "EQ"]
      },
      send
    });
    assert.equal(res.sent, true);
    assert.equal(res.templateKey, EMAIL_REPAIR_LETTERS_SENT);
    assert.equal(calls[0].channel, "email");
    assert.equal(calls[0].templateKey, EMAIL_REPAIR_LETTERS_SENT);
    const list = calls[0].context.repair.accounts_list;
    assert.match(list, /Chase ending 4321 \(Experian\)/);
    assert.match(list, /LVNV ending 7788 \(Equifax\)/);
    assert.match(calls[0].context.repair.bureaus_list, /Experian/);
    assert.match(calls[0].context.repair.bureaus_list, /Equifax/);
  });

  it("D1 via sendTemplated: rendered body includes the exact account lines", async () => {
    const body =
      "Letters cover:\n{{repair.accounts_list}}\nBureaus: {{repair.bureaus_list}}";
    const db = {
      messages: [],
      async query(sql, params = []) {
        if (/FROM message_templates/.test(sql)) {
          return {
            rows: [{
              body,
              subject: "Your dispute letters are on the way",
              compliance_passed: true
            }]
          };
        }
        if (/FROM clients/.test(sql)) {
          return {
            rows: [{
              first_name: "Alex",
              last_name: "Test",
              email: "e2e+aff-repair@example.com",
              phone: null,
              custom_fields: {}
            }]
          };
        }
        if (/INSERT INTO messages/.test(sql)) {
          this.messages.push({
            template_key: params[3],
            rendered_body: params[4],
            channel: params[2],
            provider_ref: params[5]
          });
          return { rows: [{ id: "msg-1" }] };
        }
        return { rows: [] };
      }
    };
    const res = await notifyRepairEmail(db, {
      name: "repair.letters.sent",
      orgId: "org-1",
      clientId: "cl-1",
      payload: {
        eventId: "a1-send",
        accounts: [{ creditor: "Chase", accountLast4: "4321", bureau: "EX" }],
        bureaus: ["EX"]
      },
      send: sendTemplated
    });
    assert.equal(res.sent, true);
    assert.equal(db.messages.length, 1);
    assert.equal(db.messages[0].channel, "email");
    assert.equal(db.messages[0].template_key, EMAIL_REPAIR_LETTERS_SENT);
    assert.match(db.messages[0].rendered_body, /Chase ending 4321 \(Experian\)/);
    assert.match(db.messages[0].rendered_body, /Experian/);
  });

  it("loads accounts from dispute rows when payload has letter results only", async () => {
    const calls = [];
    const db = {
      async query(sql) {
        if (/FROM dispute_letters/.test(sql)) {
          return { rows: [{ id: "L1", bureau: "EX", round: "R1" }] };
        }
        if (/FROM dispute_items/.test(sql)) {
          return {
            rows: [{
              creditor: "Portfolio Recovery",
              account_last4: "5566",
              bureau: "EX",
              round: "R1"
            }]
          };
        }
        return { rows: [] };
      }
    };
    await notifyRepairEmail(db, {
      name: "repair.letters.sent",
      orgId: "11111111-1111-1111-1111-111111111111",
      clientId: "22222222-2222-2222-2222-222222222222",
      payload: {
        eventId: "send-db",
        results: [{ ok: true, bureau: "EX", letterId: "L1" }]
      },
      send: async (_db, args) => {
        calls.push(args);
        return { sent: true };
      }
    });
    assert.match(calls[0].context.repair.accounts_list, /Portfolio Recovery ending 5566 \(Experian\)/);
  });

  it("trial-complete upsell skips full programs", async () => {
    const res = await notifyRepairEmail(null, {
      name: "repair.program.complete",
      orgId: "o",
      clientId: "c",
      payload: { program: "full", eventId: "pc1" },
      send: async () => ({ sent: true })
    });
    assert.equal(res.sent, false);
    assert.equal(res.reason, "not_trial_program");
  });

  it("trial-complete upsell queues for trial", async () => {
    const calls = [];
    const res = await notifyRepairEmail(null, {
      name: "repair.program.complete",
      orgId: "o",
      clientId: "c",
      payload: { program: "trial", eventId: "pc2", results_recap: "Round 1 and 2 letters mailed." },
      send: async (_db, args) => {
        calls.push(args);
        return { sent: true };
      }
    });
    assert.equal(res.sent, true);
    assert.equal(calls[0].templateKey, EMAIL_REPAIR_TRIAL_COMPLETE_UPSELL);
    assert.match(calls[0].context.repair.results_recap, /Round 1 and 2/);
  });

  it("retake queues EMAIL-REPAIR-RETAKE-PHOTO with agent instructions", async () => {
    const calls = [];
    const res = await notifyRepairRetake(null, {
      orgId: "o",
      clientId: "c",
      messageToClient: "Move closer so the full page fits and avoid glare on the top right.",
      eventId: "retake-1",
      send: async (_db, args) => {
        calls.push(args);
        return { sent: true };
      }
    });
    assert.equal(res.sent, true);
    assert.equal(calls[0].templateKey, EMAIL_REPAIR_RETAKE_PHOTO);
    assert.equal(calls[0].channel, "email");
    assert.match(calls[0].context.repair.retake_message, /glare/);
  });

  it("never uses sms channel", async () => {
    for (const name of Object.keys(TEMPLATE_BY_EVENT)) {
      const calls = [];
      await notifyRepairEmail(null, {
        name,
        orgId: "o",
        clientId: "c",
        payload: { program: "trial", eventId: name, accounts: [], outcomes: [], escalated: [] },
        send: async (_db, args) => {
          calls.push(args);
          return { sent: true };
        }
      });
      assert.equal(calls[0]?.channel, "email", name);
    }
  });
});

describe("onRepairEvent wires emails", () => {
  it("letters.sent returns email queue result with named accounts", async () => {
    const db = {
      async query(sql) {
        if (/pipeline_stages/.test(sql)) {
          return { rows: [{ stage_id: "st", pipeline_id: "pl" }] };
        }
        if (/FROM cards/.test(sql) || /INSERT INTO cards/.test(sql) || /UPDATE cards/.test(sql)) {
          return { rows: [{ id: "card-1" }] };
        }
        if (/INSERT INTO repair_decision_log/.test(sql)) return { rows: [] };
        return { rows: [] };
      }
    };
    const orig = await onRepairEvent(db, {
      name: "repair.letters.sent",
      orgId: "org-1",
      clientId: "cl-1",
      payload: {
        eventId: "handler-send-1",
        accounts: [{ creditor: "Chase", accountLast4: "4321", bureau: "EX" }],
        results: [{ ok: true, bureau: "EX" }]
      }
    });
    // Without a real template row, sendTemplated returns template_pending —
    // still proves the handler attempted the LETTERS-SENT key.
    assert.equal(orig.email?.templateKey, EMAIL_REPAIR_LETTERS_SENT);
    assert.ok(orig.email);
  });

  it("retake is email-only and does not require a stage", async () => {
    const db = {
      async query() {
        return { rows: [] };
      }
    };
    const r = await onRepairEvent(db, {
      name: "repair.response.retake",
      orgId: "org-1",
      clientId: "cl-1",
      payload: {
        message_to_client: "Retake with better light.",
        eventId: "retake-h"
      }
    });
    assert.equal(r.ok, true);
    assert.equal(r.emailOnly, true);
    assert.equal(r.email?.templateKey, EMAIL_REPAIR_RETAKE_PHOTO);
  });
});

/* ── hole N8: the "we need your ID and proof of address" stage asked nobody ──
   repair.docs.needed moved the card to awaiting_documents and sent nothing:
   notifyRepairEmail had no template for it and returned no_template_for_event.
   On live, every repair file that reached the stage got no ask from it. These
   pin the ask, and pin "once" — shared with the funding/inquiry paths that send
   the same EMAIL-DOC-01-REQUEST. */
describe("repair.docs.needed asks the client for their ID and proof of address, once", () => {
  const ORG = "11111111-1111-1111-1111-111111111111";
  const CLIENT = "22222222-2222-2222-2222-222222222222";
  const docsNeeded = {
    name: "repair.docs.needed",
    orgId: ORG,
    clientId: CLIENT,
    payload: {
      source: "repair.enrolled",
      missing: ["id_document", "proof_of_address"],
      idempotencyKey: `repair.docs.needed:${ORG}:${CLIENT}`
    }
  };

  /* A client row with a one-shot lock, and a messages table, answered by SQL
     shape. The lock UPDATE mirrors claimCustomFieldLock: it wins only while the
     field is empty. */
  function askDb({ alreadyAsked = false, lockHeld = false } = {}) {
    const state = { lock: lockHeld ? "2026-09-18T15:13:14.561Z" : "", messages: [] };
    return {
      state,
      async query(sql, params = []) {
        if (/FROM messages/.test(sql) && /template_key IN/.test(sql)) {
          return { rows: alreadyAsked || state.messages.length ? [{ "?column?": 1 }] : [] };
        }
        if (/UPDATE clients/.test(sql) && /custom_fields/.test(sql)) {
          if (state.lock) return { rows: [] };
          state.lock = JSON.parse(params[1])[params[2]];
          return { rows: [{ id: params[0] }] };
        }
        if (/FROM message_templates/.test(sql)) {
          return {
            rows: [{
              body: "Hey {{contact.first_name}}, we need: Government-issued photo ID, Proof of address.",
              subject: "Documents needed before we can start",
              compliance_passed: true
            }]
          };
        }
        if (/FROM clients/.test(sql)) {
          return {
            rows: [{
              first_name: "Sim",
              last_name: "Repair",
              email: "e2e+aff-repair@example.com",
              phone: "+15555550100",
              custom_fields: {}
            }]
          };
        }
        if (/INSERT INTO messages/.test(sql)) {
          if (state.messages.some((m) => m.provider_ref === params[5])) return { rows: [] };
          state.messages.push({ channel: params[2], template_key: params[3], rendered_body: params[4], provider_ref: params[5] });
          return { rows: [{ id: `msg-${state.messages.length}` }] };
        }
        return { rows: [] };
      }
    };
  }

  it("queues EMAIL-DOC-01-REQUEST by email when the stage is entered", async () => {
    const db = askDb();
    const res = await notifyRepairEmail(db, { ...docsNeeded, send: sendTemplated });
    assert.equal(res.sent, true, `nothing was queued: ${res.reason}`);
    assert.equal(res.templateKey, "EMAIL-DOC-01-REQUEST");
    assert.equal(db.state.messages.length, 1);
    assert.equal(db.state.messages[0].channel, "email", "repair is email only");
    assert.equal(db.state.messages[0].template_key, "EMAIL-DOC-01-REQUEST");
    assert.match(db.state.messages[0].rendered_body, /photo ID/);
    assert.match(db.state.messages[0].rendered_body, /Proof of address/);
    assert.ok(db.state.lock, "the shared one-shot lock was not claimed");
  });

  it("enrolment runs the handler twice; the client is asked once", async () => {
    const db = askDb();
    await notifyRepairEmail(db, { ...docsNeeded, send: sendTemplated });
    const second = await notifyRepairEmail(db, { ...docsNeeded, send: sendTemplated });
    assert.equal(second.sent, false);
    assert.equal(db.state.messages.length, 1, "the client was asked twice");
  });

  it("a client already asked by the funding or inquiry path is not asked again", async () => {
    const sent = [];
    const send = async (_db, args) => { sent.push(args); return { sent: true }; };
    const res = await notifyRepairEmail(askDb({ alreadyAsked: true }), { ...docsNeeded, send });
    assert.equal(res.sent, false);
    assert.equal(res.reason, "already_asked");
    assert.equal(sent.length, 0);
  });

  it("the shared lock already held means no second ask", async () => {
    const sent = [];
    const send = async (_db, args) => { sent.push(args); return { sent: true }; };
    const res = await notifyRepairEmail(askDb({ lockHeld: true }), { ...docsNeeded, send });
    assert.equal(res.sent, false);
    assert.equal(res.reason, "already_locked");
    assert.equal(sent.length, 0);
  });

  it("with no database there is no way to prove 'once', so nothing is sent", async () => {
    const sent = [];
    const send = async (_db, args) => { sent.push(args); return { sent: true }; };
    const res = await notifyRepairEmail(null, { ...docsNeeded, send });
    assert.equal(res.sent, false);
    assert.equal(sent.length, 0);
  });

  it("onRepairEvent on repair.docs.needed moves the card AND queues the ask", async () => {
    const db = askDb();
    const inner = db.query.bind(db);
    db.query = async (sql, params) => {
      if (/pipeline_stages/.test(sql)) return { rows: [{ stage_id: "st", pipeline_id: "pl" }] };
      if (/FROM cards/.test(sql) || /INSERT INTO cards/.test(sql) || /UPDATE cards/.test(sql)) {
        return { rows: [{ id: "card-1" }] };
      }
      return inner(sql, params);
    };
    const r = await onRepairEvent(db, docsNeeded);
    assert.equal(r.stageKey, "awaiting_documents");
    assert.equal(r.email?.templateKey, "EMAIL-DOC-01-REQUEST");
    assert.equal(r.email?.sent, true, `the stage was entered and nobody was asked: ${r.email?.reason}`);
    assert.equal(db.state.messages.length, 1);
    assert.equal(db.state.messages[0].channel, "email");
  });
});

describe("repairMergeContext", () => {
  it("builds repair.* bag for templates", () => {
    const ctx = repairMergeContext({
      accounts: [{ creditor: "A", accountLast4: "1", bureau: "TU" }],
      round: "R2",
      retake_message: "Blurry"
    });
    assert.match(ctx.repair.accounts_list, /TransUnion/);
    assert.equal(ctx.repair.round, "2");
    assert.equal(ctx.repair.retake_message, "Blurry");
  });
});

/* ── the enrollment runs this twice, on purpose and unavoidably ───────────
   src/repair/enroll.mjs emits repair.enrolled AND calls onRepairEvent directly.
   On the deployed site netlify/functions/api.mjs loads the workflow registry,
   so emit() already dispatched onRepairEvent before the direct call runs. That
   is safe ONLY because both runs key the email identically and the insert is
   ON CONFLICT DO NOTHING. This pins the "identically" half — if eventIdFor ever
   picks up a timestamp, a random id, or anything else that differs between the
   two runs, the client gets two welcome emails and this fails. */
describe("repair.enrolled runs twice per enrollment and must still send once", () => {
  const base = {
    name: "repair.enrolled",
    orgId: "11111111-1111-1111-1111-111111111111",
    clientId: "22222222-2222-2222-2222-222222222222",
    payload: { staffId: "33333333-3333-3333-3333-333333333333", program: "trial", source: "repair_enroll" }
  };

  it("both runs ask for the same dedupe key, so the second insert writes nothing", async () => {
    const seen = [];
    const send = async (_db, args) => { seen.push(args.eventId); return { sent: true }; };

    await notifyRepairEmail(null, { ...base, send });
    await notifyRepairEmail(null, { ...base, send });

    assert.equal(seen.length, 2, "both paths do call the mailer — the dedupe is in the database, not here");
    assert.equal(seen[0], seen[1],
      "the two runs must produce ONE provider_ref, or the client is welcomed twice");
    assert.equal(seen[0], `repair-email:repair.enrolled:${base.orgId}:${base.clientId}:${base.payload.staffId}`);
  });

  it("the key is the welcome template, so provider_ref cannot collide with another repair email", async () => {
    let key = null;
    const send = async (_db, args) => { key = args.templateKey; return { sent: true }; };
    await notifyRepairEmail(null, { ...base, send });
    assert.equal(key, EMAIL_REPAIR_WELCOME);
  });
});
