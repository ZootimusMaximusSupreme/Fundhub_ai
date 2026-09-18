// Plain SELECTs only.
import { db, close } from "../../../src/db.mjs";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const q = (s, p) => db.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const cl = await q(`SELECT outcome_tier, custom_fields->>'diy_status' AS diy_status,
  custom_fields->>'closer_deck_letters_offer' AS cd_offer, custom_fields->>'closer_deck_letters_at' AS cd_at,
  custom_fields->>'diy_delivered_event_id' AS diy_ev, tags FROM clients WHERE id=$1`, [ID]);
const crs = await q(`SELECT id, created_at, status, (result ? 'bureaus') AS has_bureaus, result->>'outcome' AS outcome,
  jsonb_typeof(result->'normalized') AS norm FROM crs_results WHERE client_id=$1 ORDER BY created_at DESC LIMIT 5`, [ID]);
const ev = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position`);
console.log(JSON.stringify({ cl, crs, evCols: ev.map(r => r.column_name) }, null, 2));
await close?.(); process.exit(0);
