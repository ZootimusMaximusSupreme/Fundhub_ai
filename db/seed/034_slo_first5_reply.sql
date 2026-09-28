-- 034_slo_first5_reply.sql
--
-- The first five had no customer text after they wrote back. This is it.
-- They agreed, so the roadmap is free. One booking link, no price, no discount.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, k.channel, k.subject, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  (
    'SMS-SLO-FIRST5-REPLY',
    'sms',
    NULL::text,
    $c$Hey, I appreciate you writing back. You're in. The roadmap is free. Book the call with me here and I'll do the soft-pull analysis in front of you: {{book_url}}
Reply STOP to opt out.$c$
  ),
  (
    'EMAIL-SLO-FIRST5-REPLY',
    'email',
    'You''re in. The roadmap is free.',
    $c$Hey {{contact.first_name}},

I appreciate you writing back. You're in. The roadmap is free.

Book the call with me here and I'll do the soft-pull analysis in front of you:

{{book_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  )
) AS k(template_key, channel, subject, body)
ON CONFLICT (org_id, template_key) DO UPDATE SET
  channel = EXCLUDED.channel,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  compliance_passed = EXCLUDED.compliance_passed,
  updated_at = now();
