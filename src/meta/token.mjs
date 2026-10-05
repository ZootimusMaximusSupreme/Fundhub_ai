// Where the Conversions API access token comes from.
//
// Contract: "Token and settings" in the Phase 4 contract section of
// docs/tracking/meta-events.md.
//
//   1. META_CAPI_ACCESS_TOKEN, when it is set, wins.
//   2. Otherwise the Meta connection stored encrypted in ad_platform_connections
//      (platform 'meta', the most recent row that holds a token), read in staff
//      context (asStaff, src/partners/rls.mjs — the same boundary crossing
//      src/workflows/meta-campaign-sync-sweeper.mjs uses for this table) and
//      decrypted the way api/campaigns/sync.mjs does it: decryptToken from
//      src/adplatforms/tokens.mjs with the row's partner_id.
//
// Cached per function instance: a found token for TOKEN_TTL_MS, a miss for
// MISS_TTL_MS, so a hot function does not read and decrypt on every event.
//
// THE TOKEN NEVER LEAVES THIS MODULE EXCEPT TO THE SENDER. Never logged, never
// returned in an error, never stored. Log lines and reasons name the source
// (env var name, table name), never the value.

import { asStaff } from "../partners/rls.mjs";
import { decryptToken } from "../adplatforms/tokens.mjs";

export const TOKEN_TTL_MS = 5 * 60 * 1000;
export const MISS_TTL_MS = 30 * 1000;

export const STORED_TOKEN_SQL =
  `SELECT partner_id, encrypted_access_token
     FROM ad_platform_connections
    WHERE platform = 'meta'
      AND encrypted_access_token IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1`;

let cache = null; // { token, reason, at }

/** Forget the cached token. Tests, and nothing else. */
export function clearMetaTokenCache() {
  cache = null;
}

async function readStored({ env, db, scope }) {
  const run = typeof scope === "function"
    ? scope
    : (fn) => asStaff(fn, typeof db?.connect === "function" ? { pool: () => db } : undefined);
  let rows;
  try {
    rows = await run((tx) => tx.query(STORED_TOKEN_SQL).then((r) => r.rows));
  } catch {
    return { token: null, reason: "the stored Meta connection could not be read (ad_platform_connections)" };
  }
  const row = rows?.[0];
  if (!row) {
    return {
      token: null,
      reason: "no Meta token: META_CAPI_ACCESS_TOKEN is not set and ad_platform_connections has no meta row with a stored token"
    };
  }
  let token;
  try {
    token = decryptToken(row.encrypted_access_token, { partnerId: row.partner_id, env });
  } catch {
    return { token: null, reason: "the stored Meta token did not decrypt (AD_TOKEN_ENC_KEY, ad_platform_connections)" };
  }
  return token
    ? { token, reason: null }
    : { token: null, reason: "the stored Meta token is empty (ad_platform_connections)" };
}

/**
 * → { token, source: "env" | "stored" } or { token: null, reason }.
 * Never throws. `reason` names where it looked, never a value.
 *
 * deps: env, db (a pg Pool is used for the staff read when it has connect()),
 * scope (a stand-in for asStaff, for tests), now.
 */
export async function getMetaCapiToken({ env = process.env, db, scope, now = Date.now() } = {}) {
  const fromEnv = String(env?.META_CAPI_ACCESS_TOKEN ?? "").trim();
  if (fromEnv) return { token: fromEnv, source: "env" };

  if (cache && now - cache.at < (cache.token ? TOKEN_TTL_MS : MISS_TTL_MS)) {
    return cache.token ? { token: cache.token, source: "stored" } : { token: null, reason: cache.reason };
  }
  const out = await readStored({ env, db, scope });
  cache = { token: out.token, reason: out.reason, at: now };
  return out.token ? { token: out.token, source: "stored" } : { token: null, reason: out.reason };
}
