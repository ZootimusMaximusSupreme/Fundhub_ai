// Which company's Yesdoor book a PUBLIC (no-login) request reads.
//
// Public endpoints have no session to take an org from, and the org is never a
// request parameter (a caller-chosen org on a public door is a lead list handed to
// anyone). It is the deployment's own: orgs.slug = YD_ORG_SLUG, default 'yesdoor'
// (seeded by db/seed/296). Cached per slug for the life of the process.

const cache = new Map();

export const orgSlug = (env = process.env) => String(env.YD_ORG_SLUG || "yesdoor").trim() || "yesdoor";

export async function resolveYdOrgId(db, env = process.env) {
  const slug = orgSlug(env);
  if (cache.has(slug)) return cache.get(slug);
  const r = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [slug]);
  if (!r.rows[0]) throw new Error(`yesdoor org "${slug}" not found — run migrations`);
  cache.set(slug, r.rows[0].id);
  return r.rows[0].id;
}

/** For tests that create the org after a lookup missed. */
export const _resetYdOrgCache = () => cache.clear();
