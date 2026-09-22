-- ---------------------------------------------------------------------------
-- Middle name and name suffix on the identity record (the $297 pull form).
--
-- WHY THIS EXISTS
-- The credit bureaus match a person on name, date of birth, Social Security
-- number and address. CRS says a middle name and a suffix (JR, SR, II ...)
-- help a bureau find the right file. Until now the pull form did not ask for
-- either, and src/finance/crs-pull.mjs loadClientIdentity() sent both as ""
-- on every real pull, because there was nowhere to keep them.
--
-- WHERE THEY LIVE
-- On pii_identity, beside the date of birth and the addresses, because that is
-- the row loadClientIdentity() already joins when it builds a bureau request.
-- Not on clients: clients.first_name / last_name are what every screen and
-- email greets the person by; the middle name and suffix are only ever sent to
-- a bureau.
--
-- NULL MEANS "NOT GIVEN". Both are optional on the form. A blank is stored as
-- NULL, never as "".
--
-- THE SUFFIX LIST IS SHORT ON PURPOSE. JR, SR, II, III, IV. The spec's
-- "III to X" does not fit Equifax, whose suffix field holds 2 characters
-- (independent check, docs/specs/roadmap-checkout-soft-pull-2026-09-22.md).
-- The request builder sends only what fits each bureau; this list is what the
-- form may store. Widening it is a new migration, not an edit to this one.
-- ---------------------------------------------------------------------------

ALTER TABLE pii_identity
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS name_suffix text;

ALTER TABLE pii_identity
  DROP CONSTRAINT IF EXISTS pii_identity_middle_name_shape;
ALTER TABLE pii_identity
  ADD CONSTRAINT pii_identity_middle_name_shape
  CHECK (middle_name IS NULL OR char_length(btrim(middle_name)) BETWEEN 1 AND 15);

ALTER TABLE pii_identity
  DROP CONSTRAINT IF EXISTS pii_identity_name_suffix_allowed;
ALTER TABLE pii_identity
  ADD CONSTRAINT pii_identity_name_suffix_allowed
  CHECK (name_suffix IS NULL OR name_suffix IN ('JR', 'SR', 'II', 'III', 'IV'));

COMMENT ON COLUMN pii_identity.middle_name IS
  'Middle name as typed on the $297 pull form. NULL = not given. Sent to the bureaus by loadClientIdentity().';
COMMENT ON COLUMN pii_identity.name_suffix IS
  'Name suffix: JR, SR, II, III or IV. NULL = none. Equifax gets it only when it fits 2 characters.';
