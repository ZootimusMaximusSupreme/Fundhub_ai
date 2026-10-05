-- 408_marketing_offers_seed.sql — marketing machine M0 step 3, seed half.
-- Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 3 and §17 decisions 8 and 9.
--
-- Seeds, for the default org only (db/schema/001_init.sql seeds exactly one):
--   * three offers, as live: direct_book, blueprint, slo
--   * the old-ad tags (decision 9) in ad_offer_tags
--
-- Every insert is ON CONFLICT DO NOTHING: a re-run changes nothing, and a card
-- or tag Chris edited on the Offers tab is never overwritten.
--
-- Step pages come from marketing/landing-pages/tracking-manifest.mjs
-- (PUSH_MANIFEST liveUrl values). A page that could not be confirmed there is
-- null and shows as missing on the card — nothing here is guessed:
--   direct_book: /watch (vsl_page), /apply (survey), /funding-book-call (booking)
--   blueprint:   /watch only (spec §17 decision 8). Its survey and booking pages
--                are not confirmed to be the Direct Book ones, so they stay blank.
--   slo:         /roadmap (sales_page, and the on-page checkout widget),
--                /roadmap-thank-you, /roadmap-book. SLO_PRICE_CENTS = 14700
--                (src/slo/offer.mjs), product code 'diagnostic'.
-- `ad` and `call` steps have no page by design.
--
-- This file writes no ad_scripts / ads / campaigns rows, so it does not set the
-- fundhub.actor GUC.

INSERT INTO public.marketing_offers
  (org_id, tag, name, status, structure, steps, lane, registry_tags, card_path, format_mix)
SELECT o.id, v.tag, v.name, 'live', v.structure, v.steps::jsonb, v.lane::ad_lane,
       v.registry_tags::jsonb, 'marketing/offers/' || v.tag || '.md', v.format_mix::jsonb
  FROM orgs o
 CROSS JOIN (VALUES
  ('direct_book', 'Direct Book', 'book_call',
   '[{"type":"ad","url":null,"product_key":null,"price":null},
     {"type":"vsl_page","url":"https://apply.fundhub.ai/watch","product_key":null,"price":null},
     {"type":"survey","url":"https://apply.fundhub.ai/apply","product_key":null,"price":null},
     {"type":"booking","url":"https://apply.fundhub.ai/funding-book-call","product_key":null,"price":null},
     {"type":"call","url":null,"product_key":null,"price":null}]',
   'sorting',
   '{"gate":"none","entry":"sorting","primary_offer":"none","secondary_offers":"all"}',
   '{"standard":2,"sorting":1}'),
  ('blueprint', 'Blueprint', 'book_call',
   '[{"type":"ad","url":null,"product_key":null,"price":null},
     {"type":"vsl_page","url":"https://apply.fundhub.ai/watch","product_key":null,"price":null},
     {"type":"survey","url":null,"product_key":null,"price":null},
     {"type":"booking","url":null,"product_key":null,"price":null},
     {"type":"call","url":null,"product_key":null,"price":null}]',
   'uwiq',
   '{"gate":"none","entry":"sorting","primary_offer":"capital_blueprint","secondary_offers":"all"}',
   '{"standard":1}'),
  ('slo', 'SLO', 'direct_buy',
   '[{"type":"ad","url":null,"product_key":null,"price":null},
     {"type":"sales_page","url":"https://apply.fundhub.ai/roadmap","product_key":null,"price":null},
     {"type":"checkout","url":"https://apply.fundhub.ai/roadmap","product_key":"diagnostic","price":14700},
     {"type":"thank_you","url":"https://apply.fundhub.ai/roadmap-thank-you","product_key":null,"price":null},
     {"type":"booking","url":"https://apply.fundhub.ai/roadmap-book","product_key":null,"price":null},
     {"type":"call","url":null,"product_key":null,"price":null}]',
   'uwiq',
   '{"gate":"none","entry":"sorting","primary_offer":"none","secondary_offers":"all"}',
   '{"standard":1}')
 ) AS v(tag, name, structure, steps, lane, registry_tags, format_mix)
 WHERE o.is_default
ON CONFLICT (org_id, tag) DO NOTHING;

-- Decision 9: SLO ads 84-90 -> slo; registry sorting / funding600 / premium ads
-- -> direct_book; registry uwiq ads -> blueprint; white-label ads stay untagged.
-- The numbers come from marketing/ads/registry.json.
INSERT INTO public.ad_offer_tags (org_id, ad_number, offer_tag, source)
SELECT o.id, v.ad_number, v.offer_tag, 'decision_9'
  FROM orgs o
 CROSS JOIN (VALUES
  (84, 'slo'), (85, 'slo'), (86, 'slo'), (87, 'slo'), (88, 'slo'), (89, 'slo'), (90, 'slo'),
  (16, 'direct_book'), (42, 'direct_book'), (43, 'direct_book'), (44, 'direct_book'),
  (45, 'direct_book'), (46, 'direct_book'), (77, 'direct_book'), (78, 'direct_book'),
  (79, 'direct_book'), (80, 'direct_book'), (81, 'direct_book'), (82, 'direct_book'),
  (83, 'direct_book'),
  (26, 'blueprint'), (27, 'blueprint'), (28, 'blueprint'), (29, 'blueprint'),
  (30, 'blueprint'), (31, 'blueprint')
 ) AS v(ad_number, offer_tag)
 WHERE o.is_default
   AND EXISTS (SELECT 1 FROM public.marketing_offers m WHERE m.org_id = o.id AND m.tag = v.offer_tag)
ON CONFLICT (org_id, ad_number) DO NOTHING;
