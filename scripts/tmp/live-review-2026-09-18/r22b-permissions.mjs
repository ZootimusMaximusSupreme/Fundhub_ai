// Hole 22 round 2 reviewer — every soft-pull permission vs the identity row the form writes. Read only, no values printed.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const kinds = (await c.query(`select kind, count(*)::int n from client_consents group by 1 order by 1`)).rows;
  console.log("consent kinds:", JSON.stringify(kinds));
  const rows = (await c.query(`
    select cc.client_id, cc.kind, cc.granted_at, cc.capture_method, cc.granted_by_kind, cc.revoked_at is not null revoked, cc.consent_version,
           cc.granted_by_account_id is not null has_account, cc.captured_ip is not null has_ip, cc.captured_user_agent is not null has_ua,
           c.first_name ilike 'sim%' is_sim, c.is_demo,
           p.created_at p_created, p.updated_at p_updated, p.ssn_enc is not null has_ssn, p.dob is not null has_dob,
           (p.addresses is not null and jsonb_typeof(p.addresses)='array' and jsonb_array_length(p.addresses)>0
            and nullif(trim(coalesce(p.addresses->0->>'address_line1', p.addresses->0->>'addressLine1', p.addresses->0->>'line1', p.addresses->0->>'street','')),'') is not null) address_ok,
           (select string_agg(k, ',') from jsonb_object_keys(p.addresses->0) k) keys
      from client_consents cc join clients c on c.id=cc.client_id
      left join pii_identity p on p.client_id=cc.client_id
     where cc.kind ilike '%pull%'
     order by cc.granted_at`)).rows;
  console.log("pull permissions:", rows.length);
  for (const r of rows) {
    const d = r.p_updated ? ((r.granted_at - r.p_updated) / 1000).toFixed(2) : "-";
    const dc = r.p_created ? ((r.granted_at - r.p_created) / 1000).toFixed(2) : "-";
    console.log(`${r.client_id.slice(0, 8)} sim=${r.is_sim} demo=${r.is_demo} kind=${r.kind} granted=${r.granted_at.toISOString()} method=${r.capture_method} by=${r.granted_by_kind} acct=${r.has_account} ip=${r.has_ip} ua=${r.has_ua} revoked=${r.revoked} v=${r.consent_version} | pii created=${r.p_created?.toISOString() ?? "-"} updated=${r.p_updated?.toISOString() ?? "-"} consent_minus_pii_updated_s=${d} consent_minus_pii_created_s=${dc} ssn=${r.has_ssn} dob=${r.has_dob} address_ok=${r.address_ok} keys=${r.keys}`);
  }
} finally { await c.query("ROLLBACK"); await c.end(); }
