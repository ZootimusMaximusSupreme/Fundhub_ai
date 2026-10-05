// Database counter for the Clarity Data Export adapter.
// Microsoft allows 10 requests per project per UTC day (the adapter passes that
// cap in). The daily sweeper also keeps to its own smaller cap: 2 a day.
// One atomic upsert per request, so two overlapping runs cannot both pass.

export const CLARITY_MACHINE_DAILY_CAP = 2;

/**
 * @param {import('pg').Client | import('pg').Pool} db
 * @param {object} opts
 * @param {string} opts.orgId
 * @param {number} [opts.machineCap] sweeper's own cap per project per day
 */
export function clarityDbCounter(db, { orgId, machineCap = CLARITY_MACHINE_DAILY_CAP } = {}) {
  return {
    async reserve(projectId, dateUtc, cap) {
      const { rows } = await db.query(
        `INSERT INTO clarity_export_calls AS t
           (org_id, project_id, day_utc, calls, machine_calls)
         SELECT $1::uuid, $2::text, $3::date, 1, 1
          WHERE $4::int >= 1 AND $5::int >= 1
         ON CONFLICT (org_id, project_id, day_utc) DO UPDATE
           SET calls = t.calls + 1,
               machine_calls = t.machine_calls + 1,
               updated_at = now()
           WHERE t.calls < $4::int AND t.machine_calls < $5::int
         RETURNING t.calls, t.machine_calls`,
        [orgId, projectId, dateUtc, cap, machineCap],
      );
      if (rows.length === 1) {
        return { ok: true, calls: rows[0].calls, machineCalls: rows[0].machine_calls };
      }
      return { ok: false, reason: `Microsoft cap ${cap}/day or sweeper cap ${machineCap}/day` };
    },
  };
}
