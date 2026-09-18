// N8 — look only, through the live APIs the staff screens use.
// Signs in (the one POST), then GETs:
//   /api/read/repair-cases            the Repair desk list (stage per file)
//   /api/read/conversations?client_id the staff Messaging threads for a file
//   /api/read/messages?conversation_id what was sent inside each thread
// Never prints a password, token, cookie, full phone or full email.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n8-api.mjs [tag]
import { writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8";
const TAG = process.argv[2] || "api";
const FILES = {
  "Sim Combo-20260918": "567c12ce-64de-4043-aa98-d842434bd267",
  "Sim Nine-Repair": "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  "Sim Ten-Trial": "22103bca-0ec9-4491-bb75-5d1b6528f116"
};

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n8-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" })
});
const m = (login.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const H = { cookie: `fundhub_session=${m && m[1]}`, accept: "application/json" };
const out = { at: new Date().toISOString(), tag: TAG, loginStatus: login.status, desk: [], threads: {} };

const desk = await fetch(`${BASE}/api/read/repair-cases`, { headers: H });
const dj = await desk.json().catch(() => null);
const list = dj?.cases || dj?.files || dj?.items || dj?.rows || (Array.isArray(dj) ? dj : []);
out.deskStatus = desk.status;
out.deskKeys = dj && typeof dj === "object" ? Object.keys(dj) : null;
for (const r of list) {
  if (!/^(sim|walk)/i.test(String(r.name || ""))) continue;
  out.desk.push({ name: r.name, stage_key: r.stage_key, stage_label: r.stage_label, address_ok: r.address_ok });
}
console.log("desk", desk.status, JSON.stringify(out.deskKeys), JSON.stringify(out.desk));

for (const [name, id] of Object.entries(FILES)) {
  const cv = await fetch(`${BASE}/api/read/conversations?client_id=${id}`, { headers: H });
  const cj = await cv.json().catch(() => null);
  const convs = cj?.conversations || cj?.items || cj?.rows || [];
  const sent = [];
  for (const conv of convs) {
    const ms = await fetch(`${BASE}/api/read/messages?conversation_id=${conv.id}&limit=200`, { headers: H });
    const mj = await ms.json().catch(() => null);
    for (const msg of mj?.messages || mj?.items || mj?.rows || []) {
      if (msg.direction !== "outbound") continue;
      sent.push({ at: msg.created_at, channel: msg.channel, template_key: msg.template_key || null, status: msg.status, subject: msg.subject || null, starts: String(msg.body || msg.rendered_body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 90) });
    }
  }
  sent.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  out.threads[name] = { conversationsStatus: cv.status, conversationKeys: cj && typeof cj === "object" ? Object.keys(cj) : null, conversations: convs.length, sent };
  const asks = sent.filter((s) => /DOC-01|ID-PORTAL/.test(s.template_key || ""));
  console.log(name, "conv status", cv.status, "threads", convs.length, "outbound", sent.length, "id/proof asks", JSON.stringify(asks));
}
writeFileSync(`${EVID}/${TAG}.json`, JSON.stringify(out, null, 1));
