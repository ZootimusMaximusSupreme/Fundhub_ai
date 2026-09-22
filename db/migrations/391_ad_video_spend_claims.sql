-- 391_ad_video_spend_claims.sql — the mark goes down BEFORE the money goes out.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS CLOSES: THE MARK WAS WRITTEN AFTER THE BILL
--
-- 390 gave every step an "did this already run?" column, and src/ad-videos/
-- pipeline.mjs reads them. But every one of those marks was written AFTER the
-- vendor call came back, and the sweeper writes them in a separate statement
-- after the step returns. So there is a window — the whole length of an upload
-- of a two-hundred-megabyte video — where Submagic has already been told to
-- make a project and this database still says nothing happened.
--
-- A serverless function can be killed inside that window. Inngest retries. The
-- next pass reads a row with no submagic_project_id, believes nothing was sent,
-- and creates a SECOND project. Both are billed. Neither is a bug anyone can
-- see afterwards, because the row ends up looking exactly like a take that was
-- created once.
--
-- The two columns below are the claim. A step writes its claim first, calls the
-- vendor second, and clears the claim when the vendor answers. A crash between
-- the two leaves the claim standing, and a standing claim is what stops the next
-- pass spending again.
--
-- WHY TWO COLUMNS AND NOT A REUSE OF exported_at. exported_at means "Submagic
-- accepted the export" and 390's ad_videos_render_order_ck leans on it. A claim
-- means "we are about to ask, and we do not yet know". Those are different
-- facts and a row that confuses them cannot be read by a person later.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ad_videos
  -- submagicCreate: written immediately before the create/upload call.
  -- Cleared when Submagic answers, in the same patch that stores the project id.
  ADD COLUMN IF NOT EXISTS submagic_claimed_at timestamptz,
  -- placeBrollAndExport: written immediately before the export call.
  -- Cleared when Submagic answers, in the same patch that stores exported_at.
  ADD COLUMN IF NOT EXISTS export_claimed_at   timestamptz;

COMMENT ON COLUMN ad_videos.submagic_claimed_at IS
  'Written the instant before POST /v1/projects/upload and cleared the instant it answers. A value here with no submagic_project_id means a create was started and never came back — a crash mid-upload. src/ad-videos/pipeline.mjs REFUSES to create again while it stands, because Submagic has no list endpoint (GET /v1/projects is a 404, measured 2026-09-22) and so nothing here can find out whether the first one landed. A person clears it by retrying the take.';
COMMENT ON COLUMN ad_videos.export_claimed_at IS
  'Written the instant before the Submagic export and cleared the instant it answers. A value here with no exported_at means an export was started and never came back. The pipeline POLLS instead of exporting again: a poll costs nothing and answers definitively, where a second export bills API minutes against a 50-an-hour cap.';
