import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeNumOfDays,
  flattenClarityPayload,
  buildClarityCroFindings,
  fetchProjectLiveInsights,
} from "./clarity-export.mjs";
import { clarityQueryKey } from "./clarity-org-sync.mjs";

test("normalizeNumOfDays clamps to 1-3", () => {
  assert.equal(normalizeNumOfDays(0), 3);
  assert.equal(normalizeNumOfDays(2), 2);
  assert.equal(normalizeNumOfDays(9), 3);
});

test("clarityQueryKey joins dimensions", () => {
  assert.equal(clarityQueryKey({ dimension1: "URL" }), "URL");
  assert.equal(clarityQueryKey({ dimension1: "Device", dimension2: "URL" }), "Device+URL");
});

test("flattenClarityPayload expands metric blocks", () => {
  const rows = flattenClarityPayload([
    {
      metricName: "Traffic",
      information: [{ URL: "/roadmap/", totalSessionCount: "10" }],
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metricName, "Traffic");
  assert.equal(rows[0].URL, "/roadmap/");
});

test("buildClarityCroFindings flags rage clicks on roadmap URL", () => {
  const findings = buildClarityCroFindings([
    {
      metricName: "Rage Click Count",
      URL: "https://apply.fundhub.ai/roadmap/",
      totalSessionCount: "20",
      rageClickCount: "5",
    },
  ]);
  assert.ok(findings.some((f) => f.code === "rage_clicks"));
});

test("fetchProjectLiveInsights requires token", async () => {
  const r = await fetchProjectLiveInsights({ token: "" });
  assert.equal(r.ok, false);
});
