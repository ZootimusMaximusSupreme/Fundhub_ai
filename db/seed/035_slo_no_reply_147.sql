-- 035_slo_no_reply_147.sql
--
-- Owner-set 2026-10-05: the no-reply follow-up stays on and offers the roadmap
-- at $147, not $197. $147 is the live page price (src/slo/offer.mjs SLO_PRICE_CENTS).
-- "30% off" is no longer true at $147 against the $297 list price, so the percent
-- claim is gone. Every other word is the same as 033.
-- 028 and 033 are already applied, so this updates the bodies in place.
-- Template keys stay SMS-SLO-197 / EMAIL-SLO-197: the live database and the
-- slo-no-reply-197 workflow read them by those names.

UPDATE message_templates
   SET body = $c$Hey, it's Chris at Fundhub. I'm the founder of Fundhub. Here's the roadmap. It's $147: {{pay_url}}
Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-197';

UPDATE message_templates
   SET subject = 'Here''s the roadmap',
       body = $c$Hey {{contact.first_name}},

It's Chris at Fundhub. I'm the founder of Fundhub.

Here's the roadmap. It's $147:

{{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-197';
