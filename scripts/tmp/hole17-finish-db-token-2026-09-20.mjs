// HOLE 17 — use latest unconsumed magic-link row (no new link request).
import "../load-env.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { db } from "../../src/db.mjs";
import { newToken, hashToken } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const CLIENT = "40f063e1-27e3-4857-be1a-91640eee90e1";
const EMAIL = "stanbridgejchris+sim-inquiry-20260827@gmail.com";
const DEPLOY = "6aae2d56762d7b6842d715f6";
const EVID = path.resolve("docs/workflows/full-launch-lattice-2026-09-20-evidence/hole17");
const SHOT_DIR = path.resolve("docs/workflows/lane-1/playwright/product-fail");
const OUT_JSON = path.join(SHOT_DIR, "hole17-finish-2026-09-20.json");

const prior = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
const out = {
  ...prior,
  at: new Date().toISOString(),
  deploy: DEPLOY,
};

// Mint one fresh token row for prove (staff e2e path — not hammering public endpoint).
const cleartext = newToken();
const ins = await db.query(
  `INSERT INTO account_magic_links
     (org_id, email, account_id, client_id, token_hash, expires_at, outcome)
   SELECT c.org_id, lower($2), a.id, c.id, $3, now() + interval '15 minutes', 'issued'
     FROM clients c
     LEFT JOIN accounts a ON a.org_id = c.org_id AND lower(a.email) = lower($2) AND a.kind = 'client'
    WHERE c.id = $1
    LIMIT 1
   RETURNING id`,
  [CLIENT, EMAIL, hashToken(cleartext)]
);

if (!ins.rows[0]) {
  out.verdict = "FAIL";
  out.reason = "could not insert prove magic-link row";
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  process.exit(1);
}
out.magicLinkRowId = ins.rows[0].id;
out.tokenProof = "e2e INSERT account_magic_links with client_id (no public rate limit)";

const browser = await chromium.launch({ headless: true });
const clientPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await clientPage.goto(`${BASE}/portal-login.html?t=${encodeURIComponent(cleartext)}`);
const ok = await clientPage
  .waitForURL(/client-portal\.html/, { timeout: 60_000 })
  .then(() => true)
  .catch(() => false);

if (!ok) {
  out.verdict = "FAIL";
  out.reason = "portal-login did not reach client-portal";
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

await clientPage.waitForTimeout(8000);
out.magicPortal = await clientPage.evaluate(() => {
  const banner = document.getElementById("fh-data-banner");
  const m = document.body.innerText.match(/live entitlements[^\n]*/);
  return {
    banner: banner?.textContent?.trim() || "",
    line: m?.[0]?.trim() || "",
    path: location.pathname + location.search,
  };
});

const magicShot = "hole17-finish-magic-link-2026-09-20.png";
fs.mkdirSync(EVID, { recursive: true });
await clientPage.screenshot({ path: path.join(SHOT_DIR, magicShot), fullPage: false });
await clientPage.screenshot({ path: path.join(EVID, magicShot), fullPage: false });
if (!out.shots.includes(magicShot)) out.shots.push(magicShot);

if (!out.magicPortal.line.includes("0 unlocked")) {
  out.verdict = "FAIL";
  out.reason = `magic portal footnote: ${JSON.stringify(out.magicPortal)}`;
} else {
  out.verdict = "PASS";
  out.reason = null;
}

fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(EVID, "hole17-finish-2026-09-20.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
await db.end?.();
