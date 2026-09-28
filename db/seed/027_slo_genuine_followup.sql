-- 027_slo_genuine_followup.sql
--
-- Chris's genuine check-in after someone leaves contact on /roadmap and does
-- not pay. Not a pitch. Keys are the contract for
-- src/workflows/slo-genuine-followup.mjs.
--
-- compliance_passed = true: short, factual, no outcome claims. Same pattern as
-- db/seed/026_waypoint_nudge_templates.sql. Words are Chris's; do not "improve".

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, k.channel, k.subject, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  (
    'SMS-SLO-GENUINE-01',
    'sms',
    NULL::text,
    $c$Hey, it's Chris at Fundhub. Not trying to sell you anything. I want to know what we could do to make the page better, and the offer better. I've been in this for 10 years and I've seen a lot of people get burned. What are your concerns?$c$
  ),
  (
    'EMAIL-SLO-GENUINE-01',
    'email',
    'What almost stopped you?',
    $c$Hey — it's Chris at Fundhub.

Not trying to sell you anything. I want to know what we could do to make the page better, and the offer better. I've been in this for 10 years and I've seen a lot of people get burned.

What are your concerns?

Just hit reply.

Chris$c$
  ),
  (
    'SMS-SLO-GENUINE-02',
    'sms',
    NULL::text,
    $c$If we fixed that, would you want to be a Fundhub customer?$c$
  ),
  (
    'EMAIL-SLO-GENUINE-02',
    'email',
    'One more question',
    $c$If we fixed that, would you want to be a Fundhub customer?

Just hit reply.

Chris$c$
  )
) AS k(template_key, channel, subject, body)
ON CONFLICT (org_id, template_key) DO UPDATE SET
  channel = EXCLUDED.channel,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  compliance_passed = EXCLUDED.compliance_passed,
  updated_at = now();
