// Paid outbound guard for Oxylabs Apply — counts live proxy_sessions rows.

export const LIMITS = Object.freeze({
  dailyPerOrg: 80,
  staffCooldownSeconds: 60
});

const ENV_DAILY = "PROXY_LAUNCH_DAILY_CAP";
const ENV_COOLDOWN = "PROXY_LAUNCH_STAFF_COOLDOWN_SEC";
export const ENV_PROVE = "PROXY_LAUNCH_PROVE";
export const PROVE_HEADER = "x-fundhub-proxy-prove";

function intEnv(env, name, fallback) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function limitsFromEnv(env = process.env) {
  return {
    dailyPerOrg: intEnv(env, ENV_DAILY, LIMITS.dailyPerOrg),
    staffCooldownSeconds: intEnv(env, ENV_COOLDOWN, LIMITS.staffCooldownSeconds)
  };
}

/** Prove scripts must send PROVE_HEADER; server must set PROXY_LAUNCH_PROVE=1. */
export function proveLaunchAllowed(env = process.env, { proveRequested = false } = {}) {
  if (!proveRequested) return { ok: true };
  const raw = env?.[ENV_PROVE];
  const on = raw === "1" || String(raw).toLowerCase() === "true";
  if (on) return { ok: true };
  return {
    ok: false,
    code: "proxy_prove_disabled",
    message:
      "Live proxy prove is off on this deploy. Set PROXY_LAUNCH_PROVE=1 to run scripted Apply launches."
  };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string, retryAfterSeconds?: number }}
 */
export async function checkProxyLaunchLimits(db, {
  orgId,
  staffId,
  env = process.env,
  proveRequested = false,
  now = new Date()
} = {}) {
  const prove = proveLaunchAllowed(env, { proveRequested });
  if (!prove.ok) return { ok: false, code: prove.code, message: prove.message };

  if (env?.PROXY_LAUNCH_LIMITS_OFF === "1") return { ok: true };

  const limits = limitsFromEnv(env);
  if (limits.dailyPerOrg === 0 && limits.staffCooldownSeconds === 0) {
    return { ok: true };
  }

  const ts = now instanceof Date ? now.toISOString() : String(now);

  if (limits.dailyPerOrg > 0) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM proxy_sessions
        WHERE org_id = $1::uuid
          AND started_at >= date_trunc('day', $2::timestamptz)`,
      [orgId, ts]
    );
    const today = rows[0]?.n || 0;
    if (today >= limits.dailyPerOrg) {
      return {
        ok: false,
        code: "proxy_daily_cap",
        message: `Apply launch limit for today (${limits.dailyPerOrg}) is reached. Try again tomorrow.`
      };
    }
  }

  if (limits.staffCooldownSeconds > 0) {
    const { rows } = await db.query(
      `SELECT started_at FROM proxy_sessions
        WHERE org_id = $1::uuid AND staff_id = $2::uuid
        ORDER BY started_at DESC LIMIT 1`,
      [orgId, staffId]
    );
    const last = rows[0]?.started_at;
    if (last) {
      const elapsedMs = new Date(ts).getTime() - new Date(last).getTime();
      const needMs = limits.staffCooldownSeconds * 1000;
      if (elapsedMs < needMs) {
        const retryAfterSeconds = Math.ceil((needMs - elapsedMs) / 1000);
        return {
          ok: false,
          code: "proxy_staff_cooldown",
          message: `Wait ${retryAfterSeconds} seconds before launching Apply again.`,
          retryAfterSeconds
        };
      }
    }
  }

  return { ok: true };
}
