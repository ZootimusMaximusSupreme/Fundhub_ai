-- EMAIL-DOC-02-REQUEST-MORE was listed in the 98-key comms map but never seeded.
-- Re-queue partner welcome SMS rows that blocked on recipient_unknown before
-- PARTNER_WELCOME_SMS_KEYS existed in src/messaging/gate.mjs.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT
  o.id,
  'EMAIL-DOC-02-REQUEST-MORE',
  'email',
  'One thing to fix on your upload',
  $html$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>One thing to fix on your upload</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F4F4F5;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E4E4E7;">
        <tr>
          <td style="padding:28px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#18181B;">
            <p style="margin:0 0 16px 0;">Hey {{contact.first_name}},</p>
            <p style="margin:0 0 16px 0;">Got your upload — one thing needs fixing before we can move forward.</p>
            <p style="margin:0 0 16px 0;">Open your portal for the details and upload a corrected copy: {{CLIENT_PORTAL_URL}}</p>
            <p style="margin:0 0 16px 0;">{{sender_name}}<br>
            Fundhub</p>
            <p style="margin:0 0 16px 0;">fundhub.ai • Funding Intelligence for Entrepreneurs<br>
            {{unsubscribe}}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>$html$,
  true
FROM orgs o
ON CONFLICT (org_id, template_key) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  compliance_passed = EXCLUDED.compliance_passed,
  updated_at = now();

UPDATE messages
   SET status = 'queued',
       blocked_reason = NULL,
       blocked_at = NULL,
       last_error = NULL
 WHERE template_key = 'SMS-PARTNER-WELCOME'
   AND status = 'blocked'
   AND blocked_reason = 'recipient_unknown';
