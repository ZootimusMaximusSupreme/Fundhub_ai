// Marketing machine settings: one row per org, created on first read with the
// defaults in the table (db/migrations/407_marketing_machine_tables.sql).
// Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 3.
//
// NULL MEANS UNKNOWN: winner_rule and caption_position_y stay null until Chris
// sets them. A patch that sends null clears them; nothing defaults them to 0.

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const FORMAT_KEYS = Object.freeze(["standard", "sorting", "long", "notes", "greenscreen", "vsl"]);
export const FORMAT_STYLES = Object.freeze(["bullets", "words"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (v, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= min && v <= max;
const isNum = (v, min, max = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function validTimezone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/* One entry per editable column: [validator, plain-language rule]. The columns
   not listed (org_id, updated_at, updated_by) are never writable from a request. */
const FIELDS = {
  enabled: [(v) => typeof v === "boolean", "true or false"],
  batch_weekday: [(v) => isInt(v, 0, 6), "a whole number from 0 (Sunday) to 6 (Saturday)"],
  batch_time: [(v) => typeof v === "string" && TIME_RE.test(v), "a 24-hour time like 07:00"],
  timezone: [validTimezone, "a time zone name like America/Phoenix"],
  scripts_per_day: [(v) => isInt(v, 1, 100), "a whole number from 1 to 100"],
  days_per_batch: [(v) => isInt(v, 1, 31), "a whole number from 1 to 31"],
  size_rule: [(v) => v === "total" || v === "per_offer", "total or per_offer"],
  format_style: [
    (v) => isObj(v) && Object.keys(v).length > 0 &&
      Object.entries(v).every(([k, s]) => FORMAT_KEYS.includes(k) && FORMAT_STYLES.includes(s)),
    `an object of ${FORMAT_KEYS.join(", ")} keys, each set to bullets or words`
  ],
  draft_expiry_days: [(v) => isInt(v, 1, 365), "a whole number from 1 to 365"],
  winner_rule: [(v) => v === null || isObj(v), "an object, or null for not set"],
  ad_number_floor: [(v) => isInt(v, 1), "a whole number of 1 or more"],
  next_overrides: [isObj, "an object"],
  max_batch_cost_usd: [(v) => isNum(v, 0, 100000), "a dollar amount of 0 or more"],
  max_month_cost_usd: [(v) => isNum(v, 0, 1000000), "a dollar amount of 0 or more"],
  submagic_template: [(v) => typeof v === "string" && v.trim().length > 0 && v.length <= 80, "a template name"],
  caption_position_y: [(v) => v === null || isNum(v, 0, 100), "a number from 0 to 100, or null for not set"],
  magic_zooms: [(v) => typeof v === "boolean", "true or false"],
  clean_audio: [(v) => typeof v === "boolean", "true or false"],
  caption_dictionary: [
    (v) => Array.isArray(v) && v.length <= 500 && v.every((w) => typeof w === "string" && w.trim() && w.length <= 80),
    "a list of words"
  ],
  animation_mode: [(v) => v === "fullframe" || v === "overlay", "fullframe or overlay"],
  flip_horizontal: [(v) => typeof v === "boolean", "true or false"],
  settle_minutes: [(v) => isInt(v, 0, 1440), "a whole number of minutes from 0 to 1440"],
  quiet_start: [(v) => typeof v === "string" && TIME_RE.test(v), "a 24-hour time like 21:00"],
  quiet_end: [(v) => typeof v === "string" && TIME_RE.test(v), "a 24-hour time like 07:00"],
  course_folders: [isObj, "an object of collection to {folder id, import cursor}"]
};

export const SETTINGS_FIELDS = Object.freeze(Object.keys(FIELDS));

/** Columns returned to the caller, numerics cast so JSON carries numbers. */
const SELECT = `
  org_id, enabled, batch_weekday, batch_time, timezone, scripts_per_day, days_per_batch,
  size_rule, format_style, draft_expiry_days, winner_rule, ad_number_floor, next_overrides,
  max_batch_cost_usd::float8 AS max_batch_cost_usd, max_month_cost_usd::float8 AS max_month_cost_usd,
  submagic_template, caption_position_y::float8 AS caption_position_y, magic_zooms, clean_audio,
  caption_dictionary, animation_mode, flip_horizontal, settle_minutes, quiet_start, quiet_end,
  course_folders, updated_at, updated_by`;

/**
 * Check a patch. Returns { patch } with only known columns, or { error, message }.
 * Unknown keys are refused rather than ignored: a typed `batchTime` that silently
 * saves nothing would look exactly like a setting that worked.
 */
export function validateSettingsPatch(body) {
  if (!isObj(body)) return { error: "body_invalid", message: "Send the settings to change as a JSON object." };
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "request_id") continue;
    const rule = FIELDS[key];
    if (!rule) return { error: "field_unknown", message: `${key} is not a marketing setting.` };
    if (!rule[0](value)) return { error: "field_invalid", message: `${key} must be ${rule[1]}.` };
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return { error: "nothing_to_change", message: "Send at least one setting to change." };
  }
  return { patch };
}

/** Read the org's settings, creating the default row on first read. */
export async function readSettings(db, orgId) {
  await db.query(
    `INSERT INTO marketing_settings (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`,
    [orgId]
  );
  const r = await db.query(`SELECT ${SELECT} FROM marketing_settings WHERE org_id = $1`, [orgId]);
  return r.rows[0];
}

const JSON_COLUMNS = new Set(["format_style", "winner_rule", "next_overrides", "course_folders"]);

/** Apply a validated patch. Stamps updated_by with the staff id. */
export async function updateSettings(db, orgId, staffId, patch) {
  await db.query(
    `INSERT INTO marketing_settings (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`,
    [orgId]
  );
  const sets = [];
  const params = [orgId];
  for (const [key, value] of Object.entries(patch)) {
    params.push(JSON_COLUMNS.has(key) && value !== null ? JSON.stringify(value) : value);
    const cast = JSON_COLUMNS.has(key) ? "::jsonb" : "";
    sets.push(`${key} = $${params.length}${cast}`);
  }
  params.push(staffId ?? null);
  sets.push(`updated_by = $${params.length}`, `updated_at = now()`);
  const r = await db.query(
    `UPDATE marketing_settings SET ${sets.join(", ")} WHERE org_id = $1 RETURNING ${SELECT}`,
    params
  );
  return r.rows[0];
}
