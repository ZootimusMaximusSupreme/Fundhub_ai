// Meta Marketing API adapter.
//
// ⚠️ CONFIRM BEFORE THIS RUNS LIVE. The endpoint shapes below follow the
// documented Marketing API, but have not been exercised against a real ad
// account — same status as the adapters in src/adapters/ carrying this marker.
// Confirm against one real call per operation before a partner's budget flows
// through it.
//
// THE SPECIAL AD CATEGORY IS READ FROM CONFIG AND IS MANDATORY. It is not a
// parameter this module accepts, because a caller able to pass it is a caller
// able to pass the wrong one. It comes from ad_platform_category_map via the
// campaign row, which the trigger in 046 populates and refuses to leave null.
//
// ⚠️ THE CONFIGURED VALUE IS UNSET AND FLAGGED. The spec named
// 'FINANCIAL_PRODUCTS_AND_SERVICES', which is not a Meta enum member, and for
// funding/credit_cards offers the applicable category is likely CREDIT. Rather
// than guess, ad_platform_category_map ships empty and every Meta write here
// fails closed until a human populates it. See 046's header.
//
// CAMPAIGN BUDGET OPTIMIZATION IS ON BY DEFAULT, per the spec: the budget lives
// on the campaign and Meta distributes it across ad sets.

import { callPlatform } from "./_api.mjs";
import { decryptToken } from "./tokens.mjs";
import { buildTargeting } from "../compliance/targeting.mjs";

export const PLATFORM = "meta";
const API_VERSION = process.env.META_API_VERSION || "v21.0";
const BASE = "https://graph.facebook.com";

/* Every call takes the connection row and derives its own token, so no caller
   ever holds a decrypted token longer than one request. */
function tokenFor(connection) {
  const t = decryptToken(connection.encrypted_access_token, { partnerId: connection.partner_id });
  if (!t) throw new Error("connection has no access token");
  return t;
}

const acct = (connection) => {
  const id = String(connection.external_ad_account_id || "");
  return id.startsWith("act_") ? id : `act_${id}`;
};

export async function createCampaign(connection, campaign, ctx = {}) {
  if (!campaign.special_ad_category) {
    // Belt to the database's braces. Reaching here with a null category means the
    // trigger was bypassed, and shipping without one is the compliance failure the
    // whole chain exists to prevent.
    throw new Error(
      "refusing to create a Meta campaign with no special_ad_category — " +
      "populate ad_platform_category_map (046)"
    );
  }

  return callPlatform({
    url: `${BASE}/${API_VERSION}/${acct(connection)}/campaigns`,
    token: tokenFor(connection),
    body: {
      name: campaign.name,
      objective: campaign.objective || "OUTCOME_LEADS",
      status: "PAUSED",                       // never created live; launch is a separate, gated step
      special_ad_categories: [campaign.special_ad_category],
      // Campaign budget optimization on by default (spec UNIT 5).
      daily_budget: String(campaign.budget_cents),
      bid_strategy: campaign.bid_strategy || "LOWEST_COST_WITHOUT_CAP"
    },
    ctx
  });
}

export async function createAdSet(connection, adSet, ctx = {}) {
  // buildTargeting throws with every reason at once rather than silently
  // correcting a payload — see src/compliance/targeting.mjs.
  const targeting = buildTargeting(adSet.targeting || {}, { platform: PLATFORM });

  return callPlatform({
    url: `${BASE}/${API_VERSION}/${acct(connection)}/adsets`,
    token: tokenFor(connection),
    body: {
      name: adSet.name,
      campaign_id: adSet.external_campaign_id,
      status: "PAUSED",
      targeting,
      billing_event: adSet.billing_event || "IMPRESSIONS",
      optimization_goal: adSet.optimization_goal || "OFFSITE_CONVERSIONS",
      // Omitted when the campaign carries the budget (CBO), which is the default.
      ...(adSet.budget_cents ? { daily_budget: String(adSet.budget_cents) } : {})
    },
    ctx
  });
}

