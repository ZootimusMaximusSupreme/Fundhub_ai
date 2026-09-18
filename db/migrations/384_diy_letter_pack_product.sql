-- 384_diy_letter_pack_product.sql — one payment, one product, the right unlock.
--
-- THE OWNER'S RULE THIS SERVES (Chris, 2026-09-17): "When a user pays for
-- something (capital blueprint, funding services, etc.): the paid item needs to
-- be unlocked; display the relevant dashboards and materials already created;
-- paid content should be immediately accessible to the user."
--
-- WHY THAT RULE COULD NOT BE HONOURED. Two products at two prices shared ONE
-- products.code, 'consulting-package':
--   * src/config/offers.mjs UWIQ_DELIVERABLES — "Capital Blueprint", $5,000.
--   * src/handlers/money-chain.mjs BUCKET_TO_CODE.diy — the $1,000 DIY dispute
--     letter downsell that ds-02 delivers.
-- An entitlement is looked up BY PRODUCT CODE (032_entitlements.sql
-- product_entitlements), so with one code covering two products the system
-- could not tell which of them a payment had bought, and therefore could not
-- tell which tile to open.
--
-- MEASURED ON PRODUCTION, 2026-09-17, not inferred:
--   * client 029964c5-4d8e-47ed-88c9-53ac13863fd4 (Sim Eleven-Blueprint) has one
--     transaction, 'Consulting Services Package', $5,000.00, status succeeded.
--   * their entitlements ledger holds exactly ONE row: metro2-letter-pack,
--     grant_reason 'purchase:consulting-package', granted 17:46:39.
--   * the portal maps REPAIR_DFY and REPAIR_TRIAL to metro2-letter-pack, so the
--     two tiles reading "Included — you own this" are the $1,000 repair offer and
--     the $200 trial — neither of which they bought — while the Capital
--     Blueprint tile, which gates on credit-optimization-roadmap, read LOCKED.
--
-- 383_blueprint_entitlement.sql IS APPLIED (schema_migrations
-- 'migrations/383_blueprint_entitlement.sql', applied_at 2026-09-17 23:13:44)
-- and its row IS in product_entitlements. It still unlocked nobody, and that is
-- the second half of this file: product_entitlements is a LOOKUP, read once when
-- a payment is processed. The Blueprint grant ran at 17:46; the mapping row
-- landed at 23:13. A row in a lookup table never reaches back into a ledger.
--
-- THIS FILE DOES NOT SUPERSEDE 383. It completes it. 383 named the collision in
-- its own header as "RECORDED, NOT FIXED — 'consulting-package' is double-booked"
-- and said splitting it needed a new product code, a new vendor title and a
-- change to pay-link minting. That is exactly what this is. 383 is left
-- untouched: it is applied everywhere, so editing it would be a silent no-op
-- (CLAUDE.md §12 — migrate.mjs keys schema_migrations by '<dir>/<file>').
--
-- WHICH OFFER KEPT 'consulting-package', AND WHY IT WAS NOT A COIN TOSS.
-- The Capital Blueprint kept it. Three shipped, owner-set facts decide this and
-- none of them is a preference:
--   1. 289_capital_blueprint_price.sql (owner-set 2026-09-03, applied) moved
--      products.default_price on this row to $5,000 because, in its words,
--      "'consulting-package' IS the $5,000 Capital Blueprint".
--   2. 383 (applied) already maps it to the roadmap the Blueprint tile gates on.
--   3. EVERY recorded payment on this product on production is a Blueprint. There
--      is exactly one: the $5,000 above. No DIY purchase has ever been recorded.
-- Moving the Blueprint to a new code instead would have stranded the one person
-- who has already paid, because his transaction and his sale both point at the
-- old code — and telling his payment apart from a DIY one would have meant
-- reading the dollar amount, which Hard Rule 4 forbids.
--
-- SAFETY. Additive only. Every statement is guarded and re-running is inert.
-- Default org only. No row is deleted, revoked or rewritten — including
-- 180_product_entitlements_seed.sql's 'consulting-package' -> metro2-letter-pack,
-- which stays exactly as 383 left it: the Blueprint's own contents list in
-- offers.mjs names a "Dispute Letter Pack", so removing it would take something
-- away from a buyer who has it. No PII.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The DIY letter downsell becomes its own product.
--
-- NAME. It must keep matching src/workflows/ds-02-diy-letters.mjs isDiyProduct(),
-- which accepts a product name containing "consulting services package" OR
-- "diy". "DIY Dispute Letter Pack" matches on the second, so the letters
-- workflow that delivers this product keeps firing for it with no change to a
-- file this lane does not own.
--
-- PRICE. $1,000, copied from shipped code and not chosen here:
-- 015_seed_products.sql seeded 'consulting-package' at 1000.00 as "DIY
-- consulting", 180's header calls it "the $1,000 DIY product", and ds-02's own
-- header says the same. The $1,000 stayed on that row until 289 moved it to
-- $5,000 for the Blueprint; this restores it to the product it actually
-- described. price_is_variable stays true — the closer sets the agreed number on
-- the sale, per 181.
--
-- CATEGORY 'consulting', deliberately, and NOT 'repair'. products.category is
-- what src/handlers/purchase-routing.mjs routes boards on, and 'repair' would put
-- a DIY buyer on the optimization board and open a full repair enrolment —
-- rounds, document requests, tasks — which nobody has asked for. A DIY letter
-- pack is delivered by ds-02, not by a board. Same reasoning 181 wrote down for
-- filing the Funding Mastery course under 'consulting'.
INSERT INTO products (
  org_id, code, name, description, category,
  default_price, min_price, max_price, price_is_variable,
  default_success_fee_percent, sort_order, notes
)
SELECT o.id, v.code, v.name, v.description, v.category,
       v.default_price, NULL::numeric(14,2), NULL::numeric(14,2), true,
       NULL::numeric, v.sort_order, v.notes
  FROM orgs o
  CROSS JOIN (VALUES
    (
      'diy-letter-pack', 'DIY Dispute Letter Pack',
      'The DIY dispute letter downsell, delivered by ds-02. Split off '
      'consulting-package on 2026-09-17 so a payment resolves to exactly one '
      'product: that code is the $5,000 Capital Blueprint and only that.',
      'consulting',
      1000.00, 35,
      'Name must keep containing "DIY" — src/workflows/ds-02-diy-letters.mjs '
      'isDiyProduct() gates the letters workflow on the product NAME.'
    )
  ) AS v(code, name, description, category, default_price, sort_order, notes)
 WHERE o.is_default
   AND NOT EXISTS (
     SELECT 1 FROM products p WHERE p.org_id = o.id AND lower(p.code) = lower(v.code)
   );

