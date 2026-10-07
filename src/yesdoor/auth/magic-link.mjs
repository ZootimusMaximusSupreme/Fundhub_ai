// Yesdoor sign-in by emailed link. A COPY of src/auth/magic-link.mjs (spec §0.2,
// §1), pointed at yd_accounts / yd_magic_links, queueing into yd_outbox.
//
// Three properties, same as the original:
//   1. THE ANSWER IS THE SAME for an address we know and one we do not. `outcome`
//      is for the caller's logs and must never reach a response body.
//   2. A LINK WORKS ONCE. verifyMagicLink claims the row in a single UPDATE ...
//      WHERE consumed_at IS NULL AND expires_at > now() RETURNING, so two arrivals
//      cannot both win.
//   3. REQUESTING A LINK CREATES NOTHING. A renter's account is created at
//      verification, from the renter record the link was bound to. Building users
//      and brokers must already have an account (staff create those, B4).
//
// NOTHING HERE TRANSMITS. The email is a yd_outbox row with status 'queued'; the
// sandbox dispatcher (B4) marks it sent. The rendered context carries the URL and
// therefore the cleartext token. That is what an email is, and it is why a link
// lives 15 minutes and dies on first use.

import { newToken, hashToken, normalizeIp } from "../../auth/session.mjs";
import { YD_AUTH } from "../config.mjs";
import { createAccountSession, verifyAccountSession } from "./session.mjs";

export const MAGIC_LINK_TEMPLATE_KEY = "yd-magic-link";

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const truncate = (s, n) => (s == null ? null : String(s).slice(0, n));

export const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

/** Base URL of the Yesdoor site. YD_BASE_URL, else Netlify's URL, else yesdoor.ai. */
export function baseUrl(env = process.env) {
  return String(env.YD_BASE_URL || env.DEPLOY_PRIME_URL || env.URL || "https://yesdoor.ai").replace(/\/+$/, "");
}

/** Where the emailed link points: the page, not the API, so a mail scanner that
 *  follows every URL cannot spend the single use. The page POSTs the token. */
export function magicLinkUrl(token, env = process.env) {
  return `${baseUrl(env)}${YD_AUTH.loginPath}?t=${encodeURIComponent(token)}`;
}

/** checkLinkRate — requests recently, by address and by source. Counts every
 *  request, including the ones that matched nothing. */
export async function checkLinkRate(db, { orgId, email, ip, limits = YD_AUTH.linkLimits } = {}) {
  const r = await db.query(
    `SELECT
       (SELECT count(*) FROM yd_magic_links m
         WHERE m.org_id = $1 AND m.email = $2
           AND m.created_at > now() - ($4::int * interval '1 minute'))::int AS email_count,
       (SELECT count(*) FROM yd_magic_links m
         WHERE m.org_id = $1 AND $3::inet IS NOT NULL AND m.requested_ip = $3::inet
           AND m.created_at > now() - ($4::int * interval '1 minute'))::int AS ip_count`,
    [orgId, normalizeEmail(email), normalizeIp(ip), limits.windowMinutes]
  );
  const emailCount = Number(r.rows[0].email_count);
  const ipCount = Number(r.rows[0].ip_count);
  return {
    limited: emailCount >= limits.maxPerEmail || ipCount >= limits.maxPerIp,
    emailCount, ipCount, retryAfterMinutes: limits.windowMinutes
  };
}

/* What, if anything, may this address sign in as?
     an active account exists  -> issue against it
     a renter has this email   -> issue against the renter (account made at verify)
     neither                   -> no_account
   A suspended account is refused SILENTLY (the caller still gets the uniform reply). */
async function resolveSubject(db, orgId, email) {
  const acct = await db.query(
    `SELECT id, status FROM yd_accounts WHERE org_id = $1 AND email = $2 LIMIT 1`, [orgId, email]);
  if (acct.rows[0]) {
    return acct.rows[0].status === "active"
      ? { outcome: "issued", accountId: acct.rows[0].id, renterId: null }
      : { outcome: "not_eligible", accountId: acct.rows[0].id, renterId: null };
  }
  const renter = await db.query(
    `SELECT id FROM yd_renters WHERE org_id = $1 AND email = $2 LIMIT 1`, [orgId, email]);
  if (renter.rows[0]) return { outcome: "issued", accountId: null, renterId: renter.rows[0].id };
  return { outcome: "no_account", accountId: null, renterId: null };
}

/** requestMagicLink — an address in, a uniform answer out.
 *    { ok:true, limited:false, outcome, sent, token?, linkId?, expiresAt? }
 *    { ok:true, limited:true, retryAfterMinutes }
 *    { ok:false, status:400, error:'email_required' } */
