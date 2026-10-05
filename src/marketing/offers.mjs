// Marketing offers: an offer is a funnel with a permanent tag (spec §2 item 18).
// Table: marketing_offers (db/migrations/407_marketing_machine_tables.sql),
// seeded with direct_book, blueprint and slo by 408.
//
// The tag is permanent. It is saved in ad_scripts.offer_key, and ads, leads and
// sales point at it, so this module never renames one. A finished offer is set
// to status "retired" and stays in the table.

export const OFFER_STATUSES = Object.freeze(["draft", "ready", "testing", "live", "retired"]);
/** The five owner-set UTM lanes (migration 286). "unknown" is not a lane an offer can pick. */
export const OFFER_LANES = Object.freeze(["funding600", "premium", "sorting", "uwiq", "wl"]);
/** The fixed list of funnel step types (spec 7.3). */
export const STEP_TYPES = Object.freeze([
  "ad", "vsl_page", "sales_page", "survey", "application", "booking", "call", "checkout",
  "upsell", "downsell", "thank_you", "onboarding", "e_product", "coaching"
]);

export const TAG_RE = /^[a-z][a-z0-9_]{1,23}$/;
const KEY_RE = /^[a-z][a-z0-9_]{1,48}$/;
const CTA_RE = /^[A-Z][A-Z0-9_]{1,39}$/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strOrNull = (v) => v === null || (typeof v === "string" && v.trim().length > 0 && v.length <= 500);

/* steps: [{type, url, product_key, price}] in order. price is integer cents (money is cents). */
function validSteps(v) {
  return Array.isArray(v) && v.length <= 30 && v.every((s) =>
    isObj(s) && STEP_TYPES.includes(s.type) &&
    (s.url === undefined || strOrNull(s.url)) &&
    (s.product_key === undefined || strOrNull(s.product_key)) &&
    (s.price === undefined || s.price === null || (Number.isInteger(s.price) && s.price >= 0)));
}

function normaliseSteps(steps) {
  return steps.map((s) => ({
    type: s.type,
    url: s.url ?? null,
    product_key: s.product_key ?? null,
    price: s.price ?? null
  }));
}

const EDITABLE = {
  name: [(v) => typeof v === "string" && v.trim().length > 0 && v.length <= 80, "a short name"],
  status: [(v) => OFFER_STATUSES.includes(v), `one of ${OFFER_STATUSES.join(", ")}`],
  paused: [(v) => typeof v === "boolean", "true or false"],
  structure: [(v) => v === null || (typeof v === "string" && KEY_RE.test(v)), "a structure key like book_call, or null"],
  steps: [validSteps, `a list of {type, url, product_key, price}, type one of ${STEP_TYPES.join(", ")}`],
  lane: [(v) => v === null || OFFER_LANES.includes(v), `one of ${OFFER_LANES.join(", ")}`],
  registry_tags: [isObj, "an object"],
  meta_campaign_ids: [
    (v) => Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === "string" && x.trim()),
    "a list of Meta campaign ids"
  ],
  ad_set_external_id: [strOrNull, "a Meta ad set id, or null"],
  format_mix: [
    (v) => isObj(v) && Object.entries(v).every(([k, n]) => KEY_RE.test(k) && Number.isInteger(n) && n >= 0),
    "an object of format to a whole number, like {\"standard\":2}"
  ],
  cta_type: [(v) => typeof v === "string" && CTA_RE.test(v), "a Meta CTA type like LEARN_MORE"],
  weight: [(v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000, "a number of 0 or more"],
  min_per_batch: [(v) => Number.isInteger(v) && v >= 0 && v <= 1000, "a whole number of 0 or more"],
  test_key: [(v) => v === null || (typeof v === "string" && KEY_RE.test(v)), "a key like pricing_test, or null"]
};

const JSON_COLUMNS = new Set(["steps", "registry_tags", "format_mix"]);

