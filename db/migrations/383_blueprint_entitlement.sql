-- 383_blueprint_entitlement.sql — a paid Capital Blueprint unlocks the Capital
-- Blueprint tile.
--
-- WHAT WAS WRONG (live walk finding GAP 10, 2026-09-16). Sim Eleven-Blueprint
-- paid $5,000 for a "Consulting Services Package" — the transaction is on file at
-- status succeeded — and their Capital Blueprint tile still read "LOCKED …
-- Pricing is set on your call / Talk to an advisor". On the same portal load,
-- two tiles they had NOT bought read "Included — you own this". So the grant
-- machinery ran and worked; it granted the wrong entitlement.
--
-- THE CHAIN, ENTIRELY IN SHIPPED CODE. Every link below is copied, not decided:
--   * src/config/offers.mjs UWIQ_DELIVERABLES ("Capital Blueprint") sells on
--     productCode 'consulting-package'.
--   * public/app/client-portal.html MAP sends the UWIQ_DELIVERABLES tile to the
--     entitlement code 'credit-optimization-roadmap'.
--   * db/migrations/032_entitlements.sql already seeds that code in
--     entitlement_catalog. Nothing new is invented here.
--   * product_entitlements held exactly one row for 'consulting-package', added
--     by 180: it grants 'metro2-letter-pack'. That is the row that lit the two
--     wrong tiles, and it is LEFT ALONE — repair letters are genuinely part of
--     the Blueprint contents list in offers.mjs, so revoking it would take
--     something away that a buyer has.
-- So the only missing link is this one row.
--
-- 180 RECORDED THIS PAIR AS "Blocked on the owner" and it no longer is. Its
-- reason was that the Blueprint contents list names five deliverables while the
-- portal maps the tile to one code — an offer question. The portal has since
-- shipped that single MAP line, and 289_capital_blueprint_price.sql settled, at
-- the owner's word, that 'consulting-package' IS the $5,000 Capital Blueprint.
-- This file copies those two shipped facts. It decides nothing new.
--
-- RECORDED, NOT FIXED — 'consulting-package' is double-booked. It is also the
-- fallback bucket BUCKET_TO_CODE.diy in src/handlers/money-chain.mjs, used by
-- the DIY letter path. A DIY purchase that falls back to this code will now also
-- unlock the Blueprint tile. That is a real consequence and it is named here
-- rather than hidden: splitting the two products apart means a new product code,
-- a new Commas title and a change to pay-link minting, which is an owner
-- decision and a far bigger change than this one row. The mis-grant runs both
-- ways today — the $5,000 buyer already gets the letter pack — so this row does
-- not create the overlap, it completes the half that was leaving a paying
-- customer locked out.
--
-- SAFETY. Additive only, default org only, NOT EXISTS-guarded in 180's own style
-- so re-running is inert. Nothing is deleted, nothing is revoked, no existing row
-- is rewritten. No PII. 180 is NOT edited — it is applied everywhere already, so
-- editing it would be a silent no-op (CLAUDE.md §12: migrate.mjs keys
-- schema_migrations by <dir>/<file>).
--
-- duration_days is NULL: perpetual, the same no-decision value every row in 180
-- carries. A term is an owner decision.

BEGIN;

INSERT INTO product_entitlements (org_id, product_code, entitlement_code, duration_days)
SELECT o.id, v.product_code, v.entitlement_code, NULL::integer
  FROM orgs o
  CROSS JOIN (VALUES
    ('consulting-package', 'credit-optimization-roadmap')
  ) AS v(product_code, entitlement_code)
 WHERE o.is_default
   AND NOT EXISTS (
     SELECT 1 FROM product_entitlements pe
      WHERE pe.org_id = o.id
        AND lower(btrim(pe.product_code)) = v.product_code
        AND pe.entitlement_code = v.entitlement_code
   )
   -- Never map to a code the catalog does not hold: a grant of an uncatalogued
   -- code renders nowhere and reads as a silent success.
   AND EXISTS (
     SELECT 1 FROM entitlement_catalog ec
      WHERE ec.org_id = o.id AND ec.code = v.entitlement_code
   )
   -- Never map a product this org does not sell.
   AND EXISTS (
     SELECT 1 FROM products p
      WHERE p.org_id = o.id AND lower(btrim(p.code)) = v.product_code
   );

COMMIT;