export async function requestMagicLink(db, { email, ip, userAgent, orgId, env = process.env, queueEmail = true } = {}) {
  const mail = normalizeEmail(email);
  if (!mail || !LOOKS_LIKE_EMAIL.test(mail)) return { ok: false, status: 400, error: "email_required" };
  if (!orgId) throw new Error("orgId required");
  const addr = normalizeIp(ip);

  // The limit is checked BEFORE the address is looked up, so a throttled answer
  // cannot reveal which addresses resolve to something.
  const limit = await checkLinkRate(db, { orgId, email: mail, ip: addr });
  if (limit.limited) return { ok: true, limited: true, retryAfterMinutes: limit.retryAfterMinutes };

  const subject = await resolveSubject(db, orgId, mail);
  if (subject.outcome !== "issued") {
    await db.query(
      `INSERT INTO yd_magic_links (org_id, email, account_id, renter_id, outcome, requested_ip, requested_user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, mail, subject.accountId, subject.renterId, subject.outcome, addr, truncate(userAgent, 512)]
    );
    return { ok: true, limited: false, outcome: subject.outcome, sent: false };
  }

  const issued = await issueMagicLink(db, {
    orgId, email: mail, accountId: subject.accountId, renterId: subject.renterId,
    ip: addr, userAgent, env, queueEmail
  });
  return { ok: true, limited: false, outcome: "issued", ...issued };
}

/** issueMagicLink — mint one single-use link for an address that is already known
 *  to reach an account (or a renter), and queue the email that carries it. No rate
 *  limit and no lookup: the caller has decided this address may have a link.
 *  Used by requestMagicLink (a person asked) and by staff creating a login (the
 *  invitation). Pass a transaction client to make it land with the caller's writes.
 *    { sent, token, linkId, expiresAt }
 *  The cleartext token is for the email only: never put it in a response. */
export async function issueMagicLink(db, {
  orgId, email, accountId = null, renterId = null, ip = null, userAgent = null, env = process.env, queueEmail = true
} = {}) {
  const mail = normalizeEmail(email);
  const token = newToken();
  const expiresAt = new Date(Date.now() + YD_AUTH.linkTtlMinutes * 60 * 1000);
  const ins = await db.query(
    `INSERT INTO yd_magic_links
       (org_id, email, account_id, renter_id, token_hash, expires_at, outcome, requested_ip, requested_user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,'issued',$7,$8) RETURNING id`,
    [orgId, mail, accountId, renterId, hashToken(token), expiresAt, normalizeIp(ip), truncate(userAgent, 512)]
  );
  const linkId = ins.rows[0].id;

  let sent = false;
  if (queueEmail) {
    await db.query(
      `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind, related_id)
       VALUES ($1,'email',$2,$3,$4::jsonb,'magic_link',$5)`,
      [orgId, mail, MAGIC_LINK_TEMPLATE_KEY,
       JSON.stringify({ magic_link: { url: magicLinkUrl(token, env), expires_minutes: String(YD_AUTH.linkTtlMinutes) } }),
       linkId]
    );
    sent = true;
  }
  return { sent, token, linkId, expiresAt };
}

/** verifyMagicLink — a token in, an account session out.
 *    { ok:true, token, expiresAt, principal } | { ok:false, status, error }
 *  EVERY failure is the same failure (401 invalid_link): forged, expired, spent,
 *  and "account suspended after the link was sent" are indistinguishable. */
export async function verifyMagicLink(db, token, { ip, userAgent } = {}) {
  if (!token || typeof token !== "string") return { ok: false, status: 400, error: "token_required" };

  // THE CLAIM: one statement, so single use is a database guarantee.
  const claim = await db.query(
    `UPDATE yd_magic_links
        SET consumed_at = now(), consumed_ip = $2, consumed_user_agent = $3
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING id, org_id, email, account_id, renter_id`,
    [hashToken(token), normalizeIp(ip), truncate(userAgent, 512)]
  );
  const link = claim.rows[0];
  if (!link) return { ok: false, status: 401, error: "invalid_link" };

  let accountId = null;
  if (link.account_id) {
    const a = await db.query(
      `SELECT id FROM yd_accounts WHERE id = $1 AND org_id = $2 AND status = 'active'`,
      [link.account_id, link.org_id]);
    accountId = a.rows[0] ? a.rows[0].id : null;
  } else if (link.renter_id) {
    // Provisioned here, once the link has proved the address reaches the person.
    // Written to lose gracefully if two links verify at the same instant.
    await db.query(
      `INSERT INTO yd_accounts (org_id, kind, email, renter_id)
       VALUES ($1,'renter',$2,$3) ON CONFLICT DO NOTHING`,
      [link.org_id, link.email, link.renter_id]);
    const a = await db.query(
      `SELECT id FROM yd_accounts WHERE org_id = $1 AND renter_id = $2 AND status = 'active'`,
      [link.org_id, link.renter_id]);
    accountId = a.rows[0] ? a.rows[0].id : null;
  }
  if (!accountId) return { ok: false, status: 401, error: "invalid_link" };

  const session = await createAccountSession(db, { accountId, orgId: link.org_id, ip, userAgent });
  await db.query(`UPDATE yd_accounts SET last_login_at = now() WHERE id = $1`, [accountId]);
  const verified = await verifyAccountSession(db, session.token);
  if (!verified) return { ok: false, status: 401, error: "invalid_link" };
  return { ok: true, token: session.token, expiresAt: session.expiresAt, principal: verified.principal };
}
