// HOLE 16 VERIFY — look only, on https://fundhub.ai, as the owner.
// Logs in by password (never printed), opens file #9's control panel, and reads
// the live client API that screen uses. Every non-GET request other than the
// login is BLOCKED, so this script cannot send, stage, upload or change anything.
// Screenshots go to the gitignored evidence folder.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const TAG = process.argv[2] || "before";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-16";
mkdirSync(SHOTS, { recursive: true });

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h16-fixer-verify" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" })
});
const setCookie = login.headers.get("set-cookie") || "";
const m = setCookie.match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (login.status !== 200 || !m) {
  console.log(JSON.stringify({ login: login.status, gotCookie: Boolean(m) }));
  process.exit(1);
}
const token = m[1];

// The live API the screen reads.
const api = await fetch(`${BASE}/api/dashboard/client?id=${NINE}`, { headers: { cookie: `fundhub_session=${token}` } });
const body = await api.json().catch(() => null);
const text = JSON.stringify(body || {});
const find = (re) => (text.match(re) || []).length;
const summary = {
  tag: TAG,
  at: new Date().toISOString(),
  login: login.status,
  apiStatus: api.status,
  apiTopKeys: body && typeof body === "object" ? Object.keys(body).slice(0, 40) : null,
  waitingOnReaderMentions: find(/Waiting on the document reader/g),
  byHandMentions: find(/by hand — nobody has read it/g),
  smsDoc02Mentions: find(/SMS-DOC-02/g),
  smsDoc03Mentions: find(/SMS-DOC-03/g),
  emailDoc03Mentions: find(/EMAIL-DOC-03/g)
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }
]);
const blocked = [];
await context.route("**/*", (route) => {
  const req = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
    blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
await page.goto(`${BASE}/app/client-control-panel.html?id=${NINE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
const pageText = await page.evaluate(() => document.body.innerText || "");
summary.page = {
  waitingOnReader: (pageText.match(/Waiting on the document reader/g) || []).length,
  byHand: (pageText.match(/nobody has read it/g) || []).length,
  docsApproved: /documents approved|Optimize Profile/i.test(pageText)
};
await page.screenshot({ path: `${SHOTS}/h16-${TAG}-control-panel-full.png`, fullPage: true });
const waitEl = page.getByText(/Waiting on the document reader/).first();
if (await waitEl.count()) {
  await waitEl.scrollIntoViewIfNeeded().catch(() => {});
  const box = await waitEl.boundingBox();
  summary.waitingBox = box;
  await page.screenshot({ path: `${SHOTS}/h16-${TAG}-waiting-task.png` });
}
summary.blocked = blocked;
await browser.close();
writeFileSync(`${SHOTS}/h16-${TAG}-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
