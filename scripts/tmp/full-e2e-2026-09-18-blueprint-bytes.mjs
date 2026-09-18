import { loadEnv } from "../load-env.mjs";
loadEnv();
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession, revokeSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const staff = (await db.query(`SELECT id, org_id FROM staff WHERE lower(email)=lower($1)`, ["chris@fundhub.ai"])).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }
]);

const docs = (
  await db.query(
    `SELECT id, title, mime_type, kind, subtype, byte_size, document_key
       FROM documents
      WHERE client_id = $1
        AND (kind IN ('deliverable','contract') OR mime_type ILIKE '%html%')
      ORDER BY created_at DESC`,
    [ELEVEN]
  )
).rows;

const out = [];
for (const doc of docs) {
  const mint = await ctx.request.get(`${BASE}/api/documents-download?id=${doc.id}`);
  const mintJson = await mint.json().catch(() => ({}));
  const signed = mintJson?.document?.download?.url || mintJson?.download?.url;
  const rec = {
    title: doc.title,
    mime_type: doc.mime_type,
    kind: doc.kind,
    byte_size: doc.byte_size,
    mintStatus: mint.status(),
    mintOk: mintJson.ok,
    hasSigned: typeof signed === "string"
  };
  if (typeof signed === "string") {
    const fileUrl = signed.startsWith("http") ? signed : BASE + signed;
    const fileRes = await ctx.request.get(fileUrl);
    const buf = await fileRes.body();
    const head = buf.slice(0, 8).toString("latin1");
    const ctype = fileRes.headers()["content-type"] || "";
    const text = head.startsWith("%PDF") ? "" : buf.toString("utf8").slice(0, 1200);
    rec.fileStatus = fileRes.status();
    rec.contentType = ctype.split(";")[0];
    rec.looksPdf = head.startsWith("%PDF");
    rec.looksHtml = /<!doctype html|<html[\s>]/i.test(text);
    rec.placeholder = /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i.test(text);
    rec.goldish = /credit optimization roadmap|funding snapshot|lender match|credit analysis/i.test(text);
    rec.snippet = text.replace(/\s+/g, " ").trim().slice(0, 220);
  }
  out.push(rec);
}
await browser.close();
await revokeSession(db, token);
writeFileSync("/tmp/e2e-2026-09-18-blueprint/bytes.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);
