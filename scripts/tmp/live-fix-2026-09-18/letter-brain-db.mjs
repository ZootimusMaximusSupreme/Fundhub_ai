import pg from "pg";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 15000 });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(sql, params = []) {
  try { return { rows: (await c.query(sql, params)).rows }; }
  catch (e) { return { error: e.message.slice(0, 220) }; }
}
const out = {};
out.pii = await q(
  `SELECT verified_legal_name IS NOT NULL AS has_name,
          verified_address IS NOT NULL AS has_addr,
          verified_dob IS NOT NULL AS has_dob,
          verified_at IS NOT NULL AS has_verified_at,
          length(coalesce(verified_legal_name,'')) AS name_len
     FROM pii_identity WHERE client_id = $1`,
  [NINE]
);
out.letters = await q(
  `SELECT count(*)::int AS n FROM dispute_letters WHERE client_id = $1`,
  [NINE]
);
out.cases = await q(
  `SELECT count(*)::int AS n FROM dispute_cases WHERE client_id = $1`,
  [NINE]
);
out.crs = await q(
  `SELECT id, created_at FROM crs_results WHERE client_id = $1 ORDER BY created_at DESC LIMIT 3`,
  [NINE]
);
out.docs = await q(
  `SELECT kind, subtype, mime_type, count(*)::int AS n
     FROM documents WHERE client_id = $1 GROUP BY 1,2,3 ORDER BY n DESC`,
  [NINE]
);
out.program = await q(
  `SELECT id, program, status, rounds_cap FROM repair_programs WHERE client_id = $1`,
  [NINE]
);
out.events = await q(
  `SELECT name, created_at FROM events
    WHERE client_id = $1 AND name LIKE 'repair.%'
    ORDER BY created_at DESC LIMIT 20`,
  [NINE]
);
out.checks = await q(
  `SELECT id, status, created_at FROM document_checks
    WHERE client_id = $1 ORDER BY created_at DESC LIMIT 8`,
  [NINE]
);
console.log(JSON.stringify(out, null, 2));
await c.query("ROLLBACK");
await c.end();