const SELECT = `
  id, org_id, tag, name, status, paused, structure, steps, lane::text AS lane, registry_tags,
  card_path, meta_campaign_ids, ad_set_external_id, format_mix, cta_type,
  weight::float8 AS weight, min_per_batch, test_key, created_at, updated_at`;

/**
 * Check a create or update body. Returns
 *   { tag, fields, card_md } or { error, message }.
 * Unknown keys are refused, so a typo never looks like a save that worked.
 */
export function validateOfferBody(body, { creating }) {
  if (!isObj(body)) return { error: "body_invalid", message: "Send the offer as a JSON object." };
  const { tag, card_md: cardMd, request_id: _requestId, ...rest } = body;
  if (typeof tag !== "string" || !TAG_RE.test(tag)) {
    return {
      error: "tag_invalid",
      message: "tag must start with a lowercase letter, then lowercase letters, digits or _, 2 to 24 characters in all."
    };
  }
  if (cardMd !== undefined && (typeof cardMd !== "string" || !cardMd.trim() || cardMd.length > 200000)) {
    return { error: "card_md_invalid", message: "card_md must be the offer card's markdown text." };
  }
  const fields = {};
  for (const [key, value] of Object.entries(rest)) {
    const rule = EDITABLE[key];
    if (!rule) {
      return { error: "field_unknown", message: `${key} is not an offer field. The tag cannot be changed once it exists.` };
    }
    if (!rule[0](value)) return { error: "field_invalid", message: `${key} must be ${rule[1]}.` };
    fields[key] = key === "steps" ? normaliseSteps(value) : value;
  }
  if (creating && !fields.name) return { error: "name_required", message: "A new offer needs a name." };
  if (!creating && Object.keys(fields).length === 0 && cardMd === undefined) {
    return { error: "nothing_to_change", message: "Send at least one field to change." };
  }
  return { tag, fields, card_md: cardMd };
}

export const cardPathFor = (tag) => `marketing/offers/${tag}.md`;

export async function listOffers(db, orgId) {
  const r = await db.query(
    `SELECT ${SELECT} FROM marketing_offers WHERE org_id = $1 ORDER BY created_at, tag`,
    [orgId]
  );
  return r.rows;
}

export async function getOffer(db, orgId, tag) {
  const r = await db.query(`SELECT ${SELECT} FROM marketing_offers WHERE org_id = $1 AND tag = $2`, [orgId, tag]);
  return r.rows[0] || null;
}

/** Create an offer. A tag already in the org (even a retired one) is refused: tags are never reused. */
export async function createOffer(tx, orgId, tag, fields) {
  const cols = ["org_id", "tag", "card_path"];
  const params = [orgId, tag, cardPathFor(tag)];
  const casts = [];
  for (const [key, value] of Object.entries(fields)) {
    cols.push(key);
    params.push(JSON_COLUMNS.has(key) ? JSON.stringify(value) : value);
    casts.push(key === "lane" ? "::ad_lane" : JSON_COLUMNS.has(key) ? "::jsonb" : "");
  }
  const placeholders = params.map((_, i) => `$${i + 1}${i < 3 ? "" : casts[i - 3]}`);
  const r = await tx.query(
    `INSERT INTO marketing_offers (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
     RETURNING ${SELECT}`,
    params
  );
  return r.rows[0];
}

/** Patch an offer by tag. Returns the row, or null if the tag does not exist. */
export async function updateOffer(tx, orgId, tag, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return getOffer(tx, orgId, tag);
  const params = [orgId, tag];
  const sets = keys.map((key) => {
    const value = fields[key];
    params.push(JSON_COLUMNS.has(key) ? JSON.stringify(value) : value);
    const cast = key === "lane" ? "::ad_lane" : JSON_COLUMNS.has(key) ? "::jsonb" : "";
    return `${key} = $${params.length}${cast}`;
  });
  sets.push("updated_at = now()");
  const r = await tx.query(
    `UPDATE marketing_offers SET ${sets.join(", ")} WHERE org_id = $1 AND tag = $2 RETURNING ${SELECT}`,
    params
  );
  return r.rows[0] || null;
}
