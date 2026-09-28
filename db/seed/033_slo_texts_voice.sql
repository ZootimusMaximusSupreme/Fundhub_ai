-- 033_slo_texts_voice.sql
--
-- Chris's own words for the four texts that go out, and the matching emails.
-- First five: free roadmap for a call, soft-pull analysis on the call, tell me what you didn't like.
-- Person six on: what didn't you like, and a gift, unnamed.
-- After they write back: 30% off, $197.
-- Silence: 30% off, $197, no mystery.
-- 031 and 032 are already applied, so this updates the bodies in place.

UPDATE message_templates
   SET body = $c$Hey, it's Chris at Fundhub. I'm the founder of Fundhub. I want to give you the roadmap for free in exchange for hopping on a call with me. I'll do the soft-pull analysis in front of you so we can see how this can help you, and I want to hear what you didn't like about the product. You're one of the first people in my funnel, so this is free. I can help you, and your suggestions help me make the product better.
Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-FIRST5-01';

UPDATE message_templates
   SET subject = 'I''ll give you the roadmap for free',
       body = $c$Hey {{contact.first_name}},

It's Chris at Fundhub. I'm the founder of Fundhub.

I want to give you the roadmap for free in exchange for hopping on a call with me. I'll do the soft-pull analysis in front of you so we can see how this can help you, and I want to hear what you didn't like about the product.

You're one of the first people in my funnel, so this is free. I can help you, and your suggestions help me make the product better.

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-FIRST5-01';

UPDATE message_templates
   SET body = $c$Hey, it's Chris at Fundhub. I'm the founder of Fundhub. What about this did you not like? Was it the page? Was it the offer? What didn't you like about the product? Tell me, and I'll give you an amazing gift. I think you're really going to like it.
Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-GIFT-01';

UPDATE message_templates
   SET subject = 'What didn''t you like?',
       body = $c$Hey {{contact.first_name}},

It's Chris at Fundhub. I'm the founder of Fundhub.

What about this did you not like? Was it the page? Was it the offer? What didn't you like about the product?

Tell me, and I'll give you an amazing gift. I think you're really going to like it.

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-GIFT-01';

UPDATE message_templates
   SET body = $c$Hey, I appreciate you writing back. Here's 30% off the roadmap. It's $197: {{pay_url}} I'd love to hear how you like the product. We're going to take what you said and make this better, so this is worth your time.
Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-COUPON-01';

UPDATE message_templates
   SET subject = 'Here''s 30% off',
       body = $c$Hey {{contact.first_name}},

I appreciate you writing back.

Here's 30% off the roadmap. It's $197:

{{pay_url}}

I'd love to hear how you like the product. We're going to take what you said and make this better, so this is worth your time.

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-COUPON-01';

UPDATE message_templates
   SET body = $c$Hey, it's Chris at Fundhub. I'm the founder of Fundhub. Here's 30% off the roadmap. It's $197: {{pay_url}}
Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-197';

UPDATE message_templates
   SET subject = 'Here''s 30% off',
       body = $c$Hey {{contact.first_name}},

It's Chris at Fundhub. I'm the founder of Fundhub.

Here's 30% off the roadmap. It's $197:

{{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-197';
