// One marker row: "buy box version 2 went live on /roadmap at this time".
//
// Contract: docs/tracking/tracking-spec.md, "Buy box versions". Run ONCE, right
// after the /roadmap page with buy box v2 is live. It writes one events row
// through the normal emit():
//
//   name             funnel.buybox_version
//   payload          { version: 2, page: "/roadmap", deployed_at: <now, ISO> }
//   idempotency key  buybox-version:2
//
// The key makes a second run harmless: it saves nothing and says so, and the
// first deploy time stays. No handler listens to this name and nothing is sent
// to Inngest.
//
// Run (reads DATABASE_URL from the environment or the repo's .env):
//   node scripts/tracking/mark-buybox-version.mjs

import { pathToFileURL } from "node:url";

export const BUYBOX_VERSION = 2;
export const BUYBOX_PAGE = "/roadmap";
export const BUYBOX_EVENT = "funnel.buybox_version";
export const buyboxVersionKey = (version = BUYBOX_VERSION) => `buybox-version:${version}`;

/** The one row, written through emit(). → { id, deduped, payload }. */
export async function markBuyboxVersion(db, { emit, now = new Date(), orgId } = {}) {
  if (typeof emit !== "function") throw new Error("emit is required");
  const payload = { version: BUYBOX_VERSION, page: BUYBOX_PAGE, deployed_at: now.toISOString() };
  const out = await emit(db, BUYBOX_EVENT, payload, {
    ...(orgId ? { orgId } : {}),
    allowNonCanonical: true,
    skipInngest: true,
    idempotencyKey: buyboxVersionKey()
  });
  return { id: out?.id ?? null, deduped: out?.deduped === true, payload };
}

async function main() {
  const { loadEnv } = await import("../load-env.mjs");
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Nothing written.");
    process.exitCode = 1;
    return;
  }
  const { db, close, dbTarget } = await import("../../src/db.mjs");
  const { emit } = await import("../../src/events/bus.mjs");
  try {
    console.log(`database: ${dbTarget()}`);
    const out = await markBuyboxVersion(db, { emit });
    if (out.deduped) {
      console.log(`already marked — ${BUYBOX_EVENT} (${buyboxVersionKey()}) exists; nothing written.`);
    } else {
      console.log(`marked — ${BUYBOX_EVENT} id ${out.id}, deployed_at ${out.payload.deployed_at}`);
    }
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`mark-buybox-version failed: ${err?.message || err}`);
    process.exitCode = 1;
  });
}
