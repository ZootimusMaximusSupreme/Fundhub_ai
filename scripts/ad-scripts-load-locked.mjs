#!/usr/bin/env node
/**
 * Load the seven locked $297 ads into ad_scripts, each with its ad number.
 *
 * WHY. The ad-video pipeline matches a filmed take to a script by asking Claude
 * "which of these is it" — src/ad-videos/match.mjs — and it can only offer
 * scripts that are in ad_scripts AND carry an ad number. Measured 2026-09-24:
 * the table held one unrelated walkthrough and none of the locked ads, so the
 * very first real take failed at the match step with the right answer to the
 * wrong question.
 *
 * SOURCE. docs/ads/fundhub-297/FundHub-LOCKED-ADS.md, verbatim. Chris approved
 * those words; this copies them, it does not touch them.
 *
 * NUMBERS. 84–90, agent-set 2026-09-24. The registry's highest id is 83, no
 * ads row carries a number, and 1–7 were left alone on purpose: a low number
 * could collide with historical utm_content clicks that fundhub_ad_id()
 * would attribute to these ads. Next free above the top is collision-proof.
 *
 * SAFE TO RE-RUN. A number that already has a live script is skipped.
 *
 *   node --env-file=.env scripts/ad-scripts-load-locked.mjs          # dry-run
 *   node --env-file=.env scripts/ad-scripts-load-locked.mjs --apply
 */
import { readFileSync } from "node:fs";
import { asStaff } from "../src/partners/rls.mjs";
import { db, close } from "../src/db.mjs";

const SOURCE = new URL("../docs/ads/fundhub-297/FundHub-LOCKED-ADS.md", import.meta.url);
const FIRST_AD_ID = 84;
const APPLY = process.argv.includes("--apply");

/* One block per "## AD N — title". The body is every spoken paragraph up to the
   SHOOT note or the next rule line; the hook is the first spoken paragraph. */
function parseLockedAds(md) {
  const out = [];
  const re = /^## AD (\d+) — (.+)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(md))) heads.push({ n: Number(m[1]), title: m[2].trim(), at: m.index, end: re.lastIndex });
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const stop = md.indexOf("\n## ", h.end);
    let block = md.slice(h.end, stop === -1 ? undefined : stop);
    block = block.replace(/^`LOCKED[^`]*`\s*$/m, "");          // the lock line
    const shoot = block.indexOf("**SHOOT**");
    if (shoot !== -1) block = block.slice(0, shoot);
    block = block.replace(/^---\s*$/gm, "");
    const paras = block.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (!paras.length) continue;
    out.push({ n: h.n, title: `AD ${h.n} — ${h.title}`, hook: paras[0], body: paras.join("\n\n") });
  }
  return out;
}

const ads = parseLockedAds(readFileSync(SOURCE, "utf8"));
if (ads.length !== 7) {
  console.error(`expected 7 locked ads in the source, found ${ads.length}. Nothing was written.`);
  process.exit(1);
}

await asStaff(async (tx) => {
  const owner = (await tx.query(
    `SELECT id, org_id FROM partners WHERE slug = 'fundhub-house' ORDER BY created_at ASC LIMIT 1`
  )).rows[0];
  if (!owner) { console.error("no house partner (slug fundhub-house). Nothing was written."); process.exit(1); }

  for (const ad of ads) {
    const adId = String(FIRST_AD_ID + ad.n - 1);
    const exists = (await tx.query(
      `SELECT id FROM ad_scripts WHERE org_id = $1 AND ad_id = $2 AND archived_at IS NULL LIMIT 1`,
      [owner.org_id, adId]
    )).rows[0];
    if (exists) { console.log(`  keep   ${adId}  ${ad.title} (already loaded)`); continue; }
    if (!APPLY) { console.log(`  would load ${adId}  ${ad.title}  (${ad.body.split(/\s+/).length} words)`); continue; }
    await tx.query(
      `INSERT INTO ad_scripts (org_id, partner_id, title, body, hook_text, ad_id, script_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'ad_video')`,
      [owner.org_id, owner.id, ad.title, ad.body, ad.hook, adId]
    );
    console.log(`  loaded ${adId}  ${ad.title}`);
  }
}, { db });

console.log(APPLY ? "\nDone." : "\nDry run. Re-run with --apply.");
await close();
