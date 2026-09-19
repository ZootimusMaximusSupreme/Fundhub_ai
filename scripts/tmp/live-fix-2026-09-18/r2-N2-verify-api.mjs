// N2 VERIFY (live API) — signs in as the owner and reads the same list a staff
// screen reads for payment links: GET /api/payment-links?client_id=<id>, for
// each Sim file. Only the sign-in POST is sent; everything else is a GET.
// Never prints a password, token or cookie. Writes the answer to the N2
// evidence folder as <tag>.json.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N2-verify-api.mjs [tag]
import { request } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TAG = process.argv[2] || "api-before";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N2";
mkdirSync(OUT, { recursive: true });

const SIMS = {
  "#8": "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  "#9": "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  "#10": "22103bca-0ec9-4491-bb75-5d1b6528f116",
  "#11": "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  "#12": "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  Combo: "567c12ce-64de-4043-aa98-d842434bd267",
};

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const ctx = await request.newContext({ baseURL: BASE });
const login = await ctx.post("/api/auth/login", { data: { email: "chris@fundhub.ai", password } });
const out = { at: new Date().toISOString(), tag: TAG, login: login.status(), files: {} };
if (login.status() !== 200) {
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

for (const [who, id] of Object.entries(SIMS)) {
  const r = await ctx.get(`/api/payment-links?client_id=${id}`);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  out.files[who] = {
    status: r.status(),
    links: (j?.items || [])
      .filter((l) => l.purpose === "deposit" || l.purpose === "repair")
      .map((l) => ({
        id: l.id, purpose: l.purpose, amount: l.amount_display, status: l.status,
        link_ref: l.link_ref, paid_amount: l.paid_amount_display, paid_at: l.paid_at,
      })),
  };
}
await ctx.dispose();
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
