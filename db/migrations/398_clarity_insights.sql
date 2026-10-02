-- Microsoft Clarity Data Export API snapshots (heatmaps/replays stay in Clarity UI).

CREATE TABLE IF NOT EXISTS clarity_insights_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id),

  project_id      text NOT NULL,
  num_of_days     smallint NOT NULL CHECK (num_of_days BETWEEN 1 AND 3),
  query_key       text NOT NULL,
  dimension1      text,
  dimension2      text,
  dimension3      text,

  snapshot_date   date NOT NULL DEFAULT (CURRENT_DATE),
  payload         jsonb NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clarity_insights_snapshots_uq
    UNIQUE (org_id, project_id, snapshot_date, query_key)
);

CREATE INDEX IF NOT EXISTS clarity_insights_snapshots_org_captured_idx
  ON clarity_insights_snapshots (org_id, captured_at DESC);

ALTER TABLE clarity_insights_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarity_insights_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clarity_insights_snapshots_staff_only ON clarity_insights_snapshots;
CREATE POLICY clarity_insights_snapshots_staff_only ON clarity_insights_snapshots
  USING (fundhub_is_staff()) WITH CHECK (fundhub_is_staff());

COMMENT ON TABLE clarity_insights_snapshots IS
  'Daily pull from Microsoft Clarity project-live-insights API. JSON payload; replays/heatmap PNGs are dashboard-only.';
