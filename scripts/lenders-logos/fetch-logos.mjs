#!/usr/bin/env node
/**
 * Get a real logo for every bank in the book that is missing one or has a wrong one.
 *
 * What it does, in plain English:
 *   1. Goes to the bank's own website.
 *   2. Checks the page actually says that bank's name. If it says a different
 *      company, we stop and report it — we never save another company's logo.
 *   3. Takes the picture the bank publishes for phone home screens, which is the
 *      real brand mark, and saves it as a PNG.
 *   4. Refuses anything too small to read, and refuses the specific junk pictures
 *      the previous run saved by mistake.
 *
 * Nothing is fetched when the site is shown. These are files on disk, downloaded
 * once. The website is not contacted when a screen loads.
 *
 * Usage:
 *   node scripts/lenders-logos/fetch-logos.mjs            # missing banks only
 *   node scripts/lenders-logos/fetch-logos.mjs --wrong    # replace wrong pictures
 *   node scripts/lenders-logos/fetch-logos.mjs --all
 *   node scripts/lenders-logos/fetch-logos.mjs --dry-run  # look, save nothing
 *   node scripts/lenders-logos/fetch-logos.mjs --out /path/to/public/assets/lenders
 *
 *   node --env-file=.env scripts/lenders-logos/fetch-logos.mjs --from-db
 *       Ask the CRM who is still missing a logo instead of using the list
 *       below. The hand-written list stops at the banks we had before the
 *       Carl Barton database landed; this covers all of them.
 *       --limit <n>        stop after n banks
 *       --skip <n>         skip the first n banks (after stable sort by slug)
 *       --exclude-slugs <file>  one slug per line — skip these (parallel lanes)
 *       --only-slugs <file>     fetch only these slugs (disjoint parallel lanes)
 *       --concurrency <n>  how many bank sites at once (default 6)
 *       --org <slug>       a different company
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISSING, WRONG, NOT_A_BANK } from "./targets.mjs";
import { readSiteIcons, siteBelongsToBank, saveImage, sleep } from "./sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);

const dryRun = has("--dry-run");
const fromDb = has("--from-db");
const doWrong = has("--wrong") || has("--all");
const doMissing = has("--all") || !has("--wrong");
const limit = Number(valueOf("--limit")) || 0;
const skip = Math.max(0, Number(valueOf("--skip")) || 0);
const concurrency = Math.max(1, Math.min(Number(valueOf("--concurrency")) || 6, 12));

// The logos are served from the main checkout's public folder. A worktree serves
// nothing, so the default points at the real asset folder.
const OUT_DIR = path.resolve(
  valueOf("--out") || path.join(ROOT, "public/assets/lenders")
);

/** @param {{slug:string,name:string,domain:string}} t @param {string} domain @param {"missing"|"wrong"} kind */
async function tryDomain(t, domain, kind) {
  const dest = path.join(OUT_DIR, `${t.slug}.png`);
  const site = await readSiteIcons(domain);

  if (!site.ok) {
    return { ...t, domain, kind, result: "no_logo", why: `website did not answer (${site.reason})` };
  }

  const owns = siteBelongsToBank(t.name, site, domain);
  if (!owns.ok) {
    return { ...t, domain, kind, result: "refused", why: owns.reason, title: site.title };
  }

  for (const url of site.candidates) {
    if (dryRun) {
      return {
        ...t,
        kind,
        result: "would_save",
        confirmed: owns.confirmed,
        why: `would take ${url} (${owns.reason})`,
        title: site.title
      };
    }
    const saved = await saveImage(url, dest);
    if (saved.ok) {
      return {
        ...t,
        kind,
        result: owns.confirmed ? "saved" : "saved_unconfirmed",
        confirmed: owns.confirmed,
        why: `${saved.width}x${saved.height} from ${saved.source}${owns.confirmed ? "" : ` — ${owns.reason}`}`,
        bytes: saved.bytes,
        title: site.title
      };
    }
  }
  return { ...t, domain, kind, result: "no_logo", why: "the website had no picture big enough to use", title: site.title };
}

/**
 * Try every address we have for this bank and keep the first one that works.
 * A bank from the hand-written list has one address; a bank read out of the
 * database has a few guesses.
 * @param {{slug:string,name:string,domain:string,domains?:string[]}} t
 * @param {"missing"|"wrong"} kind
 */
