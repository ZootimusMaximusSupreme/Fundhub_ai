import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agreesToRoadmap, nextTextSlot, DISCOUNT_CENTS } from "../slo/discount-197.mjs";
import { SLO_PRICE_CENTS } from "../slo/offer.mjs";
import { DRIP_LANES } from "../slo/drip-plan.mjs";
import { handleNoReply, EMAIL_197_KEY, SMS_197_KEY } from "./slo-no-reply-197.mjs";
import { LOCK_M1 } from "./slo-genuine-followup.mjs";
import { pgFake, ev } from "./test-support.mjs";

test("agreesToRoadmap: a yes counts, a worry does not", () => {
  assert.equal(agreesToRoadmap("Yes I want the roadmap"), true);
  assert.equal(agreesToRoadmap("I was worried about getting burned"), false);
  assert.equal(agreesToRoadmap(""), false);
});

test("nextTextSlot: only the first five", () => {
  assert.equal(nextTextSlot(0), 1);
  assert.equal(nextTextSlot(4), 5);
  assert.equal(nextTextSlot(5), null);
});

test("no-reply price is $147 (owner-set 2026-10-05)", () => {
  assert.equal(DISCOUNT_CENTS, 14700);
});

test("the link lands on the live page, so the offer equals the page price", () => {
  assert.equal(DISCOUNT_CENTS, SLO_PRICE_CENTS);
});

// The stored text is whatever the LAST applied file wrote. Walk db/ the way
// db/migrate.mjs does and read the last file that touches each template.
const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "db");
function lastFileTouching(templateKey) {
  let last = null;
  for (const d of ["schema", "migrations", "seed"]) {
    const dir = path.join(DB_DIR, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8")
        .split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
      if (sql.includes(`'${templateKey}'`)) last = { file: `${d}/${f}`, sql };
    }
  }
  return last;
}

for (const key of ["SMS-SLO-197", "EMAIL-SLO-197"]) {
  test(`${key}: the stored text says $147 and makes no percent-off claim`, () => {
    const last = lastFileTouching(key);
    assert.ok(last, `no db file writes ${key}`);
    const dollars = `$${DISCOUNT_CENTS / 100}`;
    assert.ok(last.sql.includes(`It's ${dollars}:`), `${last.file} does not say It's ${dollars}:`);
    assert.ok(!last.sql.includes("$197"), `${last.file} still says $197`);
    assert.ok(!/\d+% off/.test(last.sql), `${last.file} still claims a percent off`);
  });
}

// Replay every db file in the order db/migrate.mjs applies them and return what
// message_templates holds for each SLO template afterwards. `through` stops
// after that file (a key like "seed/034_slo_first5_reply.sql").
const SLO_KEY_RE = /^(?:SMS|EMAIL)-SLO-[A-Z0-9-]+$/;
const unquote = (s) => s.replace(/''/g, "'");
function storedSloTemplates({ through = null } = {}) {
  const store = new Map();
  for (const d of ["schema", "migrations", "seed"]) {
    const dir = path.join(DB_DIR, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const file = `${d}/${f}`;
      const sql = fs.readFileSync(path.join(dir, f), "utf8")
        .split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
      const mentions = [...sql.matchAll(/'((?:SMS|EMAIL)-SLO-[A-Z0-9-]+)'/g)].length;
      if (mentions) {
        const writes = [];
        const tuple = /\(\s*'([^']+)',\s*'(?:sms|email)',\s*(NULL::text|'(?:[^']|'')*'),\s*\$c\$([\s\S]*?)\$c\$\s*\)/g;
        for (const m of sql.matchAll(tuple)) {
          if (!SLO_KEY_RE.test(m[1])) continue;
          const subject = m[2] === "NULL::text" ? null : unquote(m[2].slice(1, -1));
          writes.push({ at: m.index, key: m[1], subject, body: m[3] });
        }
        const update = /UPDATE message_templates\s+SET\s+([\s\S]*?)\s+WHERE template_key = '([^']+)'/g;
        for (const m of sql.matchAll(update)) {
          if (!SLO_KEY_RE.test(m[2])) continue;
          const w = { at: m.index, key: m[2] };
          const subject = m[1].match(/subject\s*=\s*'((?:[^']|'')*)'/);
          const body = m[1].match(/body\s*=\s*\$c\$([\s\S]*?)\$c\$/);
          if (subject) w.subject = unquote(subject[1]);
          if (body) w.body = body[1];
          writes.push(w);
        }
        assert.equal(writes.length, mentions,
          `${file} names ${mentions} SLO templates but this test can read ${writes.length} writes. Teach it the new shape.`);
        for (const w of writes.sort((a, b) => a.at - b.at)) {
          const { at: _at, ...fields } = w;
          store.set(w.key, { ...store.get(w.key), ...fields, file });
        }
      }
      if (file === through) return store;
    }
  }
  return store;
}

const SLO_147_FROM = "seed/034_slo_first5_reply.sql";
const SLO_147_TO = "seed/036_slo_followups_147.sql";
const DRIP_KEYS = Object.values(DRIP_LANES).flat();
const PERCENT_KEYS = ["SMS-SLO-197", "EMAIL-SLO-197", "SMS-SLO-COUPON-01", "EMAIL-SLO-COUPON-01"];

