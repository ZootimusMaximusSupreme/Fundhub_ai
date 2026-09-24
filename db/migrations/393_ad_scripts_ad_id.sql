-- A script carries its ad number, because the pipeline has always assumed it did.
--
-- src/ad-videos/match.mjs asks for "the locked scripts that have an ad number"
-- and returns that candidate's adId; src/ad-videos/pipeline.mjs then stops a
-- take dead when "the matched script carries no ad number". Every part of the
-- ad-video pipeline was written as if this column existed. It did not. There
-- was no home for our number on a script anywhere: the label spine puts it on
-- an `ads` row, which is a Meta-side record that needs a connection, a campaign
-- and an ad set — none of which exist before Paul builds the ad, and all of
-- which come AFTER filming.
--
-- Measured 2026-09-24 on the first real take: the matcher was handed one
-- unrelated script with no number, said so correctly, and the take failed.
-- With the seven locked ads loaded it would have failed on the very next line
-- instead, because none of them could carry a number either.
--
-- Same shape as ad_videos.ad_id (389): our number, unpadded, text. NULL is a
-- normal script that is not an ad yet. One live script per number per org.

ALTER TABLE ad_scripts
  ADD COLUMN IF NOT EXISTS ad_id text;

ALTER TABLE ad_scripts DROP CONSTRAINT IF EXISTS ad_scripts_ad_id_ck;
ALTER TABLE ad_scripts ADD CONSTRAINT ad_scripts_ad_id_ck
  CHECK (ad_id IS NULL OR ad_id ~ '^(0|[1-9][0-9]{0,8})$');

CREATE UNIQUE INDEX IF NOT EXISTS ad_scripts_live_ad_id_uq
  ON ad_scripts (org_id, ad_id)
  WHERE ad_id IS NOT NULL AND archived_at IS NULL;

COMMENT ON COLUMN ad_scripts.ad_id IS
  'Our ad number for this script, unpadded (43, never 043). NULL when the script is not an ad. '
  'What the video pipeline writes onto the take, the Drive file name, the folder and the landing link.';
