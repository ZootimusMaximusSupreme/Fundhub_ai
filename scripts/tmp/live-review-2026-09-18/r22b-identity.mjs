// Hole 22 round 2 reviewer — Combo's identity row(s) and where the address came from.
// Read only. Street / ZIP / SSN / DOB never printed — only presence flags and short hashes.
import pg from "pg";
import { createHash } from "node:crypto";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SIMS = { "#8 Eight": "d682c13b-11f3-4bd5-a0c5-232b6a7875c4", "#9 Nine": "be3dcfd7-faae-4001-b97f-9bc30875bbcd", "#10 Ten": "22103bca-0ec9-4491-bb75-5d1b6528f116", "#11 Eleven": "029964c5-4d8e-47ed-88c9-53ac13863fd4", "#12 Twelve": "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f" };
const up = (x) => String(x ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const pick = (a, ...ks) => { for (const k of ks) if (a && a[k] != null && String(a[k]).trim() !== "") return a[k]; return ""; };
// line1 | city | state | zip5 (line2 kept separately)
const norm = (a) => a ? [up(pick(a, "address_line1", "addressLine1", "line1", "street")), up(pick(a, "city")), up(pick(a, "state")), up(pick(a, "postal_code", "postalCode", "zip", "zipCode")).slice(0, 5)].join("|") : "";
const line2 = (a) => up(pick(a || {}, "address_line2", "addressLine2", "line2"));
const h = (s) => s ? createHash("sha256").update(s).digest("hex").slice(0, 10) : "(empty)";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const rows = (await c.query(`select id, org_id, client_id, ssn_enc is not null has_ssn, dob is not null has_dob, addresses, created_at, updated_at,
      verified_legal_name is not null v_name, verified_address is not null v_addr, verified_dob is not null v_dob, verified_by is not null v_by, verified_at, verified_field_sources
      from pii_identity where client_id=$1 order by created_at`, [COMBO])).rows;
  console.log("COMBO pii_identity rows:", rows.length);
  let comboHash = null;
  for (const r of rows) {
    const a0 = Array.isArray(r.addresses) ? r.addresses[0] : null;
    console.log({ id: r.id, org_id: r.org_id, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString(), has_ssn: r.has_ssn, has_dob: r.has_dob,
      addresses_len: Array.isArray(r.addresses) ? r.addresses.length : typeof r.addresses,
      addr0_keys: a0 ? Object.keys(a0) : null,
      addr0_filled: a0 ? Object.fromEntries(Object.entries(a0).map(([k, v]) => [k, v != null && String(v).trim() !== ""])) : null,
      state_value: a0 ? pick(a0, "state") : null, city_is_gilbert: a0 ? up(pick(a0, "city")) === "GILBERT" : null,
      zip_is_5_digits: a0 ? /^\d{5}$/.test(String(pick(a0, "postal_code", "postalCode", "zip"))) : null,
      addr_hash: h(norm(a0)), line2_hash: h(line2(a0)),
      verified: { name: r.v_name, addr: r.v_addr, dob: r.v_dob, by: r.v_by, at: r.verified_at, sources: r.verified_field_sources } });
    comboHash = comboHash || norm(a0);
  }
  // The practice pull
  const crs = (await c.query(`select id, created_at, updated_at, provider, is_demo, outcome_tier, result from crs_results where client_id=$1 order by created_at`, [COMBO])).rows;
  console.log("\nCOMBO crs_results rows:", crs.length);
  for (const r of crs) {
    const res = r.result || {};
    console.log({ id: r.id, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString(), provider: r.provider, is_demo: r.is_demo, pulledAt: res.pulledAt, environment: res.environment, simulated: res.simulated });
    for (const [b, v] of Object.entries(res.bureaus || {})) {
      const sent = v.requestData?.addresses?.[0]; const ret = v.creditFiles?.[0]?.addresses?.[0];
      console.log(`  ${b}: sent_hash=${h(norm(sent))} returned_hash=${h(norm(ret))} identity==sent:${norm(sent) === comboHash} identity==returned:${norm(ret) === comboHash} sent_line2_hash=${h(line2(sent))} returned_addr_count=${(v.creditFiles?.[0]?.addresses || []).length}`);
      if (sent) console.log(`     sent keys: ${Object.keys(sent).join(",")}`);
    }
  }
  // Sims 8-12 and every other identity row
  console.log("\nSims #8-#12 identity address vs Combo:");
  for (const [label, id] of Object.entries(SIMS)) {
    const s = (await c.query(`select addresses, created_at, ssn_enc is not null has_ssn, dob is not null has_dob from pii_identity where client_id=$1 order by created_at`, [id])).rows;
    for (const r of s) console.log(`  ${label} ${id.slice(0, 8)} rows=${s.length} created=${r.created_at.toISOString()} hash=${h(norm(r.addresses?.[0]))} equals_combo=${norm(r.addresses?.[0]) === comboHash} line2_equal=${line2(r.addresses?.[0]) === line2(rows[0]?.addresses?.[0])} has_ssn=${r.has_ssn} has_dob=${r.has_dob}`);
    if (!s.length) console.log(`  ${label} ${id.slice(0, 8)} rows=0`);
  }
  console.log("\nAll identity rows (client prefix, created, same-as-combo):");
  const all = (await c.query(`select p.client_id, p.created_at, p.addresses, c.first_name ilike 'sim%' is_sim, c.is_demo from pii_identity p join clients c on c.id=p.client_id order by p.created_at`)).rows;
  for (const r of all) console.log(`  ${r.client_id.slice(0, 8)} ${r.created_at.toISOString()} sim=${r.is_sim} demo=${r.is_demo} same_as_combo=${norm(r.addresses?.[0]) === comboHash} keys=${r.addresses?.[0] ? Object.keys(r.addresses[0]).join(",") : "-"}`);
} finally { await c.query("ROLLBACK"); await c.end(); }
