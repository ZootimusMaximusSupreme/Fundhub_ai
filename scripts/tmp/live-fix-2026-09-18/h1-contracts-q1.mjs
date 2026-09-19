// READ ONLY. h1-contracts lane: #11 contract rows + the three template rows.
// BEGIN READ ONLY ... COMMIT only. No SET, no writes.
import { writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const ALL = ["d682c13b-11f3-4bd5-a0c5-232b6a7875c4","be3dcfd7-faae-4001-b97f-9bc30875bbcd",ELEVEN];
const KEYS = ["FUNDING-AGREEMENT","CREDIT-REPAIR-AGREEMENT","CAPITAL-BLUEPRINT-AGREEMENT"];
const out = {};
const c = await pool().connect();
async function opt(sql, params) { await c.query("SAVEPOINT sp"); try { const r = await c.query(sql, params); await c.query("RELEASE SAVEPOINT sp"); return r; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT sp"); return { rows: [{ err: e.message }] }; } }
try {
  await c.query("BEGIN READ ONLY");
  out.contracts = (await c.query(`
    SELECT k.id, k.client_id, k.org_id, k.template_id, k.template_key, k.title, k.kind, k.subtype, k.status,
           k.sent_at, k.sent_by, k.viewed_at, k.view_count, k.signed_at, k.signer_name, k.completed_at,
           k.voided_at, k.void_reason, k.source_kind, k.is_demo,
           k.created_by, s.email AS created_by_email, s.name AS created_by_name, k.staff_id,
           k.created_at, k.updated_at, k.document_id, k.document_version_id, k.body_sha,
           k.merge_values,
           (k.rendered_body IS NOT NULL) has_body, length(k.rendered_body) body_len,
           (k.rendered_body LIKE '%THIS IS NOT THE REAL AGREEMENT TEXT%') placeholder
      FROM contracts k LEFT JOIN staff s ON s.id = k.created_by
     WHERE k.client_id = ANY($1::uuid[]) ORDER BY k.client_id, k.created_at`, [ALL])).rows;
  const ids = out.contracts.map(r => r.id);
  out.signers = ids.length ? (await opt(`SELECT contract_id, role_label, name, email, status, viewed_at, view_count, signed_at FROM contract_signers WHERE contract_id = ANY($1::uuid[]) ORDER BY contract_id`, [ids])).rows : [];
  out.templates = (await c.query(`
    SELECT id, org_id, template_key, name, kind, subtype, active, is_demo, length(body) len,
           (body LIKE '%THIS IS NOT THE REAL AGREEMENT TEXT%') placeholder,
           (body ILIKE '%PLACEHOLDER%') any_placeholder_word, updated_at
      FROM contract_templates WHERE template_key = ANY($1::text[]) ORDER BY template_key, org_id`, [KEYS])).rows;
  out.client11 = (await c.query(`SELECT id, org_id, first_name, last_name, email, is_demo, created_at FROM clients WHERE id=$1`, [ELEVEN])).rows;
  // messages tied to contracts for these clients (did anything go out?)
  out.messages = (await opt(`SELECT client_id, channel, status, template_key, created_at FROM messages WHERE client_id = ANY($1::uuid[]) AND (template_key ILIKE 'CONTRACT%' ) ORDER BY created_at`, [ALL])).rows;
  // contract events
  out.events = (await opt(`SELECT name, created_at, payload->>'template_key' tk, payload->>'contract_id' cid, client_id FROM events WHERE name ILIKE 'contract.%' AND (client_id = ANY($1::uuid[]) OR payload->>'client_id' = ANY($1::text[])) ORDER BY created_at`, [ALL])).rows;
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
writeFileSync("/tmp/live-fix-2026-09-18/h1-contracts/q1.json", JSON.stringify(out, null, 2));
for (const r of out.contracts) console.log(r.client_id.slice(0,8), r.template_key, "| status", r.status, "| sent", r.sent_at?.toISOString?.() ?? null, "| signed", r.signed_at?.toISOString?.() ?? null, "| viewed", r.view_count, "| void", r.voided_at ? "yes" : "no", "| demo", r.is_demo, "| by", r.created_by_email, "| src", r.source_kind, "| created", r.created_at.toISOString(), "| placeholder", r.placeholder, "| len", r.body_len, "| id", r.id);
console.log("signers:", JSON.stringify(out.signers.map(s => ({ c: s.contract_id?.slice(0,8), role: s.role_label, name: s.name, st: s.status, viewed: s.viewed_at, views: s.view_count, signed: s.signed_at, email_domain: s.email ? String(s.email).split("@")[1] : null }))));
for (const t of out.templates) console.log("TPL", t.template_key, "| org", String(t.org_id).slice(0,8), "| active", t.active, "| demo", t.is_demo, "| len", t.len, "| placeholder", t.placeholder, "| id", t.id);
console.log("client11", JSON.stringify(out.client11.map(r => ({ org: r.org_id, name: r.first_name + " " + r.last_name, demo: r.is_demo, created: r.created_at }))));
console.log("messages", JSON.stringify(out.messages));
console.log("events", JSON.stringify(out.events));
