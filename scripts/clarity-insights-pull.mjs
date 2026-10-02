#!/usr/bin/env node
/**
 * Pull Microsoft Clarity export API into clarity_insights_snapshots.
 * Optional --cro prints CRO findings for the $297 roadmap funnel.
 *
 * Requires CLARITY_DATA_EXPORT_TOKEN + CLARITY_PROJECT_ID in env.
 * Token: Clarity project → Settings → Data Export → Generate API token.
 */
import pg from "pg";
import { runClarityOrgSync } from "../src/analytics/clarity-org-sync.mjs";
import {
  flattenClarityPayload,
  buildClarityCroFindings,
} from "../src/analytics/clarity-export.mjs";
import { asStaff } from "../src/partners/rls.mjs";
import { resolveDefaultOrg } from "../src/auth/org.mjs";

function argFlag(name) {
  return process.argv.includes(name);
}

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function loadLatestUrlPayload(db) {
  const orgId = await resolveDefaultOrg(db);
  return asStaff(async (tx) => {
    const row = (
      await tx.query(
        `SELECT payload, captured_at, num_of_days, query_key
           FROM clarity_insights_snapshots
          WHERE org_id = $1 AND query_key = 'URL'
          ORDER BY captured_at DESC
          LIMIT 1`,
        [orgId],
      )
    ).rows[0];
    return row ?? null;
  }, { db });
}

async function main() {
  const days = argNum("--days", 3);
  const withCro = argFlag("--cro");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL unset");
    process.exit(1);
  }

  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await db.connect();

  try {
    const result = await runClarityOrgSync({ db, numOfDays: days });
    console.log(JSON.stringify({ pull: result }, null, 2));

    if (!result.ok && result.synced === 0) {
      process.exit(result.message?.includes("unset") ? 2 : 1);
    }

    if (withCro) {
      const latest = await loadLatestUrlPayload(db);
      if (!latest) {
        console.log(JSON.stringify({ cro: { findings: [], note: "no URL snapshot yet" } }, null, 2));
        return;
      }
      const rows = flattenClarityPayload(latest.payload);
      const findings = buildClarityCroFindings(rows, { urlIncludes: "roadmap" });
      console.log(
        JSON.stringify(
          {
            cro: {
              asOf: latest.captured_at,
              numOfDays: latest.num_of_days,
              findings,
            },
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
