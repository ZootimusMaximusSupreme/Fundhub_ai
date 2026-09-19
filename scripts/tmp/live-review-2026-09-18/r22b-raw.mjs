// Hole 22 round 2 reviewer — field-by-field exact (raw) equality, Combo identity vs pull sent vs Sims 8-12. Booleans only.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SIMS = ["d682c13b-11f3-4bd5-a0c5-232b6a7875c4", "be3dcfd7-faae-4001-b97f-9bc30875bbcd", "22103bca-0ec9-4491-bb75-5d1b6528f116", "029964c5-4d8e-47ed-88c9-53ac13863fd4", "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f"];
const K = ["addressLine1", "city", "state", "postalCode"];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
try {
  const id = (await c.query(`select addresses from pii_identity where client_id=$1`, [COMBO])).rows[0].addresses;
  const res = (await c.query(`select result from crs_results where id='6adb7b98-d1c8-45b7-aac5-ca8aa2be50bc'`)).rows[0].result;
  console.log("identity addresses entries:", id.length, "| identity key set == form key set:", JSON.stringify(Object.keys(id[0]).sort()) === JSON.stringify([...K].sort()));
  for (const [b, v] of Object.entries(res.bureaus)) {
    const s = v.requestData.addresses[0];
    console.log(b, "raw equal per field:", K.map((k) => `${k}=${id[0][k] === s[k]}`).join(" "), "| sent had extra keys:", Object.keys(s).filter((k) => !K.includes(k)).join(","));
  }
  for (const sid of SIMS) {
    const a = (await c.query(`select addresses from pii_identity where client_id=$1`, [sid])).rows[0].addresses[0];
    console.log(sid.slice(0, 8), "raw equal per field:", K.map((k) => `${k}=${id[0][k] === a[k]}`).join(" "));
  }
  // jsonb exact equality of the whole object vs sims
  const eq = (await c.query(`select p.client_id, p.addresses = q.addresses same from pii_identity p, pii_identity q where q.client_id=$1 and p.client_id = any($2::uuid[])`, [COMBO, SIMS])).rows;
  console.log("whole addresses jsonb identical to Sims:", eq.map((r) => `${r.client_id.slice(0, 8)}=${r.same}`).join(" "));
} finally { await c.query("ROLLBACK"); await c.end(); }
// what kind of difference? (booleans only)
{
  const c2 = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c2.connect(); await c2.query("BEGIN READ ONLY");
  const id = (await c2.query(`select addresses->0 a from pii_identity where client_id=$1`, [COMBO])).rows[0].a;
  const s = (await c2.query(`select addresses->0 a from pii_identity where client_id=$1`, [SIMS[1]])).rows[0].a;
  for (const k of ["addressLine1", "city"]) {
    const x = String(id[k]), y = String(s[k]);
    console.log(k, { same_length: x.length === y.length, equal_ignoring_case: x.toLowerCase() === y.toLowerCase(), equal_ignoring_case_and_spaces: x.toLowerCase().replace(/\s+/g, " ").trim() === y.toLowerCase().replace(/\s+/g, " ").trim(), combo_all_caps: x === x.toUpperCase(), sim_all_caps: y === y.toUpperCase() });
  }
  await c2.query("ROLLBACK"); await c2.end();
}
