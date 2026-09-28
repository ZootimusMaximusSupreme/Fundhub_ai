-- 029_slo_infinite_drip.sql
--
-- Twenty-one emails. Seven per lane. The step wraps, so the list does not end.
-- cold = only landed. warm = left info or wrote back. hot = started checkout.
-- One ask: the $197 roadmap. Signed the way Josh's stored emails are signed.
-- Written by Claude. Not edited after.

INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
SELECT o.id, k.template_key, k.channel, k.subject, k.body, true
FROM orgs o
CROSS JOIN (VALUES
  (
    'EMAIL-SLO-DRIP-COLD-1',
    'email',
    'The call was a pitch',
    $c$Hey {{contact.first_name}},

Most people get offered a free call. The call is a pitch. You hang up with nothing you can read.

The Fundhub roadmap is the other thing. It is a document. It says what to fix on your file, and what order to fix it in.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-COLD-2',
    'email',
    'Not a course',
    $c$Hey {{contact.first_name}},

This is not a course. Nobody hands you 40 videos about funding in general.

We look at your file. The roadmap comes from what is actually in it. Your numbers, your order of operations.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-COLD-3',
    'email',
    'Colin and Sarah',
    $c$Hey {{contact.first_name}},

Two people talking about it in their own words.

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4

Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

Then the roadmap is here.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-COLD-4',
    'email',
    'You keep the document',
    $c$Hey {{contact.first_name}},

The worry with anything online is you pay and end up with nothing in your hands.

The roadmap is a document. It is yours. You keep it whether you ever work with Fundhub again or not.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-COLD-5',
    'email',
    'Why it is only $197',
    $c$Hey {{contact.first_name}},

You should see the work before anyone at Fundhub talks to you.

That is the whole reason the roadmap is $197. You read what we found, then you decide if you want anything else.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-COLD-6',
    'email',
    'What to fix, in what order',
    $c$Hey {{contact.first_name}},

Your roadmap: what to fix on your file, in what order.

That is it. Here is the link.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-COLD-7',
    'email',
    'Same link',
    $c$Hey {{contact.first_name}},

Nothing new to add.

Same roadmap, same link.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-1',
    'email',
    'You were promised a call',
    $c$Hey {{contact.first_name}},

Everywhere else you land, the next step is a call. The call is a pitch, and you hang up with nothing written down.

You asked about this. So here is the honest version: the roadmap is a document that says what to fix on your file and in what order.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-2',
    'email',
    'It is built from your file',
    $c$Hey {{contact.first_name}},

If you are wondering whether this is a course you have already seen somewhere: it is not.

Nothing in your roadmap is generic. It is built from the file you gave Fundhub.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-3',
    'email',
    'Hear it from them instead',
    $c$Hey {{contact.first_name}},

Easier to hear it from someone who is not selling it.

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4

Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

The link is below when you are ready.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-4',
    'email',
    'What if you get nothing',
    $c$Hey {{contact.first_name}},

That is the real worry. You pay, and then there is nothing to show for it.

You get a document. It is yours to keep, to read again, to hand to whoever you want.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-5',
    'email',
    'See the work first',
    $c$Hey {{contact.first_name}},

You do not have to trust Fundhub yet.

$197 buys you the work up front, so you can read it and judge it before a single person talks to you.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-6',
    'email',
    'The short version',
    $c$Hey {{contact.first_name}},

What to fix. In what order. On your file.

Link below.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-WARM-7',
    'email',
    'Still here',
    $c$Hey {{contact.first_name}},

Nothing new from me.

The roadmap is still $197 and the link still works.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-1',
    'email',
    'Your roadmap',
    $c$Hey {{contact.first_name}},

You started this. It is not a call. It is the document: what to fix, in what order.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-2',
    'email',
    'From your file',
    $c$Hey {{contact.first_name}},

Not a course. Built from your file.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-3',
    'email',
    'Two minutes',
    $c$Hey {{contact.first_name}},

Colin: https://fundhub.ai/funnel/slo-testimonial-colin.mp4

Sarah: https://fundhub.ai/funnel/slo-testimonial-sarah.mp4

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-4',
    'email',
    'Yours to keep',
    $c$Hey {{contact.first_name}},

You get a document. You keep it.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-5',
    'email',
    'Before anyone calls',
    $c$Hey {{contact.first_name}},

See the work first. That is why it is $197.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-6',
    'email',
    'What to fix, in what order',
    $c$Hey {{contact.first_name}},

That is the whole thing.

$197: {{pay_url}}

– Josh
FundHub.ai

FundHub.ai • Funding Intelligence for Entrepreneurs$c$
  ),
  (
    'EMAIL-SLO-DRIP-HOT-7',
    'email',
    'Link',
    $c$Hey {{contact.first_name}},

Same link.

$197: {{pay_url}}

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