-- ---------------------------------------------------------------------------
-- 2. Its vendor routing string.
--
-- ONE ALIAS, AND ONLY ONE. It is the Commas title this product now carries in
-- src/config/offers.mjs COMMAS_TITLE_BY_PRODUCT_CODE, copied from there rather
-- than invented here. Inbound receipts carry a product STRING, and
-- resolve_product_id() (010_products.sql) turns that string into this product.
--
-- READ THIS BEFORE EXPECTING IT TO DO ANYTHING: a "Consulting Services Letters"
-- product does not exist in Commas yet. Until Chris creates one, a DIY payment
-- taken on the old "Consulting Services Package" checkout still resolves to the
-- Capital Blueprint, because resolveProductId() matches the NAME before it falls
-- back to the bucket. That is the one remaining step this lane cannot do from
-- the repository, and it is named rather than hidden.
INSERT INTO product_aliases (org_id, product_id, alias, source)
SELECT p.org_id, p.id, v.alias, v.source
  FROM products p
  JOIN orgs o ON o.id = p.org_id AND o.is_default
  JOIN (VALUES
    ('diy-letter-pack', 'Consulting Services Letters', 'commas')
  ) AS v(code, alias, source) ON lower(v.code) = lower(p.code)
 WHERE NOT EXISTS (
   SELECT 1 FROM product_aliases a
    WHERE a.org_id = p.org_id AND lower(a.alias) = lower(v.alias)
 );

-- ---------------------------------------------------------------------------
-- 3. What the DIY product unlocks.
--
-- metro2-letter-pack, and nothing else. 032_entitlements.sql's own catalogue
-- entry for that code reads "The paid DIY letter pack. Delivered by ds-02." —
-- this is that sentence written as a row. duration_days NULL: perpetual, the
-- no-decision value every other row carries. A delivered document stays
-- delivered.
--
-- It does NOT get credit-optimization-roadmap. That is the Capital Blueprint's
-- deliverable, and granting it to a $1,000 letter buyer is the same defect as
-- the one this file closes, pointing the other way.
INSERT INTO product_entitlements (org_id, product_code, entitlement_code, duration_days)
SELECT o.id, v.product_code, v.entitlement_code, NULL::integer
  FROM orgs o
  CROSS JOIN (VALUES
    ('diy-letter-pack', 'metro2-letter-pack')
  ) AS v(product_code, entitlement_code)
 WHERE o.is_default
   AND NOT EXISTS (
     SELECT 1 FROM product_entitlements pe
      WHERE pe.org_id = o.id
        AND lower(btrim(pe.product_code)) = v.product_code
        AND pe.entitlement_code = v.entitlement_code
   )
   -- Never map to a code the catalogue does not hold: a grant of an uncatalogued
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

