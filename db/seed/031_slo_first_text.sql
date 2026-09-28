-- 031_slo_first_text.sql
--
-- First text after someone leaves their info and does not buy.
-- First five: answer the questions, get a Google Meet, roadmap is free.
-- Person six on: a gift, unnamed. The 33% off ($197) shows up only after they answer.
-- Silence still gets the straight discount from seed 028.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, k.channel, k.subject, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  (
    'SMS-SLO-FIRST5-01',
    'sms',
    NULL::text,
    $c$Hey, it's Chris at Fundhub. If you answer a few questions, I'll hop on a Google Meet and give you the roadmap for free. I want to see how this can help you. What's the hardest part for you right now? Reply STOP to opt out.$c$
  ),
  (
    'EMAIL-SLO-FIRST5-01',
    'email',
    'I''ll give you the roadmap for free',
    $c$Hey {{contact.first_name}},

If you answer a few questions, I'll hop on a Google Meet and give you the roadmap for free. I want to see how this can help you.

What's the hardest part for you right now?

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'SMS-SLO-GIFT-01',
    'sms',
    NULL::text,
    $c$Hey, it's Chris at Fundhub. If you answer one question, I'll give you a gift. I think you're going to like it. What's the hardest part for you right now? Reply STOP to opt out.$c$
  ),
  (
    'EMAIL-SLO-GIFT-01',
    'email',
    'I have a gift for you',
    $c$Hey {{contact.first_name}},

If you answer one question, I'll give you a gift. I think you're going to like it.

What's the hardest part for you right now?

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'SMS-SLO-COUPON-01',
    'sms',
    NULL::text,
    $c$Hey {{contact.first_name}}, it's Chris at Fundhub. I appreciate you writing back. Here's 33% off the roadmap. It's $197: {{pay_url}} Reply STOP to opt out.$c$
  ),
  (
    'EMAIL-SLO-COUPON-01',
    'email',
    'Here''s the gift',
    $c$Hey {{contact.first_name}},

I appreciate you writing back.

Here's 33% off the roadmap. It's $197.

{{pay_url}}

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
