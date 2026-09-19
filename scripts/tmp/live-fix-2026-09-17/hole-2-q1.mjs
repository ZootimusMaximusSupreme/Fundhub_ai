// Plain SELECTs only.
import { db, close } from "../../../src/db.mjs";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const q = (s, p) => db.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const docs = await q(`SELECT subtype, title, generated_by, source_event_id, metadata, created_at FROM documents WHERE client_id=$1 ORDER BY created_at`, [ID]);
const tx = await q(`SELECT id, client_id, product_code, product, type, status, amount_cents, created_at, source FROM transactions WHERE id='08ae60ee-25cd-496e-96c9-c9ab522eebc6'`);
const tx2 = await q(`SELECT * FROM transactions WHERE id='08ae60ee-25cd-496e-96c9-c9ab522eebc6'`);
const pe = await q(`SELECT * FROM product_entitlements WHERE product_code ILIKE '%consult%' OR product_code ILIKE '%blueprint%'`);
const ev = await q(`SELECT id, type, name, created_at FROM events WHERE id='a480240c-5d33-4de6-8d00-6026cf9a5f82'`);
console.log(JSON.stringify({ docs, tx, tx2: tx2.map(r => Object.keys(r)), tx2row: tx2, pe, ev }, (k, v) => (/token|secret|password|ssn|dob|email|phone/i.test(k) ? "[x]" : v), 2));
await close?.();
process.exit(0);