async function handle(t, kind) {
  const domains = t.domains?.length ? t.domains : [t.domain];
  let last = null;
  for (const domain of domains) {
    const r = await tryDomain(t, domain, kind);
    if (r.result === "saved" || r.result === "saved_unconfirmed" || r.result === "would_save") return r;
    last = r;
  }
  return last;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error("Logo folder does not exist:", OUT_DIR);
    process.exit(1);
  }

  /** @type {{slug:string,name:string,domain:string,kind:string}[]} */
  let targets = [];
  if (fromDb) {
    const { db, close } = await import("../../src/db.mjs");
    const { targetsFromDb } = await import("./targets-from-db.mjs");
    const slug = valueOf("--org") || process.env.DEFAULT_ORG_SLUG || "fundhub";
    try {
      const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [slug]);
      if (!org.rows[0]) {
        console.error("No company with the short name", slug);
        process.exit(1);
      }
      const found = await targetsFromDb(db, {
        orgId: org.rows[0].id,
        exists: (rel) => fs.existsSync(path.join(ROOT, "public", String(rel).replace(/^\//, "")))
      });
      targets = found.map((t) => ({ ...t, kind: "missing" }));
    } finally {
      await close();
    }
  } else {
    if (doMissing) targets.push(...MISSING.map((t) => ({ ...t, kind: "missing" })));
    if (doWrong) targets.push(...WRONG.map((t) => ({ ...t, kind: "wrong" })));
  }
  if (fromDb || skip > 0) {
    targets.sort((a, b) => a.slug.localeCompare(b.slug));
  }
  const readSlugFile = (p) =>
    new Set(
      fs
        .readFileSync(p, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  const onlyPath = valueOf("--only-slugs");
  const excludePath = valueOf("--exclude-slugs");
  if (onlyPath) {
    const allow = readSlugFile(onlyPath);
    targets = targets.filter((t) => allow.has(t.slug));
  } else if (excludePath) {
    const skipSlugs = readSlugFile(excludePath);
    targets = targets.filter((t) => !skipSlugs.has(t.slug));
  }
  if (skip > 0) targets = targets.slice(skip);
  if (limit > 0) targets = targets.slice(0, limit);

  console.log(
    `${dryRun ? "DRY RUN — " : ""}Looking up ${targets.length} banks. Saving into ${OUT_DIR}\n`
  );

  const results = [];
  let next = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const t = targets[i];
      let r;
      try {
        r = await handle(t, t.kind);
      } catch (e) {
        r = { ...t, result: "no_logo", why: `unexpected problem: ${e.message}` };
      }
      results.push(r);
      done++;
      console.log(`[${done}/${targets.length}] ${t.name} ... ${r.result} — ${r.why}`);
      await sleep(400); // be polite to the bank's website
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length || 1) }, worker));

  const by = (k) => results.filter((r) => r.result === k);
  console.log("\n================ WHAT HAPPENED ================");
  console.log(`Logos saved, confirmed:      ${by("saved").length}`);
  console.log(`Logos saved, needs an eye:   ${by("saved_unconfirmed").length}`);
  console.log(`Refused, would be wrong:     ${by("refused").length}`);
  console.log(`Still no logo:               ${by("no_logo").length}`);
  if (dryRun) console.log(`Would save:                  ${by("would_save").length}`);
  console.log(`Skipped, not a bank:         ${NOT_A_BANK.length} (${NOT_A_BANK.join(", ")})`);

  const sections = [
    ["saved_unconfirmed", "SAVED BUT UNCONFIRMED — a human should glance at these"],
    ["refused", "REFUSED — saving these would have put the wrong company's logo on the bank"],
    ["no_logo", "STILL NO LOGO"]
  ];
  for (const [label, heading] of sections) {
    const list = by(label);
    if (!list.length) continue;
    console.log(`\n--- ${heading} ---`);
    for (const r of list) console.log(`  ${r.name.padEnd(34)} ${r.why}`);
  }

  const reportPath = path.join(OUT_DIR, "..", "..", "..", "logo-run.json");
  if (!dryRun) {
    fs.writeFileSync(
      path.join(__dirname, "last-run.json"),
      JSON.stringify({ ran_at: new Date().toISOString(), out_dir: OUT_DIR, results }, null, 2)
    );
    console.log(`\nRun detail: ${path.join(__dirname, "last-run.json")}`);
  }
  void reportPath;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
