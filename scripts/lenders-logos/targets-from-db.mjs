/**
 * Work out which banks in the CRM still have no logo, and where each one's
 * logo might live.
 *
 * The hand-written list in targets.mjs covers the banks we had before. It does
 * not cover the 766 that came in with the Carl Barton database, and nobody is
 * going to type out 766 web addresses. So this asks the database who is still
 * missing a picture and works the address out.
 *
 * A web address here is a GUESS, exactly as targets.mjs says its own are. It is
 * never trusted. fetch-logos.mjs still reads the page and refuses anything that
 * does not name the bank, so a wrong guess costs a few seconds and saves
 * nothing.
 */

import { slugFromName, normalizeName } from "../../src/lenders/tips.mjs";

/* Apply links that are a shared application portal, not a bank's own website.
   Six hundred of the new banks apply through one of these, so their link tells
   us nothing about where the bank lives. */
const SHARED_PORTALS = [
  "creditcardlearnmore.com",
  "mycommunitycc.com",
  "mycardapply.com",
  "thecardservicescenter.com",
  "elancreditcard.com",
  "cardmemberservices.com",
  "onlinecardapply.com",
  "bankcardservices.net"
];

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isSharedPortal(host) {
  return !!host && SHARED_PORTALS.some((p) => host === p || host.endsWith(`.${p}`));
}

/** Letters and digits only — "Bank of Clarke County" becomes bankofclarkecounty. */
function squash(name) {
  return String(name || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

/**
 * Addresses worth trying for a bank, best first.
 *
 * The bank's own apply link is the only real fact here, so it goes first. After
 * that these are the shapes a bank's address usually takes: the name run
 * together with .com, the .bank ending banks were given, and for a credit union
 * the short "cu" form and the .org ending they tend to use.
 *
 * @param {{ name: string, application_url?: string|null }} row
 * @returns {string[]}
 */
export function domainCandidates(row) {
  const out = [];
  const push = (d) => { if (d && d.length > 4 && !out.includes(d)) out.push(d); };

  const fromLink = hostOf(row.application_url);
  if (fromLink && !isSharedPortal(fromLink)) push(fromLink);

  const plain = normalizeName(row.name);
  const full = squash(plain);
  const isCU = /credit union|federal credit|\bfcu\b|\bcu\b/i.test(plain);

  push(`${full}.com`);
  if (isCU) {
    push(`${full}.org`);
    push(`${squash(plain.replace(/federal credit union/i, "cu").replace(/credit union/i, "cu"))}.com`);
    push(`${squash(plain.replace(/federal credit union/i, "cu").replace(/credit union/i, "cu"))}.org`);
  }
  push(`${full}.bank`);

  return out;
}

/**
 * Every bank the CRM holds that has no logo file, with addresses to try.
 *
 * @param {import("pg").Pool|object} db
 * @param {{ orgId: string, exists: (relPath: string) => boolean }} opts
 */
export async function targetsFromDb(db, { orgId, exists }) {
  const r = await db.query(
    `SELECT name, application_url, logo_path
       FROM lenders
      WHERE org_id = $1::uuid AND COALESCE(active, true) = true
      ORDER BY priority_tier NULLS LAST, lower(name)`,
    [orgId]
  );

  const bySlug = new Map();
  for (const row of r.rows) {
    const slug = slugFromName(normalizeName(row.name));
    if (bySlug.has(slug)) continue;
    // A row already pointing at a file, or a file already sitting on disk under
    // this bank's slug, means there is nothing to fetch.
    if (row.logo_path && exists(row.logo_path)) continue;
    if (exists(`/assets/lenders/${slug}.png`)) continue;
    const domains = domainCandidates(row);
    if (!domains.length) continue;
    bySlug.set(slug, { slug, name: normalizeName(row.name), domain: domains[0], domains });
  }
  return [...bySlug.values()];
}
