import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSettingsPatch, SETTINGS_FIELDS } from "./settings.mjs";

test("a good patch comes back with only the known columns", () => {
  const r = validateSettingsPatch({ batch_weekday: 2, batch_time: "08:30", size_rule: "per_offer", request_id: "abc" });
  assert.deepEqual(r.patch, { batch_weekday: 2, batch_time: "08:30", size_rule: "per_offer" });
});

test("null clears winner_rule and caption_position_y (null means not set, never 0)", () => {
  const r = validateSettingsPatch({ winner_rule: null, caption_position_y: null });
  assert.equal(r.patch.winner_rule, null);
  assert.equal(r.patch.caption_position_y, null);
});

test("unknown keys are refused, not ignored", () => {
  assert.equal(validateSettingsPatch({ batchTime: "08:00" }).error, "field_unknown");
  assert.equal(validateSettingsPatch({ org_id: "x" }).error, "field_unknown");
  assert.equal(validateSettingsPatch({ updated_by: "x" }).error, "field_unknown");
});

test("bad values are refused with a plain sentence", () => {
  for (const bad of [
    { batch_weekday: 7 }, { batch_weekday: "1" }, { batch_time: "7:00" }, { batch_time: "25:00" },
    { timezone: "Mars/Olympus" }, { scripts_per_day: 0 }, { size_rule: "both" },
    { format_style: { standard: "poem" } }, { format_style: { nope: "words" } },
    { max_batch_cost_usd: -1 }, { animation_mode: "x" }, { enabled: "yes" },
    { caption_dictionary: [""] }, { quiet_start: "9pm" }, { ad_number_floor: 0 }
  ]) {
    const r = validateSettingsPatch(bad);
    assert.equal(r.error, "field_invalid", JSON.stringify(bad));
    assert.match(r.message, /must be/);
  }
});

test("an empty patch and a non-object are refused", () => {
  assert.equal(validateSettingsPatch({}).error, "nothing_to_change");
  assert.equal(validateSettingsPatch(null).error, "body_invalid");
  assert.equal(validateSettingsPatch([]).error, "body_invalid");
});

test("every spec column is editable except the org, updated_at and updated_by", () => {
  assert.equal(SETTINGS_FIELDS.length, 25);
  for (const k of ["enabled", "size_rule", "ad_number_floor", "course_folders", "flip_horizontal"]) {
    assert.ok(SETTINGS_FIELDS.includes(k), k);
  }
});
