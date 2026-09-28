-- 028_slo_discount_197.sql
--
-- $197 is the discount price. It goes out when someone does not reply.
-- The dig text is for the first five, after they do reply.
-- Words are the offer copy. Do not invent a different price.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, k.channel, k.subject, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  (
    'SMS-SLO-197',
    'sms',
    NULL::text,
    $c$Hey {{contact.first_name}}, it's Josh at Fundhub. The roadmap is $197. I look at your file and tell you what to fix first. Pay here: {{pay_url}} Reply STOP to opt out.$c$
  ),
  (
    'EMAIL-SLO-197',
    'email',
    'The $197 roadmap',
    $c$Hey {{contact.first_name}},

Not trying to sell you anything. Here is what it is.

$197. I look at your file and write you a roadmap. What to fix, in what order, and what to do first.

Two clients filmed short videos:

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4
Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

Pay here: {{pay_url}}

If it is not for you, say so and I will leave it alone.

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'SMS-SLO-DIG',
    'sms',
    NULL::text,
    $c$Hey {{contact.first_name}}, it's Josh at Fundhub. What is the hardest part right now? What would working look like in 30 days? What is in the way? If you want to move forward, the roadmap is free, then a video interview. Reply STOP to opt out.$c$
  )
) AS k(template_key, channel, subject, body)
ON CONFLICT (org_id, template_key) DO UPDATE SET
  channel = EXCLUDED.channel,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  compliance_passed = EXCLUDED.compliance_passed,
  updated_at = now();