export async function createAd(connection, ad, ctx = {}) {
  return callPlatform({
    url: `${BASE}/${API_VERSION}/${acct(connection)}/ads`,
    token: tokenFor(connection),
    body: {
      name: ad.name,
      adset_id: ad.external_ad_set_id,
      status: "PAUSED",
      creative: { creative_id: ad.external_creative_id },
      // The AI-content disclosure, attached at publish time. Recorded on the ad
      // row as well, so "we disclosed" is auditable per ad rather than asserted.
      ...(ad.ai_disclosure ? { ad_labels: [{ name: ad.ai_disclosure }] } : {})
    },
    ctx
  });
}

export async function updateBudget(connection, { externalId, budgetCents }, ctx = {}) {
  return callPlatform({
    url: `${BASE}/${API_VERSION}/${externalId}`,
    token: tokenFor(connection),
    body: { daily_budget: String(budgetCents) },
    ctx
  });
}

export const pause  = (connection, { externalId }, ctx = {}) =>
  callPlatform({ url: `${BASE}/${API_VERSION}/${externalId}`, token: tokenFor(connection),
                 body: { status: "PAUSED" }, ctx });

export const resume = (connection, { externalId }, ctx = {}) =>
  callPlatform({ url: `${BASE}/${API_VERSION}/${externalId}`, token: tokenFor(connection),
                 body: { status: "ACTIVE" }, ctx });

/* fetchInsights — the metrics sync, and what the kill switch reads for ACTUAL
   spend. Deliberately goes to the platform every time rather than to
   ad_metrics_daily: the whole value of the independent check is that it does not
   share a failure mode with our mirror. */
export async function fetchInsights(connection, { externalId, since, until }, ctx = {}) {
  const params = new URLSearchParams({
    fields: "spend,impressions,reach,frequency,clicks,ctr,actions,cost_per_action_type,purchase_roas",
    time_range: JSON.stringify({ since, until }),
    level: "ad"
  });
  const res = await callPlatform({
    url: `${BASE}/${API_VERSION}/${externalId}/insights?${params}`,
    token: tokenFor(connection),
    method: "GET",
    ctx
  });
  return (res?.data || []).map(normalizeInsight);
}

/* THE EIGHT VIDEO FIELDS — where people stop watching an ad.

   Meta reports the drop-off curve for free on the same insights call we already
   make. The field names are Meta's; the column names are ours (378).

   ⚠️ EVERY NAME ON THE LEFT MUST BE A FIELD META ACTUALLY DECLARES. Meta refuses
   the WHOLE insights request when one field name is unknown — it does not skip
   the bad name and answer the rest — so a single invented field takes spend,
   clicks and impressions down with it and the connection looks completely
   broken. This list was checked on 2026-09-09 against Meta's own Python SDK
   field list, facebook_business/adobjects/adsinsights.py.

   THERE IS NO 3-SECOND FIELD. Not video_3sec_watched_actions, not
   video_3_sec_watched_actions. We asked for one until 2026-09-09 and it would
   have broken every sync. The real field closest in meaning is
   video_continuous_2_sec_watched_actions — "kept watching past the opening" —
   and our column is named after what it holds, not after 3 seconds.

   video_play_actions is how many plays STARTED at all. It is the honest
   denominator for a hook-style rate and it is free on this same request.

   video_play_curve_actions is Meta's second-by-second retention curve (confirmed
   on developers.facebook.com Ad Account Insights, 2026-09-27). It is a LIST of
   percentages, not one count — so it is not in VIDEO_INSIGHT_FIELDS (those all
   go through watchedActionCount). It is still on the same request. Stored as
   jsonb on ad_metrics_daily.video_play_curve (394).

   REQUEST_FIELDS is exported so the request and the parser can never drift
   apart: the list a caller asks Meta for is literally the list this file knows
   how to read. */
export const VIDEO_INSIGHT_FIELDS = Object.freeze([
  ["video_continuous_2_sec_watched_actions", "video_continuous_2s_watched"],
  ["video_play_actions",                     "video_plays"],
  ["video_p25_watched_actions",              "video_p25_watched"],
  ["video_p50_watched_actions",              "video_p50_watched"],
  ["video_p75_watched_actions",              "video_p75_watched"],
  ["video_p95_watched_actions",              "video_p95_watched"],
  ["video_p100_watched_actions",             "video_p100_watched"],
  ["video_thruplay_watched_actions",         "video_thruplay_watched"]
]);

