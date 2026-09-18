// N11 — dry run of the FIXED sendTemplated against the LIVE templates and the
// live Sim #13 record, WITHOUT writing anything.
//
// Every SELECT goes to live inside BEGIN READ ONLY. Every write sendTemplated
// would make (the messages row, the message.queued event, the thread) is caught
// here and never reaches the database — and because the event insert answers
// "already there", emit() never fans out to the job cloud either.
//
// For each of the 22 live templates holding {{unsubscribe}}: render it for #13
// with the fixed code, then run the dispatcher's own footer step and the real
// send gate over it, exactly as the dispatcher would.
//
// SIGNING: the laptop's UNSUBSCRIBE_TOKEN_SECRET is a Netlify mask (too short),
// so run with UNSUBSCRIBE_TOKEN_SECRET= (empty, THIS process only) and the
// signer falls back to DOCUMENT_URL_SECRET. The links minted here therefore do
// NOT verify on live — they prove the rendering, not the live secret.
// Prints no address and no signature.
import pg from "pg";
import { sendTemplated } from "../../../src/workflows/messaging.mjs";
import { gate } from "../../../src/messaging/gate.mjs";
import { signUnsubscribeUrl, withUnsubscribeFooter, verifyUnsubscribeRequest } from "../../../src/messaging/unsubscribe.mjs";

const CLIENT = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042"; // #13 Sim Thirteen-NoBook
const mask = (s) => String(s)
  .replace(/([?&](?:amp;)?sig=)[0-9a-f]+/gi, "$1<sig>")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");

if (process.env.UNSUBSCRIBE_TOKEN_SECRET) {
  console.error("run with UNSUBSCRIBE_TOKEN_SECRET= (empty) for this process — the laptop value is a mask");
  process.exit(2);
}

const live = new pg.Client({ connectionString: process.env.DATABASE_URL });
await live.connect();
const writes = [];
const db = {
  async query(sql, params = []) {
    const s = String(sql).trim();
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(s)) {
      writes.push(s.split(/\s+/).slice(0, 3).join(" "));
      if (/^INSERT INTO messages\b/i.test(s)) {
        db.captured = { channel: params[2], template_key: params[3], rendered_body: params[4], subject: params[7] };
        return { rows: [{ id: "00000000-0000-4000-8000-00000000d11d", created_at: new Date() }] };
      }
      return { rows: [] };
    }
    return live.query(sql, params);
  }
};

let fails = 0;
try {
  await live.query("BEGIN READ ONLY");
  const me = (await live.query(`SELECT id, org_id FROM clients WHERE id = $1`, [CLIENT])).rows[0];
  const keys = (await live.query(
    `SELECT template_key FROM message_templates
      WHERE org_id = $1 AND body ~ '\\{\\{\\s*unsubscribe\\s*\\}\\}' ORDER BY 1`, [me.org_id])).rows.map((r) => r.template_key);
  console.log(`now ${new Date().toISOString()} — ${keys.length} live templates hold {{unsubscribe}}`);

  const noon = new Date(); noon.setUTCHours(19, 0, 0, 0);
  for (const key of keys) {
    db.captured = null;
    const res = await sendTemplated(db, {
      orgId: me.org_id, clientId: CLIENT, channel: "email", templateKey: key, eventId: `n11-dryrun-${Date.now()}`
    });
    const body = db.captured?.rendered_body || "";
    const m = body.match(/https?:\/\/[^\s"<]+\/unsubscribe\.html\?[^\s"<]+/);
    const link = m ? m[0].replace(/&amp;/g, "&") : null;
    const verifies = link ? !!verifyUnsubscribeRequest(link) : false;
    const braces = body.includes("{{");
    // Exactly what dispatch.mjs does next with the stored copy.
    const footUrl = signUnsubscribeUrl({ orgId: me.org_id, clientId: CLIENT, channel: "email",
      baseUrl: String(process.env.APP_BASE_URL || "https://fundhub.ai") }).url;
    const outbound = withUnsubscribeFooter(body, footUrl);
    const unsubLinks = (outbound.match(/unsubscribe\.html\?/g) || []).length;
    const verdict = await gate(live, { orgId: me.org_id, clientId: CLIENT, channel: "email", body, templateKey: key },
      { now: () => noon });
    const line = body.split(/\r?\n/).find((l) => /unsubscribe\.html/.test(l)) || "(no link line)";
    const ok = res.sent && link && verifies && !braces && verdict.state === "allowed";
    if (!ok) fails++;
    console.log(`${ok ? "OK  " : "FAIL"} ${key}: sent=${res.sent} link=${!!link} verifies=${verifies} braces=${braces} ` +
      `gate=${verdict.state}${verdict.reasons?.length ? " " + JSON.stringify(verdict.reasons.map((r) => r.code)) : ""} ` +
      `links-after-dispatch-footer=${unsubLinks}`);
    console.log(`     ${mask(line.trim()).slice(0, 220)}`);
  }
  await live.query("ROLLBACK");
} finally {
  await live.end();
}
console.log(`\nwrites intercepted (never sent to the database): ${writes.length} — ${[...new Set(writes)].join(" | ")}`);
console.log(fails ? `${fails} FAILED` : "all rendered with a signed link");
process.exitCode = fails ? 1 : 0;
