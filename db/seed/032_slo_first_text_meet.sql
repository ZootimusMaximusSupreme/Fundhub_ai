-- 032_slo_first_text_meet.sql
--
-- The first five are offered a free roadmap on a Google Meet.
-- The questions stay on the call. The text does not say we will interview them.
-- 031 already applied, so this updates those two templates.

UPDATE message_templates
   SET body = $c$Hey, it's Chris at Fundhub. Hop on a Google Meet with me and I'll give you the roadmap for free. I want to see how this can help you. Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-FIRST5-01';

UPDATE message_templates
   SET subject = 'I''ll give you the roadmap for free',
       body = $c$Hey {{contact.first_name}},

Hop on a Google Meet with me and I'll give you the roadmap for free. I want to see how this can help you.

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-FIRST5-01';