-- ---------------------------------------------------------------------------
-- 4. THE PART THAT ACTUALLY UNLOCKS A PERSON: reconcile the ledger.
--
-- Everything above is configuration, and configuration unlocks nobody who has
-- already paid. The grant that opens a tile lives in `entitlements`, and it is
-- written ONCE, at the moment the payment is processed, from the mapping as it
-- stood that day. 383 proved this the expensive way: its row went in at 23:13 on
-- 2026-09-17 and the $5,000 Blueprint buyer, granted at 17:46, stayed locked.
--
-- So this walks every SUCCEEDED transaction and writes the grants its product is
-- mapped to but the client does not already hold from it. This is the same rule
-- src/entitlements/entitlements.mjs reconcileFromTransactions() applies at
-- runtime; that function is the repeatable operator path, this statement is the
-- one-shot that makes today's buyers whole on the deploy that ships it.
--
-- HOW THE PRODUCT IS IDENTIFIED: resolve_product_id(), the shipped resolver from
-- 010_products.sql — current product name first, then any alias. NEVER the
-- amount (Hard Rule 4). A product_name matching no product and no alias grants
-- nothing and is left alone; inventing a product for it would be guessing what
-- somebody bought.
--
-- WHY IT CANNOT TAKE ANYTHING AWAY:
--   * INSERT only. No UPDATE, no DELETE, no revoke.
--   * ON CONFLICT DO NOTHING against idx_entitlements_grant_unique
--     (org_id, client_id, entitlement_code, source_transaction_id) — so a grant
--     that already exists is untouched, and running this twice changes nothing.
--   * That same index is why a DELIBERATELY REVOKED grant is not resurrected: the
--     revoked row still occupies the key, so the insert conflicts and does
--     nothing. A refund or chargeback somebody acted on stays acted on. This is
--     the identical rule grant() enforces in code, which reinstates only when a
--     caller explicitly asks it to.
--
-- 'succeeded' IS THE WHOLE SET of paid statuses, not a shortlist:
-- src/handlers/client-lifecycle.mjs recordTransaction() writes 'succeeded' or
-- 'failed' and nothing anywhere UPDATEs transactions.status afterwards. A refund
-- is a separate event that voids the partner accrual and deliberately leaves the
-- entitlement standing (src/handlers/money-chain.mjs: "A refunded course is still
-- unlocked").
--
-- TERM-LIMITED MAPPINGS ARE DELIBERATELY SKIPPED (duration_days IS NULL only).
-- Every row in product_entitlements today is NULL, so nothing is missed. If one
-- ever is not, the date a term should have STARTED for a payment taken months ago
-- is not something the data says, and stamping now() on it would invent an answer
-- rather than report the gap. NULL means unknown and must survive.
INSERT INTO entitlements (
  org_id, client_id, entitlement_code, source_transaction_id,
  grant_reason, granted_at, expires_at
)
SELECT t.org_id,
       t.client_id,
       lower(btrim(pe.entitlement_code)),
       t.id,
       'reconcile:' || lower(btrim(p.code)),
       now(),
       NULL::timestamptz
  FROM transactions t
  JOIN products p
    ON p.id = resolve_product_id(t.org_id, t.product_name)
  JOIN product_entitlements pe
    ON pe.org_id = t.org_id
   AND lower(btrim(pe.product_code)) = lower(btrim(p.code))
   AND pe.duration_days IS NULL
 WHERE lower(btrim(COALESCE(t.status, ''))) = 'succeeded'
   AND t.client_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM entitlement_catalog ec
      WHERE ec.org_id = t.org_id
        AND ec.code = lower(btrim(pe.entitlement_code))
        AND ec.active
   )
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Say what happened, in the migration log, for the one client this was for.
-- A NOTICE only — it reads, it never writes.
DO $notice$
DECLARE n integer; blueprint integer;
BEGIN
  SELECT count(*) INTO n
    FROM entitlements WHERE grant_reason LIKE 'reconcile:%';
  SELECT count(*) INTO blueprint
    FROM entitlements
   WHERE client_id = '029964c5-4d8e-47ed-88c9-53ac13863fd4'
     AND entitlement_code = 'credit-optimization-roadmap'
     AND revoked_at IS NULL;
  RAISE NOTICE 'reconcile wrote % grant(s) in total; Sim Eleven-Blueprint holds % live Capital Blueprint grant(s)', n, blueprint;
END $notice$;

COMMIT;
