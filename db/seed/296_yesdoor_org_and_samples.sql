-- 296_yesdoor_org_and_samples.sql — the Yesdoor org, state rules, and clearly
-- flagged ARIZONA SAMPLE data for the MVP demo.
--
-- Lives in db/seed because db/migrate.mjs applies schema/, migrations/ and then
-- seed/, so the tables from 434-436 exist by the time this runs. Safe to re-run:
-- every insert is guarded.
--
-- *** EVERYTHING BELOW THE STATE RULES IS SAMPLE DATA. ***
-- Companies, buildings, rules and listings are MADE UP (is_sample = true).
-- Names, street addresses and rents are invented for the demo; cities and ZIP
-- codes are real Phoenix-area places so search works. No building here has
-- signed anything, and none is real. The site must label them "Sample listing"
-- until real buildings sign (docs/specs/yesdoor-mvp-2026-10-07.md §3). Rents sit
-- around the researched $1,550 Phoenix average. Latitude/longitude are rough
-- city-centre points, nudged apart per building, not surveyed locations.

-- ---------------------------------------------------------------------------
-- The org (own org row, spec §0.1)
-- ---------------------------------------------------------------------------

INSERT INTO orgs (slug, name, is_default)
VALUES ('yesdoor', 'Yesdoor', false)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- State rules (spec §2). CA has two. AZ has none on file, said out loud so
-- "no rule" is a recorded fact and not a missing row.
-- ---------------------------------------------------------------------------

INSERT INTO yd_state_rules (org_id, state, key, value)
SELECT o.id, v.state, v.key, v.value::jsonb
  FROM orgs o
 CROSS JOIN (VALUES
   ('CA', 'screening_fee_cap',
    '{"amount_cents": 6600, "approximate": true, "note": "California caps the application screening fee, about $66 per the Yesdoor spec (section 16). The cap adjusts yearly: confirm the current figure before enforcing it."}'),
   ('CA', 'background_check_notice_required',
    '{"required": true, "notice": "California background checks need the ICRAA notice and the free-copy box (Yesdoor spec section 10, question 2)."}'),
   ('AZ', 'state_rules_on_file',
    '{"on_file": false, "note": "No Arizona-specific screening rules are on file (Yesdoor spec 2026-10-07). This records that none were seeded; it is not a legal finding."}')
 ) AS v(state, key, value)