/* Meta's exact field name for the second-by-second curve. Do not rename. */
export const VIDEO_PLAY_CURVE_FIELD = "video_play_curve_actions";
export const VIDEO_PLAY_CURVE_COLUMN = "video_play_curve";

/* The names to put in the insights request's `fields` parameter. */
export const VIDEO_INSIGHT_REQUEST_FIELDS = Object.freeze([
  ...VIDEO_INSIGHT_FIELDS.map(([metaField]) => metaField),
  VIDEO_PLAY_CURVE_FIELD
]);

/* watchedActionCount — turn one of Meta's action arrays into one number, or
   null.

   THESE FIELDS ARE NOT NUMBERS. Meta answers each of them with a LIST of
   objects, `[{ action_type: "video_view", value: "1234" }]`, and `value` is a
   STRING. Reading `Number(row.video_p25_watched_actions)` gives NaN, which
   stores as NULL and looks forever like "Meta has no data" — so the shape is
   handled here, once, and unit-tested in meta-video.test.mjs.

   NULL WHEN META DID NOT ANSWER, NEVER 0. A photo ad has no video fields at
   all; a video ad nobody watched has real zeros. Those are different facts
   (378's header) and this function keeps them apart: absent, empty or
   unreadable → null; a number Meta actually sent → that number, zero included.

   WHY THE LARGEST VALUE AND NOT THE SUM. With no breakdown requested the list
   holds exactly one entry and every rule agrees. With a breakdown Meta returns
   the parts AND their total in the same list, so adding them up counts the same
   people twice — silently, with no error. Taking the largest is right in both
   cases. `video_view` entries win over any other action_type, because that is
   the row these fields are actually about.

   video_play_actions IS THE ONE FIELD HERE WHOSE ROWS ARE NOT `video_view` —
   Meta labels them `video_play`. They land on the fallback path, where the
   largest entry still wins, so the answer is the same. No special case is
   needed and none is added. */
export function watchedActionCount(field) {
  if (field === null || field === undefined) return null;

  // Defensive: if Meta ever hands one of these back as a plain number or a
  // numeric string, use it rather than throwing the value away.
  if (!Array.isArray(field)) {
    const direct = countOrNull(field);
    return direct;
  }

  let best = null;      // largest value seen on a video_view entry
  let fallback = null;  // largest value seen on any other entry
  for (const entry of field) {
    if (!entry || typeof entry !== "object") continue;
    const v = countOrNull(entry.value);
    if (v === null) continue;
    if (entry.action_type === "video_view") best = best === null ? v : Math.max(best, v);
    else fallback = fallback === null ? v : Math.max(fallback, v);
  }
  return best !== null ? best : fallback;
}

/* countOrNull — a whole, non-negative count, or null. Empty string, null,
   undefined, NaN, Infinity and negatives are all "no answer" rather than 0;
   ad_metrics_daily_video_nonneg_ck (378) would refuse a negative anyway. */
function countOrNull(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

/* playCurveActions — Meta's video_play_curve_actions → number[] or null.
 *
 * Shape (Ad Account Insights): a list of { action_type, value }, where value
 * is the array of percentages for buckets 0–21. Absent / empty / unreadable →
 * null (same rule as the count fields: photo ads have no curve). */
export function playCurveActions(field) {
  if (field === null || field === undefined) return null;
  if (Array.isArray(field) && field.length && typeof field[0] === "number") {
    return field.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  }
  if (!Array.isArray(field) || field.length === 0) return null;

  let best = null;
  let fallback = null;
  for (const entry of field) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry.value;
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (nums.length === 0) continue;
    if (entry.action_type === "video_view") best = nums;
    else if (fallback === null) fallback = nums;
  }
  return best !== null ? best : fallback;
}

/* videoMetrics — every video field on one insights row, keyed by OUR column
   names. Count keys are always present (number or null). The curve key is
   always present (number[] or null). */
export function videoMetrics(row = {}) {
  const out = {};
  for (const [metaField, column] of VIDEO_INSIGHT_FIELDS) {
    out[column] = watchedActionCount(row[metaField]);
  }
  out[VIDEO_PLAY_CURVE_COLUMN] = playCurveActions(row[VIDEO_PLAY_CURVE_FIELD]);
  return out;
}

