-- 437_yesdoor_cancel_after_registration.sql — Yesdoor B4: let a renter withdraw
-- after the building has been told about them.
--
-- WHY. Spec §3 has one way out of an application before the lease: booked ->
-- cancelled. But booking a tour registers the renter with the building in the
-- same step (booked -> registered), so by the time a renter can tap "cancel" the
-- application is already `registered`, and there was NO arrow out of it. The
-- application then stayed open, held one of the renter's 3 places (the cap), and
-- three cancelled tours locked a renter out of the product until a building
-- happened to mark a no-show.
--
-- WHAT. Two more arrows, and only these two:
--     registered -> cancelled     (renter cancels the tour)
--     toured     -> cancelled     (renter tours, then walks away before applying)
-- Everything else in yd_stage_move_ok (435) is unchanged. The registration
-- timestamp stays on a cancelled row: it is still the proof of who sent the
-- renter first, and the unique "one open application per renter and building"
-- index does not count cancelled rows, so the renter can book that building again.
--
-- 435 is not edited (an applied migration is a no-op to edit); this replaces the
-- function. src/yesdoor/stages.mjs holds the same list and a pg test fails if the
-- two drift.

CREATE OR REPLACE FUNCTION public.yd_stage_move_ok(p_from text, p_to text) RETURNS boolean AS $$
  SELECT (p_from, p_to) IN (
    ('booked', 'registered'),
    ('booked', 'cancelled'),
    ('registered', 'toured'),
    ('registered', 'no_show'),
    ('registered', 'cancelled'),
    ('toured', 'applied'),
    ('toured', 'cancelled'),
    ('applied', 'approved'),
    ('applied', 'denied'),
    ('approved', 'lease_signed'),
    ('lease_signed', 'moved_in'),
    ('moved_in', 'invoiced'),
    ('invoiced', 'paid'),
    ('paid', 'safe'),
    ('paid', 'refunded')
  );
$$ LANGUAGE sql IMMUTABLE;
