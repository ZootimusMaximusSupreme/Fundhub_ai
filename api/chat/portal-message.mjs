// /api/chat/portal-message — client portal chat widget.
//
//   GET  — signed-in client reads THEIR OWN portal thread (sms preferred)
//   POST — client → staff note; lands on the existing sms/email conversation
//
// Threaded on the client's conversation — not a separate silo (spec §4.3).

import { db } from "../../src/db.mjs";
import { requirePrincipal } from "../../src/http/middleware/requirePrincipal.mjs";
import { upsertConversation, linkMessage } from "../../src/conversations/store.mjs";
import { listThreadMessages } from "../../src/chat/internal.mjs";
import { safeError } from "../../src/http/health.mjs";
import {
  answerPortalMessage, portalAssistantContext
} from "../../src/chat/portal-assistant.mjs";
import { prequalFromCustomFields, formatPrequalUsd } from "../../src/http/portal-prequal.mjs";

export default async function handler(req, res) {
  const principal = await requirePrincipal(req, res, ["client"], { db });
  if (!principal) return;

  const clientId = principal.clientId || principal.account?.client_id || principal.id;
  const orgId = principal.orgId || principal.org_id;
  if (!clientId || !orgId) {
    return res.status(403).json({ ok: false, error: "no_client_scope" });
  }

  try {
    if (req.method === "GET") {
      /* Prefer the sms thread the widget posts to; else most recent client thread. */
      const convo = await db.query(
        `SELECT id FROM conversations
          WHERE org_id = $1 AND client_id = $2
          ORDER BY CASE WHEN channel = 'sms' THEN 0 ELSE 1 END,
                   COALESCE(last_pulse_at, created_at) DESC
          LIMIT 1`,
        [orgId, clientId]
      );
      if (!convo.rows[0]) {
        return res.status(200).json({ ok: true, conversation_id: null, messages: [] });
      }
      const conversationId = convo.rows[0].id;
      const messages = await listThreadMessages(db, {
        orgId,
        conversationId,
        limit: Number(req.query?.limit) || 100
      });
      return res.status(200).json({
        ok: true,
        conversation_id: conversationId,
        messages
      });
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const body = req.body || {};
    const text = String(body.body || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "body_required" });
    if (text.length > 8000) return res.status(400).json({ ok: false, error: "body_too_long" });

    const channel = String(body.channel || "sms").toLowerCase();
    if (channel !== "sms" && channel !== "email") {
      return res.status(400).json({ ok: false, error: "channel_must_be_sms_or_email" });
    }

    const convo = await upsertConversation(db, {
      orgId,
      clientId,
      channel,
      lastPulseAt: new Date().toISOString()
    });

    const ins = await db.query(
      `INSERT INTO messages (
         org_id, client_id, conversation_id, direction, channel,
         rendered_body, status, compliance_check_passed, sender_kind
       ) VALUES ($1, $2, $3, 'inbound', $4, $5, 'received', true, 'client')
       RETURNING *`,
      [orgId, clientId, convo.id, channel, text]
    );
    const message = ins.rows[0];
    try {
      await linkMessage(db, { messageId: message.id, conversationId: convo.id });
    } catch { /* non-fatal */ }

    /* The assistant reply. Best-effort by design: the client's message is
       already committed above, so a model outage must not turn a saved message
       into a 500. Worst case they get the fallback line and staff still see the
       thread. */
    let reply = null;
    try {
      reply = await replyFor(db, { orgId, clientId, question: text, conversationId: convo.id, channel });
    } catch {
      reply = null;
    }

    return res.status(200).json({
      ok: true,
      conversation_id: convo.id,
      message,
      reply
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}

/* Build the assistant's reply and, when the model actually answered, keep it on
   the thread so staff read the same conversation the client saw.
   status='delivered', NOT 'queued' — src/messaging/dispatch.mjs claims outbound
   rows with status='queued', so a queued row here would be texted or emailed to
   the client on top of the portal reply they already read. */
async function replyFor(database, { orgId, clientId, question, conversationId, channel }) {
  const found = await database.query(
    `SELECT first_name, custom_fields FROM clients WHERE id = $1 AND org_id = $2`,
    [clientId, orgId]
  );
  const client = found.rows[0] || {};
  const cf = client.custom_fields || {};
  const context = portalAssistantContext({
    client,
    prequalDisplay: formatPrequalUsd(prequalFromCustomFields(cf))
  });

  const answer = await answerPortalMessage({ question, context });

  /* Persist assistant or canned fallback — the portal reloads from this thread. */
  try {
    const saved = await database.query(
      `INSERT INTO messages (
         org_id, client_id, conversation_id, direction, channel,
         rendered_body, status, provider, compliance_check_passed, sender_kind
       ) VALUES ($1, $2, $3, 'outbound', $4, $5, 'delivered', 'internal', true, 'agent')
       RETURNING id`,
      [orgId, clientId, conversationId, channel, answer.text]
    );
    await linkMessage(database, {
      messageId: saved.rows[0].id,
      conversationId
    });
  } catch { /* the reply still goes to the POST body; the thread copy is a bonus */ }

  return { text: answer.text, source: answer.ok ? "assistant" : "fallback" };
}