/* normalizeInsight — Meta returns money as decimal STRINGS in the account
   currency. Everything downstream is integer cents, so the conversion happens
   once, here. Doing it at each call site is how a rounding bug gets into the
   ceiling maths. */
export function normalizeInsight(row) {
  const conversions = sumActions(row.actions);
  return {
    external_id: row.ad_id || row.id,
    date: row.date_start,
    spend_cents: toCents(row.spend),
    impressions: int(row.impressions),
    reach: int(row.reach),
    frequency: num(row.frequency),
    clicks: int(row.clicks),
    ctr: num(row.ctr),
    conversions,
    cpa_cents: conversions > 0 ? Math.round(toCents(row.spend) / conversions) : null,
    roas: num(row.purchase_roas?.[0]?.value),
    // The eight video counts plus the play curve. null when Meta did not
    // report them — see videoMetrics, 378, and 394.
    ...videoMetrics(row)
  };
}

const sumActions = (actions) => (Array.isArray(actions) ? actions : [])
  .filter((a) => /purchase|lead|complete_registration/i.test(a.action_type || ""))
  .reduce((n, a) => n + int(a.value), 0);

const toCents = (v) => Math.round(Number(v || 0) * 100);
const int = (v) => Math.trunc(Number(v || 0));
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

/* Agency (Business-to-Business) helpers. These use Fundhub's agency Business +
   system-user token — not Social Studio OAuth. The client must still Approve
   once in Meta Business Settings → Requests; we cannot skip that click. */

export function normalizeMetaBusinessId(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits || null;
}

export function normalizeMetaAdAccountId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const bare = s.replace(/^act_/i, "").replace(/\D/g, "");
  return bare ? `act_${bare}` : null;
}

export function pendingAdAccountPlaceholder(businessId) {
  const biz = normalizeMetaBusinessId(businessId);
  if (!biz) throw new Error("pendingAdAccountPlaceholder: businessId required");
  return `pending:biz:${biz}`;
}

/* POST /{agencyBusinessId}/managed_businesses — request partnership by the
   client's Meta Business ID. Capability varies by app; callers must handle
   platform errors and still queue a pending CRM row. */
export async function requestManagedBusiness(
  { agencyBusinessId, clientBusinessId, accessToken },
  ctx = {}
) {
  const agency = normalizeMetaBusinessId(agencyBusinessId);
  const client = normalizeMetaBusinessId(clientBusinessId);
  if (!agency || !client) throw new Error("agency and client business ids required");
  if (!accessToken) throw new Error("accessToken required");
  return callPlatform({
    url: `${BASE}/${API_VERSION}/${agency}/managed_businesses`,
    token: accessToken,
    body: { existing_client_business_id: client },
    ctx
  });
}

/* POST /{agencyBusinessId}/client_ad_accounts — request agency tasks on a known
   client ad account. Often needs App capability / Marketing Partner status. */
export async function requestClientAdAccountAccess(
  { agencyBusinessId, adAccountId, accessToken, permittedTasks = ["ADVERTISE", "ANALYZE"] },
  ctx = {}
) {
  const agency = normalizeMetaBusinessId(agencyBusinessId);
  const act = normalizeMetaAdAccountId(adAccountId);
  if (!agency || !act) throw new Error("agency business id and ad account id required");
  if (!accessToken) throw new Error("accessToken required");
  return callPlatform({
    url: `${BASE}/${API_VERSION}/${agency}/client_ad_accounts`,
    token: accessToken,
    body: {
      adaccount_id: act,
      permitted_tasks: permittedTasks
    },
    ctx
  });
}

export default {
  PLATFORM, createCampaign, createAdSet, createAd, updateBudget, pause, resume, fetchInsights,
  watchedActionCount, playCurveActions, videoMetrics,
  VIDEO_INSIGHT_FIELDS, VIDEO_INSIGHT_REQUEST_FIELDS,
  VIDEO_PLAY_CURVE_FIELD, VIDEO_PLAY_CURVE_COLUMN,
  normalizeMetaBusinessId, normalizeMetaAdAccountId, pendingAdAccountPlaceholder,
  requestManagedBusiness, requestClientAdAccountAccess
};