test("no SLO follow-up template, as stored after the last db file, says $197 or claims a percent off", () => {
  const store = storedSloTemplates();
  for (const key of [...PERCENT_KEYS, ...DRIP_KEYS]) assert.ok(store.has(key), `no db file writes ${key}`);
  for (const [key, t] of store) {
    const text = `${t.subject || ""}\n${t.body || ""}`;
    assert.ok(!text.includes("$197"), `${key} (last written by ${t.file}) still says $197`);
    assert.ok(!/\d+\s*% off/i.test(text), `${key} (last written by ${t.file}) still claims a percent off`);
  }
});

test("every drip email and the coupon ask for $147", () => {
  const store = storedSloTemplates();
  for (const key of DRIP_KEYS) {
    assert.ok(store.get(key).body.includes("$147: {{pay_url}}"), `${key} does not say $147: {{pay_url}}`);
  }
  for (const key of PERCENT_KEYS) {
    assert.ok(store.get(key).body.includes("Here's the roadmap. It's $147:"), `${key} does not say It's $147:`);
  }
});

test("the $147 change touched only the price and the percent claim — every other word is the same", () => {
  const before = storedSloTemplates({ through: SLO_147_FROM });
  const after = storedSloTemplates({ through: SLO_147_TO });
  for (const key of DRIP_KEYS) {
    assert.equal(after.get(key).body, before.get(key).body.replaceAll("$197", "$147"), `${key} body`);
    assert.equal(after.get(key).subject, before.get(key).subject.replaceAll("$197", "$147"), `${key} subject`);
  }
  for (const key of PERCENT_KEYS) {
    assert.equal(
      after.get(key).body,
      before.get(key).body.replace("Here's 30% off the roadmap. It's $197", "Here's the roadmap. It's $147"),
      `${key} body`
    );
    const subject = before.get(key).subject;
    assert.equal(after.get(key).subject, subject == null ? null : subject.replace(/^Here's 30% off$/, "Here's the roadmap"), `${key} subject`);
  }
  for (const [key, t] of after) {
    if (DRIP_KEYS.includes(key) || PERCENT_KEYS.includes(key)) continue;
    assert.deepEqual(t, before.get(key), `${key} should not have changed`);
  }
});

function dbFor197(seed = {}) {
  const base = pgFake(seed);
  const paid = seed.paidDiagnostic || false;
  return {
    ...base,
    async query(sql, params = []) {
      if (/FROM payment_links pl/.test(sql) && /JOIN clients c/.test(sql)) {
        return { rows: paid ? [{ "?column?": 1 }] : [] };
      }
      if (/custom_fields->>\$2 AS replied/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0]);
        if (!c) return { rows: [] };
        const cf = c.custom_fields || {};
        return { rows: [{ replied: cf[params[1]] || null, m1: cf[params[2]] || null }] };
      }
      if (/SELECT id, ghl_contact_id FROM clients WHERE org_id/.test(sql)) {
        const c = base.clients.find(
          (row) => row.org_id === params[0]
            && String(row.email || "").toLowerCase() === String(params[1] || "").toLowerCase()
        );
        return { rows: c ? [{ id: c.id, ghl_contact_id: c.ghl_contact_id || null }] : [] };
      }
      if (/SELECT id, ghl_contact_id, email, phone, first_name, last_name/.test(sql)) {
        const c = base.clients.find((row) => row.id === params[0] && row.org_id === params[1]);
        return {
          rows: c
            ? [{
              id: c.id,
              ghl_contact_id: "ghl-test",
              email: c.email,
              phone: c.phone,
              first_name: null,
              last_name: null
            }]
            : []
        };
      }
      return base.query(sql, params);
    }
  };
}

const person = {
  actor: "person",
  email: "pat@gmail.com",
  phone: "+14155550134",
  name: "Pat Lee"
};

const templates = [
  { org_id: "org-1", template_key: SMS_197_KEY, channel: "sms", body: "147 sms {{pay_url}}", compliance_passed: true },
  { org_id: "org-1", template_key: EMAIL_197_KEY, channel: "email", subject: "$147", body: "147 email {{pay_url}}", compliance_passed: true }
];

test("handleNoReply: silence queues the $147 text and email", async () => {
  const db = dbFor197({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z" }
    }],
    templates
  });
  const res = await handleNoReply({
    event: ev("slo.contact_started", person, { id: "evt-197" }),
    db,
    step: { run: (_id, fn) => fn(), sleep: async () => {} }
  });
  assert.equal(res.sent, true);
  assert.match(res.payUrl, /offer=147/);
  assert.match(res.payUrl, /apply\.fundhub\.ai\/roadmap/);
  assert.deepEqual(
    db.messages.map((m) => m.template_key).sort(),
    [EMAIL_197_KEY, SMS_197_KEY].sort()
  );
});

test("handleNoReply: a reply skips the discount", async () => {
  const db = dbFor197({
    clients: [{
      id: "cl-1",
      org_id: "org-1",
      email: "pat@gmail.com",
      phone: "+14155550134",
      custom_fields: { [LOCK_M1]: "2026-09-27T18:20:00.000Z", slo_replied_at: "2026-09-27T19:00:00.000Z" }
    }],
    templates
  });
  const res = await handleNoReply({
    event: ev("slo.contact_started", person),
    db,
    step: { run: (_id, fn) => fn(), sleep: async () => {} },
    mint: async () => { throw new Error("should not mint"); }
  });
  assert.equal(res.reason, "they_replied");
  assert.equal(db.messages.length, 0);
});
