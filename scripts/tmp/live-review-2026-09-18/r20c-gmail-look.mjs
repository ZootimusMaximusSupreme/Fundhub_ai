// r20c — read-only look at prove Gmail from the laptop token, to find live's footprints.
// Every request except GET and the Google token refresh is refused before it leaves.
// Prints counts, dates, label names and history ids only — never senders, bodies, names,
// phones or any token.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-review-2026-09-18/r20c-gmail-look.mjs
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../../src/gmail/index.mjs";
import { BLAKE_GMAIL_QUERY, PROCESSED_LABEL } from "../../../src/staff/blake-lead.mjs";

let bearer = null;
async function guardedFetch(url, init = {}) {
  const u = new URL(String(url));
  const method = String(init.method || "GET").toUpperCase();
  const isRefresh = u.host === "oauth2.googleapis.com" && u.pathname === "/token";
  if (method !== "GET" && !isRefresh) throw new Error(`guard: refused ${method} ${u.pathname}`);
  if (init.headers?.authorization) bearer = init.headers.authorization;
  return fetch(url, init);
}
async function rawGet(path, query = {}) {
  const u = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x)); else if (v != null) u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: { authorization: bearer } });
  const j = await res.json();
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${j?.error?.message}`);
  return j;
}

const cfg = gmailConfigFromEnv(process.env);
console.log(`laptop src/gmail: ready=${cfg.ready} tokenSource=${cfg.tokenSource}`);
if (!cfg.ready) process.exit(0);
const client = createGmailClientFromConfig(cfg, { fetchImpl: guardedFetch });
const prof = await client.getProfile();
console.log(`checked ${new Date().toISOString()} mailbox domain=${String(prof.emailAddress).split("@")[1]} historyId=${prof.historyId} messagesTotal=${prof.messagesTotal}`);

const labels = (await rawGet("/labels")).labels || [];
const blake = labels.find((l) => l.name === PROCESSED_LABEL);
console.log(`label ${PROCESSED_LABEL}: ${blake ? `exists id=${blake.id}` : "MISSING"}`);

async function list(q, labelIds) {
  const out = [];
  let pageToken;
  do {
    const j = await rawGet("/messages", { q, maxResults: 100, pageToken, labelIds });
    out.push(...(j.messages || []));
    pageToken = j.nextPageToken;
  } while (pageToken && out.length < 300);
  return out;
}
async function meta(id) {
  const m = await rawGet(`/messages/${id}`, { format: "minimal" });
  return { id, internal: new Date(Number(m.internalDate)).toISOString(), historyId: m.historyId, blakeLabel: (m.labelIds || []).includes(blake?.id) };
}

const pending = await list(BLAKE_GMAIL_QUERY);
console.log(`Blake mail waiting (query, not labelled, last 3d): ${pending.length}`);
for (const p of pending) console.log("  waiting", JSON.stringify(await meta(p.id)));
if (blake) {
  const done = await list(`newer_than:7d`, [blake.id]);
  console.log(`messages carrying ${PROCESSED_LABEL} (last 7d): ${done.length}`);
  for (const p of done) console.log("  labelled", JSON.stringify(await meta(p.id)));
}
