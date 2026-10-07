// Yesdoor account sessions: renter, building user and broker.
//
// A COPY of the Fundhub pattern (src/auth/account-session.mjs), pointed at the
// yd_ tables (spec §0.2: copied in as starting code, not shared live). The token
// primitives come from the one allowlisted import, src/auth/session.mjs: 32 CSPRNG
// bytes, only sha256(token) stored, never the token.
//
// A session lasts 30 days (YD_AUTH.sessionTtlDays) and slides: every successful
// verify pushes expires_at out again. Staff do NOT use this; staff sign in through
// the existing staff login (requireAuth) and are checked in ./principal.mjs.

import { newToken, hashToken, normalizeIp } from "../../auth/session.mjs";
import { YD_AUTH } from "../config.mjs";

const truncate = (s, n) => (s == null ? null : String(s).slice(0, n));
const ttlMs = () => YD_AUTH.sessionTtlDays * 24 * 60 * 60 * 1000;

/** createAccountSession — mint a session for an account. Returns the ONLY copy of
 *  the cleartext token: { token, sessionId, expiresAt }. */
export async function createAccountSession(db, { accountId, orgId, ip, userAgent } = {}) {
  if (!accountId) throw new Error("accountId required");
  if (!orgId) throw new Error("orgId required");
  const token = newToken();
  const expiresAt = new Date(Date.now() + ttlMs());
  const r = await db.query(
    `INSERT INTO yd_sessions (org_id, account_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, expires_at`,
    [orgId, accountId, hashToken(token), expiresAt, normalizeIp(ip), truncate(userAgent, 512)]
  );
  return { token, sessionId: r.rows[0].id, expiresAt: r.rows[0].expires_at };
}

/** verifyAccountSession — token → { principal, session } or null.
 *
 *  One statement checks liveness and slides the expiry, so two concurrent requests
 *  cannot race a session past its end. The account must still be active: a
 *  suspension takes effect on the next request. */
export async function verifyAccountSession(db, token) {
  if (!token || typeof token !== "string") return null;
  const r = await db.query(
    `UPDATE yd_sessions s
        SET last_seen_at = now(),
            expires_at = now() + ($2::int * interval '1 day')
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND EXISTS (SELECT 1 FROM yd_accounts a
                     WHERE a.id = s.account_id AND a.org_id = s.org_id AND a.status = 'active')
      RETURNING s.id, s.account_id, s.org_id, s.expires_at`,
    [hashToken(token), YD_AUTH.sessionTtlDays]
  );
  const s = r.rows[0];
  if (!s) return null;

  const a = await db.query(
    `SELECT id, org_id, kind, email, renter_id, broker_id
       FROM yd_accounts WHERE id = $1 AND org_id = $2`, [s.account_id, s.org_id]);
  const acct = a.rows[0];
  if (!acct) return null;

  let buildingIds = [];
  if (acct.kind === "building_user") {
    const b = await db.query(
      `SELECT building_id FROM yd_account_buildings
        WHERE account_id = $1 AND org_id = $2 AND removed_at IS NULL
        ORDER BY created_at, id`, [acct.id, acct.org_id]);
    buildingIds = b.rows.map((x) => x.building_id);
  }

  return {
    principal: {
      kind: acct.kind,                 // 'renter' | 'building_user' | 'broker'
      accountId: acct.id,
      orgId: acct.org_id,
      email: acct.email,
      renterId: acct.renter_id,
      brokerId: acct.broker_id,
      buildingIds
    },
    session: { id: s.id, expiresAt: s.expires_at }
  };
}

/** revokeAccountSession — by cleartext token; true if this call revoked it. */
export async function revokeAccountSession(db, token) {
  if (!token) return false;
  const r = await db.query(
    `UPDATE yd_sessions SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id`, [hashToken(token)]);
  return r.rows.length > 0;
}

/** sessionTokenFromRequest — Authorization: Bearer, x-session-token, or the
 *  yesdoor_session cookie. Never the query string: that lands in access logs. */
export function sessionTokenFromRequest(req) {
  const h = req?.headers || {};
  const get = (name) => {
    if (h[name] !== undefined) return h[name];
    for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
    return undefined;
  };
  const auth = get("authorization");
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const direct = get("x-session-token");
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const cookie = get("cookie");
  if (typeof cookie === "string") {
    for (const part of cookie.split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      if (part.slice(0, eq).trim() === YD_AUTH.sessionCookie) {
        const raw = part.slice(eq + 1).trim();
        try { return decodeURIComponent(raw); } catch { return raw; }
      }
    }
  }
  return null;
}
