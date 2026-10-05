-- seed/037_doc_reminder_texts.sql
--
-- The three reminder texts for a client who was asked for documents and has not
-- uploaded any. Sent on day 1, 3 and 5 after the request by
-- src/workflows/s-doc-reminders.mjs, which stops the moment an upload lands.
-- W8 on Chris's list (2026-10-04).
--
-- THESE GO LIVE AT THE NEXT SHIP. db/migrate.mjs applies every seed file, so
-- this file only merges after Chris has read the three texts and said OK.
--
-- NEW KEYS, AND THE CODE IS SAFE WITHOUT THEM. Until this file is applied,
-- sendTemplated finds no row and every reminder is a template_pending no-op
-- (src/workflows/messaging.mjs). Nothing sends blank or placeholder copy.
--
-- WHERE EVERY FACT COMES FROM. Nothing below is new. Each line is taken from
-- the request these texts follow up on (db/seed/013_section4_message_templates.sql):
--   * "Hey {{contact.first_name}}, Fundhub." — how SMS-DOC-01-REQUEST opens.
--   * "we still need your documents before we can start" — SMS-DOC-01-REQUEST:
--     "Before we can start, we need a few documents from you."
--   * "Or reply to this text with photos" — SMS-DOC-01-REQUEST. Inbound photos
--     are filed by src/handlers/inbound-mms-docs.mjs.
--   * the list on day 3 — EMAIL-DOC-01-REQUEST: photo ID, proof of address,
--     articles of organization or incorporation if you have an entity.
--   * "We can't start on your file until your documents are in" —
--     EMAIL-DOC-01-REQUEST: "Nothing starts until these clear."
-- No amount, no approval, no credit-score claim, no deadline.
--
-- THE LINK IS {{portal_url}}, the portal itself, per Chris's 2026-08-29 call
-- "just send it to the portal" (src/messaging/merge-tags-registry.mjs). The
-- client uploads on that page. The first request still uses
-- {{CLIENT_PORTAL_URL}}; this file does not touch it.
--
-- The closing line is the one every text already carries: "Reply STOP to opt
-- out." (marketing/ads/sms-copy-2026-09.md). Not [DRAFT] — the draft guard
-- would block it — and compliance_passed = true, the same as 013 and 295.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, 'sms', NULL, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  -- Day 1.
  ('SMS-DOC-REMIND-DAY1',
   $c$Hey {{contact.first_name}}, Fundhub. Quick reminder: we still need your documents before we can start. Upload them here: {{portal_url}} Or just reply to this text with photos. Reply STOP to opt out.$c$),

  -- Day 3. Names the documents, so nobody has to dig out the first email.
  ('SMS-DOC-REMIND-DAY3',
   $c$Hey {{contact.first_name}}, Fundhub. Your documents aren't in yet. We need your photo ID, proof of address, and your articles of organization or incorporation if you have an LLC or corporation. Upload here: {{portal_url}} Reply STOP to opt out.$c$),

  -- Day 5. The last automatic one.
  ('SMS-DOC-REMIND-DAY5',
   $c$Hey {{contact.first_name}}, Fundhub. We can't start on your file until your documents are in. Upload them here: {{portal_url}} Or reply to this text with photos. Reply STOP to opt out.$c$)
) AS k(template_key, body)
ON CONFLICT (org_id, template_key) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  compliance_passed = EXCLUDED.compliance_passed,
  updated_at = now();