WHERE o.slug = 'yesdoor'
ON CONFLICT (org_id, state, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SAMPLE companies
-- ---------------------------------------------------------------------------

INSERT INTO yd_companies (org_id, name, tier, hq_state, software, status, is_sample)
SELECT o.id, v.name, v.tier, 'AZ', v.software, 'target', true
  FROM orgs o
 CROSS JOIN (VALUES
   ('Sunvale Residential Partners', 2, 'yardi'),
   ('Ironwood Row Properties',      3, 'realpage'),
   ('Cactus Bloom Communities',     4, 'other')
 ) AS v(name, tier, software)
WHERE o.slug = 'yesdoor'
ON CONFLICT (org_id, lower(name)) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SAMPLE buildings (8): Phoenix, Tempe, Scottsdale, Mesa, Chandler
-- fee: percent of first month (default ask 100) or a flat amount
-- app_fee_cents NULL on one building = "we do not know its application fee"
-- ---------------------------------------------------------------------------

INSERT INTO yd_buildings
  (org_id, company_id, name, address, city, state, zip, lat, lng, units_count,
   software, connection, leasing_email, tour_hours,
   app_fee_cents, app_fee_waived, second_chance,
   fee_kind, fee_percent, fee_flat_cents, status, is_sample)
SELECT o.id, c.id, v.name, v.address, v.city, 'AZ', v.zip, v.lat, v.lng, v.units,
       v.software, 'manual', v.email,
       '{"mon-fri": "09:00-17:00", "sat": "10:00-16:00"}'::jsonb,
       v.app_fee, false, v.second_chance,
       v.fee_kind, v.fee_percent, v.fee_flat, 'target', true
  FROM orgs o
  JOIN (VALUES
    ('Sunvale Residential Partners', 'Alder Row Lofts',      '1200 E Alder Row Way',     'Phoenix',    '85004', 33.4530, -112.0640, 180, 'yardi',    'leasing@alder-row.example',    5000::bigint, false, 'percent_first_month', 100::numeric, NULL::bigint),
    ('Sunvale Residential Partners', 'Canyon Vista',         '640 S Canyon Vista Dr',    'Tempe',      '85281', 33.4210, -111.9330, 240, 'yardi',    'leasing@canyon-vista.example', 5000::bigint, false, 'percent_first_month', 100::numeric, NULL::bigint),
    ('Sunvale Residential Partners', 'Saguaro Court',        '2210 W Saguaro Court',     'Mesa',       '85201', 33.4190, -111.8450, 150, 'yardi',    'leasing@saguaro-court.example',4500::bigint, false, 'percent_first_month',  75::numeric, NULL::bigint),
    ('Ironwood Row Properties',      'Ironwood Terrace',     '7700 N Ironwood Terrace',  'Scottsdale', '85251', 33.4990, -111.9210, 120, 'realpage', 'leasing@ironwood-terrace.example', 5500::bigint, false, 'percent_first_month', 100::numeric, NULL::bigint),
    ('Ironwood Row Properties',      'The Larkspur',         '3300 E Larkspur Lane',     'Phoenix',    '85016', 33.5090, -112.0210, 210, 'realpage', 'leasing@larkspur.example',     5000::bigint, false, 'flat',                NULL::numeric, 100000::bigint),
    ('Ironwood Row Properties',      'Mesquite Flats',       '910 N Mesquite Flats Rd',  'Chandler',   '85224', 33.3120, -111.8500, 96,  'realpage', 'leasing@mesquite-flats.example', 4500::bigint, false, 'percent_first_month', 100::numeric, NULL::bigint),
    ('Cactus Bloom Communities',     'Desert Bloom Flats',   '1450 W Desert Bloom Ave',  'Chandler',   '85226', 33.2990, -111.8680, 132, 'other',    'leasing@desert-bloom.example',   NULL::bigint, false, 'percent_first_month', 100::numeric, NULL::bigint),
    ('Cactus Bloom Communities',     'Rio Seco Residences',  '5120 E Rio Seco Blvd',     'Mesa',       '85210', 33.3980, -111.8120, 88,  'other',    'leasing@rio-seco.example',       4000::bigint, false, 'percent_first_month', 100::numeric, NULL::bigint)
  ) AS v(company, name, address, city, zip, lat, lng, units, software, email, app_fee, second_chance, fee_kind, fee_percent, fee_flat)
    ON true
  JOIN yd_companies c ON c.org_id = o.id AND lower(c.name) = lower(v.company)
 WHERE o.slug = 'yesdoor'
   AND NOT EXISTS (SELECT 1 FROM yd_buildings b WHERE b.org_id = o.id AND lower(b.name) = lower(v.name));

-- The three Second Chance buildings (the rules below accept past evictions and
-- case-by-case records). Flagged here rather than in the VALUES list above so
-- the column list there stays short.
UPDATE yd_buildings
   SET second_chance = true
 WHERE is_sample = true
   AND org_id = (SELECT id FROM orgs WHERE slug = 'yesdoor')
   AND name IN ('Mesquite Flats', 'Desert Bloom Flats', 'Rio Seco Residences');

-- ---------------------------------------------------------------------------
-- SAMPLE rules: ONE version per building. Five standard, three second-chance.
-- criminal_policy values: years-ago number, "never" or "case_by_case".
-- ---------------------------------------------------------------------------

INSERT INTO yd_building_rules
  (org_id, building_id, version, confirmed_at, min_score, income_multiple,
   max_evictions, eviction_lookback_years, criminal_policy, accepts_second_chance,
   notes, source)
SELECT o.id, b.id, 1, now(), v.min_score, v.multiple,
       v.max_ev, v.lookback, v.criminal::jsonb, v.second_chance,
       'SAMPLE DATA: made up for the Yesdoor demo. Not a real building''s rules.', 'staff'
  FROM orgs o
  JOIN (VALUES
    ('Alder Row Lofts',     660, 3.0::numeric, 0, 7, '{"felony": 7, "misdemeanor": 3, "violent": "never"}', false),
    ('Canyon Vista',        650, 3.0::numeric, 0, 7, '{"felony": 7, "misdemeanor": 3, "violent": "never"}', false),
    ('Saguaro Court',       640, 3.0::numeric, 0, 5, '{"felony": 7, "misdemeanor": 2, "violent": "never"}', false),
    ('Ironwood Terrace',    680, 3.0::numeric, 0, 7, '{"felony": 10, "misdemeanor": 5, "violent": "never"}', false),
    ('The Larkspur',        660, 3.0::numeric, 0, 7, '{"felony": 7, "misdemeanor": 3, "violent": "never"}', false),
    ('Mesquite Flats',      560, 2.5::numeric, 1, 3, '{"felony": "case_by_case", "misdemeanor": 1, "violent": "never"}', true),
    ('Desert Bloom Flats',  520, 2.5::numeric, 1, 3, '{"felony": "case_by_case", "misdemeanor": 1, "violent": "never"}', true),
    ('Rio Seco Residences', 540, 3.0::numeric, 1, 3, '{"felony": "case_by_case", "misdemeanor": 2, "violent": "never"}', true)
  ) AS v(name, min_score, multiple, max_ev, lookback, criminal, second_chance) ON true
  JOIN yd_buildings b ON b.org_id = o.id AND lower(b.name) = lower(v.name) AND b.is_sample
 WHERE o.slug = 'yesdoor'
   AND NOT EXISTS (SELECT 1 FROM yd_building_rules r WHERE r.building_id = b.id);

-- ---------------------------------------------------------------------------
-- SAMPLE listings: 24 (3 per building), rents $1,200 - $2,400.
-- beds 0 = studio. available_on is days from the day this seed runs.
-- ---------------------------------------------------------------------------

INSERT INTO yd_listings
  (org_id, building_id, unit_label, beds, baths, sqft, rent_cents, available_on,
   specials, photos, source, active, is_sample)
SELECT o.id, b.id, v.unit, v.beds, v.baths, v.sqft, v.rent, current_date + v.days,
       v.specials, '[]'::jsonb, 'manual', true, true
  FROM orgs o
  JOIN (VALUES
    ('Alder Row Lofts',     '204', 0, 1.0::numeric,  520, 135000, 5,  NULL),
    ('Alder Row Lofts',     '311', 1, 1.0::numeric,  690, 162500, 12, 'Sample special: 6 weeks free on a 14-month lease'),
    ('Alder Row Lofts',     '507', 2, 2.0::numeric, 1010, 214000, 30, NULL),
    ('Canyon Vista',        '1B',  1, 1.0::numeric,  720, 158000, 3,  NULL),
    ('Canyon Vista',        '2D',  2, 2.0::numeric, 1040, 199000, 20, 'Sample special: reduced deposit'),
    ('Canyon Vista',        '3A',  3, 2.0::numeric, 1280, 236000, 45, NULL),
    ('Saguaro Court',       '101', 0, 1.0::numeric,  480, 120000, 2,  NULL),
    ('Saguaro Court',       '118', 1, 1.0::numeric,  650, 142500, 9,  NULL),
    ('Saguaro Court',       '230', 2, 1.5::numeric,  920, 178000, 25, 'Sample special: one month free'),
    ('Ironwood Terrace',    '12',  1, 1.0::numeric,  760, 174000, 7,  NULL),
    ('Ironwood Terrace',    '24',  2, 2.0::numeric, 1120, 224000, 14, NULL),
    ('Ironwood Terrace',    '31',  3, 2.5::numeric, 1390, 240000, 60, NULL),
    ('The Larkspur',        'A5',  0, 1.0::numeric,  540, 131000, 4,  NULL),
    ('The Larkspur',        'B9',  1, 1.0::numeric,  710, 159000, 10, 'Sample special: waived admin fee'),
    ('The Larkspur',        'C2',  2, 2.0::numeric, 1060, 205000, 28, NULL),
    ('Mesquite Flats',      '7',   1, 1.0::numeric,  640, 139500, 1,  NULL),
    ('Mesquite Flats',      '15',  2, 1.0::numeric,  880, 168000, 8,  NULL),
    ('Mesquite Flats',      '22',  3, 2.0::numeric, 1150, 212000, 35, NULL),
    ('Desert Bloom Flats',  '3A',  0, 1.0::numeric,  500, 124000, 6,  NULL),
    ('Desert Bloom Flats',  '4C',  1, 1.0::numeric,  670, 146000, 11, 'Sample special: 4 weeks free'),
    ('Desert Bloom Flats',  '6B',  2, 2.0::numeric,  980, 183500, 22, NULL),
    ('Rio Seco Residences', '110', 1, 1.0::numeric,  660, 141000, 3,  NULL),
    ('Rio Seco Residences', '204', 2, 2.0::numeric,  940, 176500, 18, NULL),
    ('Rio Seco Residences', '305', 3, 2.0::numeric, 1210, 219000, 40, 'Sample special: reduced deposit')
  ) AS v(name, unit, beds, baths, sqft, rent, days, specials) ON true
  JOIN yd_buildings b ON b.org_id = o.id AND lower(b.name) = lower(v.name) AND b.is_sample
 WHERE o.slug = 'yesdoor'
ON CONFLICT (building_id, lower(unit_label)) DO NOTHING;
