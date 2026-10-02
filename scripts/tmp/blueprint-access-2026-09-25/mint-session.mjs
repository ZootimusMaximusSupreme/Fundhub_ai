/* Mint a portal session for the paid buyer (same primitive the magic-link
   verify endpoint uses) so the second click pass does not burn a sign-in link. */
import { loadEnv } from "../../load-env.mjs";
loadEnv();
import pg from "pg";
import { createAccountSession } from "../../../src/auth/account-session.mjs";
const CLIENT = process.argv[2] || "735fc67e-ed83-4ab8-bc12-039c19a52d14";
const ORG = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const a = await c.query(`SELECT id FROM accounts WHERE client_id=$1 AND status='active'`, [CLIENT]);
const s = await createAccountSession(c, { accountId: a.rows[0].id, orgId: ORG });
console.log(JSON.stringify({ token: s.token, accountId: a.rows[0].id, clientId: CLIENT }));
await c.end();
