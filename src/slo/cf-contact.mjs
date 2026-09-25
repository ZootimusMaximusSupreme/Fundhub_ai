// After the roadmap identity step, copy the buyer onto the ClickFunnels
// contact Paul already uses. Match is email (ClickFunnels upsert).
// Social Security number, date of birth, and EIN never leave Fundhub.

import { upsertContact } from "../analytics/clickfunnels.mjs";

const BLOCKED = new Set([
  "ssn",
  "social",
  "social_security",
  "ein",
  "tax_id",
  "dob",
  "date_of_birth"
]);

function clean(v) {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

/** Contact body for POST /contacts/upsert. Returns null when there is no email. */
export function buildSloCfContact(input = {}) {
  const email = clean(input.email);
  if (!email) return null;
  const contact = { email_address: email };
  const first = clean(input.firstName);
  const last = clean(input.lastName);
  const phone = clean(input.phone);
  if (first) contact.first_name = first;
  if (last) contact.last_name = last;
  if (phone) contact.phone_number = phone;

  const custom = {};
  const addr = input.address && typeof input.address === "object" ? input.address : {};
  const line = [clean(addr.addressLine1), clean(addr.addressLine2)].filter(Boolean).join(", ");
  if (line) custom.address = line;
  if (clean(addr.city)) custom.city = clean(addr.city);
  if (clean(addr.state)) custom.state = clean(addr.state);
  if (clean(addr.postalCode)) custom.zip = clean(addr.postalCode);

  const names = (Array.isArray(input.businesses) ? input.businesses : [])
    .map((b) => clean(b?.name))
    .filter(Boolean);
  if (names.length) custom.business_name = names.join("; ");

  if (input.prequal != null && input.prequal !== "") {
    custom.prequal_amount = String(input.prequal);
  }

  for (const key of Object.keys(custom)) {
    if (BLOCKED.has(key.toLowerCase())) delete custom[key];
  }
  if (Object.keys(custom).length) contact.custom_attributes = custom;
  return contact;
}

/**
 * Upsert the ClickFunnels contact. No API key → skip. A ClickFunnels error
 * is logged and swallowed so the credit pull still finishes.
 */
export async function syncSloClickfunnelsContact(input, { env = process.env, fetchImpl } = {}) {
  const contact = buildSloCfContact(input);
  const apiKey = clean(env?.CLICKFUNNELS_API_KEY);
  const subdomain = clean(env?.CLICKFUNNELS_SUBDOMAIN);
  if (!contact || !apiKey || !subdomain) return { ok: false, skipped: true };
  const ctx = {};
  if (typeof fetchImpl === "function") ctx.fetch = fetchImpl;
  const workspaceId = clean(env?.CLICKFUNNELS_WORKSPACE_ID);
  if (workspaceId) ctx.workspaceId = workspaceId;
  try {
    const body = await upsertContact({ api_key: apiKey, subdomain }, contact, ctx);
    return { ok: true, id: body?.id ?? null };
  } catch (err) {
    console.error("slo: clickfunnels contact —", err?.message || err);
    return { ok: false, error: "clickfunnels_refused" };
  }
}
