-- ---------------------------------------------------------------------------
-- The $297 /roadmap order keeps its own facts on its own row.
--
-- WHY THIS EXISTS (2026-09-22 review)
-- The /roadmap checkout finds or creates the buyer by EMAIL, and anyone can
-- type anyone's email. It used to stamp the order's ref and the number of
-- businesses paid for onto the CLIENT (custom_fields.slo_ref /
-- slo_businesses_paid) before any money moved, so a stranger typing a real
-- client's email overwrote that client's record. The order's facts now live
-- on the order row, payment_links, and nothing is written to an existing
-- client before the order is allowed to (src/slo/pull.mjs).
--
-- THE TWO COLUMNS
--   business_count      businesses the buyer put on this order (first free,
--                       each extra $15). NULL on every other kind of link, and
--                       NULL means "not recorded", which the pull reads as the
--                       free one.
--   identity_stored_at  the pii_identity.updated_at this order's pull form
--                       wrote. An unpaid order may not overwrite an identity
--                       it did not write itself (src/slo/pull.mjs,
--                       existing_account); this is how it knows its own. NULL
--                       = this order has stored nothing.
--
-- Only the SLO till (api/public/slo-checkout.mjs, src/slo/pull.mjs) writes
-- either column. Every other link keeps both NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS business_count integer,
  ADD COLUMN IF NOT EXISTS identity_stored_at timestamptz;

ALTER TABLE payment_links
  DROP CONSTRAINT IF EXISTS payment_links_business_count_ck;
ALTER TABLE payment_links
  ADD CONSTRAINT payment_links_business_count_ck
  CHECK (business_count IS NULL OR business_count BETWEEN 1 AND 20);

COMMENT ON COLUMN payment_links.business_count IS
  'Businesses on a $297 SLO order (first free, each extra $15). NULL on every other link = not recorded.';
COMMENT ON COLUMN payment_links.identity_stored_at IS
  'pii_identity.updated_at as this SLO order last wrote it. NULL = the order stored no identity. Read by src/slo/pull.mjs to tell its own identity from one on file before it.';
