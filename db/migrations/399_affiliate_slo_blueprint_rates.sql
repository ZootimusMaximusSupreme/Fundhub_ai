-- 399_affiliate_slo_blueprint_rates.sql
--
-- Affiliates can earn on the $297 roadmap (paid slo_* diagnostic order) and
-- the $5,000 Capital Blueprint (consulting-package). Same owner-set rates as
-- repair: 20% direct / 5% downline of sale_price. Never UPDATE a live percent.

DO $$
DECLARE
  v_start timestamptz := '2026-09-29T00:00:00Z';
  v_note  text := 'Owner-set 2026-09-29. Roadmap + Capital Blueprint. Tier1 20% / Tier2 5%.';
  r RECORD;
  v_diag uuid;
  v_blueprint uuid;
BEGIN
  FOR r IN SELECT id AS org_id FROM orgs LOOP
    SELECT id INTO v_diag
      FROM products
     WHERE org_id = r.org_id AND code = 'diagnostic'
     LIMIT 1;
    SELECT id INTO v_blueprint
      FROM products
     WHERE org_id = r.org_id AND code = 'consulting-package'
     LIMIT 1;

    IF v_diag IS NOT NULL THEN
      INSERT INTO affiliate_commission_rules (
        org_id, name, description, tier, product_id,
        calc_method, percent, amount_basis, scope_rule,
        effective_from, active, notes
      )
      SELECT r.org_id,
             'Affiliate — direct roadmap',
             'Owner-set Tier 1: 20% of the $297 roadmap sale.',
             'direct', v_diag,
             'percent', 20, 'sale_price', 'first_paid_product',
             v_start, true,
             v_note
       WHERE NOT EXISTS (
         SELECT 1 FROM affiliate_commission_rules
          WHERE org_id = r.org_id
            AND tier = 'direct'
            AND product_id = v_diag
            AND affiliate_id IS NULL
            AND active
            AND effective_to IS NULL
            AND percent = 20
            AND amount_basis = 'sale_price'
       );

      INSERT INTO affiliate_commission_rules (
        org_id, name, description, tier, product_id,
        calc_method, percent, amount_basis, scope_rule,
        effective_from, active, notes
      )
      SELECT r.org_id,
             'Affiliate — downline roadmap',
             'Owner-set Tier 2: 5% override on the $297 roadmap sale.',
             'downline', v_diag,
             'percent', 5, 'sale_price', 'first_paid_product',
             v_start, true,
             v_note
       WHERE NOT EXISTS (
         SELECT 1 FROM affiliate_commission_rules
          WHERE org_id = r.org_id
            AND tier = 'downline'
            AND product_id = v_diag
            AND affiliate_id IS NULL
            AND active
            AND effective_to IS NULL
            AND percent = 5
            AND amount_basis = 'sale_price'
       );
    END IF;

    IF v_blueprint IS NOT NULL THEN
      INSERT INTO affiliate_commission_rules (
        org_id, name, description, tier, product_id,
        calc_method, percent, amount_basis, scope_rule,
        effective_from, active, notes
      )
      SELECT r.org_id,
             'Affiliate — direct Capital Blueprint',
             'Owner-set Tier 1: 20% of the $5,000 Capital Blueprint sale.',
             'direct', v_blueprint,
             'percent', 20, 'sale_price', 'first_paid_product',
             v_start, true,
             v_note
       WHERE NOT EXISTS (
         SELECT 1 FROM affiliate_commission_rules
          WHERE org_id = r.org_id
            AND tier = 'direct'
            AND product_id = v_blueprint
            AND affiliate_id IS NULL
            AND active
            AND effective_to IS NULL
            AND percent = 20
            AND amount_basis = 'sale_price'
       );

      INSERT INTO affiliate_commission_rules (
        org_id, name, description, tier, product_id,
        calc_method, percent, amount_basis, scope_rule,
        effective_from, active, notes
      )
      SELECT r.org_id,
             'Affiliate — downline Capital Blueprint',
             'Owner-set Tier 2: 5% override on the $5,000 Capital Blueprint sale.',
             'downline', v_blueprint,
             'percent', 5, 'sale_price', 'first_paid_product',
             v_start, true,
             v_note
       WHERE NOT EXISTS (
         SELECT 1 FROM affiliate_commission_rules
          WHERE org_id = r.org_id
            AND tier = 'downline'
            AND product_id = v_blueprint
            AND affiliate_id IS NULL
            AND active
            AND effective_to IS NULL
            AND percent = 5
            AND amount_basis = 'sale_price'
       );
    END IF;
  END LOOP;
END $$;
