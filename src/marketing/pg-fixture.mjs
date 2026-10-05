// Shared fixture for the marketing/* endpoint tests (src/http/marketing-*.pg.test.mjs).
// Builds a throwaway org with an owner, an admin and a csm (a real role that is
// deliberately NOT in ROLE_SETS.MARKETING, so it is the shortest path to a 403),
// and tears it down. Never touches the default org's rows.

import { db } from "../db.mjs";
import { createSession } from "../auth/session.mjs";

export const mkRes = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  return r;
};

export const mkReq = (token, { method = "GET", query = {}, body, headers = {} } = {}) => ({
  method,
  query,
  body,
  headers: token ? { authorization: "Bearer " + token, ...headers } : { ...headers }
});

export async function makeMarketingOrg(slug) {
  const orgId = (await db.query(
    `INSERT INTO orgs (slug, name) VALUES ($1, $1)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [slug]
  )).rows[0].id;
  await wipeMarketingOrg(orgId, { keepOrg: true });
  const tokens = {};
  const ids = {};
  for (const role of ["owner", "admin", "csm"]) {
    const row = (await db.query(
      `INSERT INTO staff (org_id, email, name, role, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [orgId, `${slug}.${role}@example.com`, `${slug} ${role}`, role]
    )).rows[0];
    ids[role] = row.id;
    tokens[role] = (await createSession(db, { staffId: row.id, orgId })).token;
  }
  return { orgId, tokens, ids };
}

export async function wipeMarketingOrg(orgId, { keepOrg = false } = {}) {
  // Children first: ad_offer_tags and agent_requests reference marketing_offers.
  for (const t of [
    "ad_offer_tags", "agent_requests", "marketing_model_usage", "marketing_jobs", "marketing_requests",
    "marketing_buzzes", "marketing_shoots", "marketing_offers", "marketing_settings"
  ]) {
    await db.query(`DELETE FROM ${t} WHERE org_id = $1`, [orgId]);
  }
  if (keepOrg) return;
  await db.query(`DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE org_id = $1)`, [orgId]);
  await db.query(`DELETE FROM staff WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM orgs WHERE id = $1`, [orgId]);
}
