-- 030_slo_paid_form_nudge.sql
--
-- One note after someone pays the $297 and does not submit the soft-pull form.
-- Not a pitch. Keys are the contract for src/workflows/slo-paid-form-nudge.mjs.
-- Words approved with the plan. Do not "improve" them.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, k.channel, k.subject, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  (
    'SMS-SLO-PAID-FORM-01',
    'sms',
    NULL::text,
    $c$Hey, it's Chris at Fundhub. Your payment went through. The file does not run until the soft pull form is in. Pick it back up here: {{form_url}}$c$
  ),
  (
    'EMAIL-SLO-PAID-FORM-01',
    'email',
    'Your payment is in',
    $c$Hey, it's Chris at Fundhub. Your payment went through. The file does not run until the soft pull form is in.

{{form_url}}$c$
  )
) AS k(template_key, channel, subject, body)
ON CONFLICT (org_id, template_key) DO UPDATE SET
  channel = EXCLUDED.channel,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  compliance_passed = EXCLUDED.compliance_passed,
  updated_at = now();
