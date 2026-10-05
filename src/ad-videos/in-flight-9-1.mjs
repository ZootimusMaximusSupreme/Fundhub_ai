// src/ad-videos/in-flight-9-1.mjs — what to do with takes caught mid-pipeline
// when the order changed (spec §9.1 "Rows already in flight").
//
// Pure. It reads rows and returns a plan; scripts/ad-videos-move-in-flight-9-1.mjs
// prints the plan (dry run) and writes it only with --apply.
//
// In the old order Submagic ran BEFORE the match, on the raw take. The spec's
// rules for those rows:
//
//   * `editing` and `transcribed`, plus `staged` and `matched` with no
//     exported_at → back to `raw_landed`. The old Submagic project id is kept
//     in last_step_note and taken off the row, so the new order makes its own
//     project from the cut master instead of resuming the uncut one.
//   * `matched` with exported_at → `editing`. The export was already paid for,
//     so the pipeline polls it rather than spending again.
//
// Two things this does NOT decide, and reports instead:
//   * a row the rules above would move but that already holds a render
//     (rendered_at set) — a person looks first;
//   * an ad with two or more takes in a master state (cut through
//     awaiting_approval). Migration 416's ad_videos_one_master_uq allows one.
//     Which take stays is Chris's call.

export const MASTER_STATES = Object.freeze([
  "cut", "staged", "editing", "rendered", "animated", "awaiting_approval"
]);

const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";

/** One row → { id, from, to, note } or null when the rules leave it alone. */
export function planRow(row) {
  const s = String(row?.status || "");
  const exported = has(row?.exported_at);
  const back = s === "editing" || s === "transcribed" ||
    ((s === "staged" || s === "matched") && !exported);

  if (back) {
    if (has(row.rendered_at)) {
      return { id: row.id, from: s, to: null,
        note: "left alone: it already holds a render — a person decides" };
    }
    const project = has(row.submagic_project_id) ? row.submagic_project_id : "none";
    return { id: row.id, from: s, to: "raw_landed",
      note: `moved back by the 9.1 in-flight script; old Submagic project ${project}` };
  }
  if (s === "matched" && exported) {
    return { id: row.id, from: s, to: "editing",
      note: "moved by the 9.1 in-flight script; the export was already asked for, so it is polled" };
  }
  return null;
}

/** All rows → { moves, leftAlone, doubleMasters }. */
export function planMoves(rows = []) {
  const moves = [];
  const leftAlone = [];
  const after = [];
  for (const row of rows) {
    const p = planRow(row);
    if (p && p.to) moves.push(p);
    else if (p) leftAlone.push(p);
    after.push({ ...row, status: p?.to || row.status });
  }

  const byAd = new Map();
  for (const r of after) {
    if (!MASTER_STATES.includes(r.status) || !has(r.ad_id)) continue;
    const key = `${r.org_id}|${r.ad_id}`;
    if (!byAd.has(key)) byAd.set(key, []);
    byAd.get(key).push({ id: r.id, status: r.status, take_no: r.take_no ?? null });
  }
  const doubleMasters = [...byAd.entries()]
    .filter(([, takes]) => takes.length > 1)
    .map(([key, takes]) => ({ ad_id: key.split("|")[1], takes }));

  return { moves, leftAlone, doubleMasters };
}
