-- 036_slo_followups_147.sql
--
-- Owner-set 2026-10-05: "we're leaving it at 147." The follow-ups that still
-- named the old price now say $147, the live page price (src/slo/offer.mjs
-- SLO_PRICE_CENTS). 035 did the no-reply text; this does the rest.
--
-- COUPON-01 (after they write back): the percent claim is gone, because it is
-- not true at $147 against the $297 list price, and the price is $147. Same
-- change as 035. Every other word is the same as 033.
-- The 21 drip emails: every price now says $147. Every other word is the same
-- as 029.
-- 029 and 033 are already applied, so this updates the bodies in place.
-- Template keys are unchanged: the live database and the workflows read them.

UPDATE message_templates
   SET body = $c$Hey, I appreciate you writing back. Here's the roadmap. It's $147: {{pay_url}} I'd love to hear how you like the product. We're going to take what you said and make this better, so this is worth your time.
Reply STOP to opt out.$c$,
       updated_at = now()
 WHERE template_key = 'SMS-SLO-COUPON-01';

UPDATE message_templates
   SET subject = 'Here''s the roadmap',
       body = $c$Hey {{contact.first_name}},

I appreciate you writing back.

Here's the roadmap. It's $147:

{{pay_url}}

I'd love to hear how you like the product. We're going to take what you said and make this better, so this is worth your time.

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-COUPON-01';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Most people get offered a free call. The call is a pitch. You hang up with nothing you can read.

The Fundhub roadmap is the other thing. It is a document. It says what to fix on your file, and what order to fix it in.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-1';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

This is not a course. Nobody hands you 40 videos about funding in general.

We look at your file. The roadmap comes from what is actually in it. Your numbers, your order of operations.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-2';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Two people talking about it in their own words.

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4

Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

Then the roadmap is here.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-3';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

The worry with anything online is you pay and end up with nothing in your hands.

The roadmap is a document. It is yours. You keep it whether you ever work with Fundhub again or not.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-4';

UPDATE message_templates
   SET subject = 'Why it is only $147',
       body = $c$Hey {{contact.first_name}},

You should see the work before anyone at Fundhub talks to you.

That is the whole reason the roadmap is $147. You read what we found, then you decide if you want anything else.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-5';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Your roadmap: what to fix on your file, in what order.

That is it. Here is the link.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-6';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Nothing new to add.

Same roadmap, same link.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-COLD-7';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Everywhere else you land, the next step is a call. The call is a pitch, and you hang up with nothing written down.

You asked about this. So here is the honest version: the roadmap is a document that says what to fix on your file and in what order.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-1';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

If you are wondering whether this is a course you have already seen somewhere: it is not.

Nothing in your roadmap is generic. It is built from the file you gave Fundhub.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-2';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Easier to hear it from someone who is not selling it.

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4

Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

The link is below when you are ready.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-3';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

That is the real worry. You pay, and then there is nothing to show for it.

You get a document. It is yours to keep, to read again, to hand to whoever you want.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-4';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

You do not have to trust Fundhub yet.

$147 buys you the work up front, so you can read it and judge it before a single person talks to you.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-5';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

What to fix. In what order. On your file.

Link below.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-6';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Nothing new from me.

The roadmap is still $147 and the link still works.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-WARM-7';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

You started this. It is not a call. It is the document: what to fix, in what order.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-1';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Not a course. Built from your file.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-2';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4

Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-3';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

You get a document. You keep it.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-4';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

See the work first. That is why it is $147.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-5';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

That is the whole thing.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-6';

UPDATE message_templates
   SET body = $c$Hey {{contact.first_name}},

Same link.

$147: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$,
       updated_at = now()
 WHERE template_key = 'EMAIL-SLO-DRIP-HOT-7';
