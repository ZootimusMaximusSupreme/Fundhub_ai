// Hole 22 — look only. What the live portal asks Combo for (ID, proof of address, address).
// GET only. Never prints passwords, tokens or cookies.
const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h22-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const H = { cookie: `fundhub_session=${m && m[1]}`, accept: "application/json" };
const a = await fetch(`${BASE}/api/read/portal-summary?client_id=${COMBO}`, { headers: H });
const d = await a.json().catch(() => null);
const s = JSON.stringify(d);
console.log("status", a.status, JSON.stringify({ soft_pull_complete: d?.soft_pull_complete, doc_agent_message: d?.doc_agent_message, documents: d?.documents, repair_path: d?.repair_path, dispute_consent: d?.dispute_consent, stage: d?.stage }, null, 1));
for (const src of ["proof of address", "photo id", "address", "upload"]) {
  const hits = [...s.matchAll(new RegExp(`.{0,120}${src}.{0,120}`, "ig"))].slice(0, 6).map((x) => x[0]);
  console.log(src, hits.length, JSON.stringify(hits, null, 1));
}
