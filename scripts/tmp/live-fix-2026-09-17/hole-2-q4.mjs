// Plain SELECTs only. Counts, no personal data printed.
import { db, close } from "../../../src/db.mjs";
const q = (s, p) => db.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const r = await q(`SELECT result->'simulated' AS sim, result->'source' AS src, result->'outcome' AS outcome,
  jsonb_typeof(result->'tradelines') AS tl_t, jsonb_array_length(CASE WHEN jsonb_typeof(result->'tradelines')='array' THEN result->'tradelines' ELSE '[]'::jsonb END) AS tl_n,
  jsonb_array_length(CASE WHEN jsonb_typeof(result->'publicRecords')='array' THEN result->'publicRecords' ELSE '[]'::jsonb END) AS pr_n,
  jsonb_array_length(CASE WHEN jsonb_typeof(result->'inquiries')='array' THEN result->'inquiries' ELSE '[]'::jsonb END) AS inq_n,
  (SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(result->'tradelines')='array' THEN result->'tradelines' ELSE '[]'::jsonb END) t
     WHERE t::text ~* '(charge.?off|collection|late|derog|delinq)') AS neg_like
  FROM crs_results WHERE id='4849d176-b8db-4a02-ad27-ea9ae5ce559d'`);
console.log(JSON.stringify(r, null, 2));
await close?.(); process.exit(0);
