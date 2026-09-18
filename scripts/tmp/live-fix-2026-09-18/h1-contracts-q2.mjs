// READ ONLY. Dry-render #11 against CAPITAL-BLUEPRINT-AGREEMENT with preview().
// preview() = getTemplate + clientContext (SELECTs) + in-memory render. No write, no send.
// Whole thing runs inside BEGIN READ ONLY, so any write would be refused by Postgres.
import { writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
import { preview } from "../../../src/contracts/send.mjs";
import { defaultContractValues, resolveContractTemplateKey } from "../../../src/config/offers.mjs";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const ORG = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const out = {};
out.resolver = {
  UWIQ_DELIVERABLES: resolveContractTemplateKey({ offerKey: "UWIQ_DELIVERABLES" }),
  FUNDING_DFY: resolveContractTemplateKey({ offerKey: "FUNDING_DFY" }),
  REPAIR_DFY: resolveContractTemplateKey({ offerKey: "REPAIR_DFY" }),
};
out.values = defaultContractValues({ templateKey: "CAPITAL-BLUEPRINT-AGREEMENT" });
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const t = (await c.query(`SELECT id FROM contract_templates WHERE org_id=$1 AND template_key='CAPITAL-BLUEPRINT-AGREEMENT'`, [ORG])).rows[0];
  const p = await preview(c, { orgId: ORG, templateId: t.id, clientId: ELEVEN, values: out.values });
  out.template = p.template.template_key + " / " + p.template.name;
  out.body_len = p.body.length;
  out.has_placeholder_line = p.body.includes("THIS IS NOT THE REAL AGREEMENT TEXT");
  out.has_word_placeholder = /PLACEHOLDER/i.test(p.body);
  out.leftover_braces = (p.body.match(/\{\{[^}]*\}\}/g) || []).length;
  out.missing_tags = p.missing_tags;
  out.missing_required = p.missing_required;
  out.mentions_client = p.body.includes("Sim Eleven-Blueprint");
  out.mentions_fee = p.body.includes("$5,000");
  const pay = await c.query(`SELECT purpose, description, amount_cents, status, created_at FROM payment_links WHERE client_id=$1 ORDER BY created_at`, [ELEVEN]).catch(e => ({ rows: [{ err: e.message }] }));
  out.pay_links = pay.rows;
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
writeFileSync("/tmp/live-fix-2026-09-18/h1-contracts/q2.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
