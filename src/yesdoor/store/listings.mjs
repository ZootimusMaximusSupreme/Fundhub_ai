// Public listings (spec §8: GET public/listings, GET public/listing).
//
// What a stranger may see: active listings at SIGNED or LIVE buildings, plus the
// flagged Arizona SAMPLE listings (is_sample = true) so the site has something to
// show before any building signs. Samples are never hidden inside the real set:
// every row carries isSample, and the site must label it "Sample listing".
//
// Nothing about rules, fees, application fees or who is screened leaves here.

import { toCents } from "../../commissions/money.mjs";
import { YD_API } from "../config.mjs";
import { YdError, cents, num } from "../http.mjs";

/** A listing is public when it is active and its building is signed/live, or it
 *  is a sample at a building that has not been paused or churned. */
const PUBLIC_WHERE = `
  l.org_id = $1
  AND l.active
  AND (b.status IN ('signed', 'live')
       OR (l.is_sample AND b.status NOT IN ('paused', 'churned')))`;

const SELECT = `
  SELECT l.id, l.unit_label, l.beds, l.baths::float8 AS baths, l.sqft, l.rent_cents,
         to_char(l.available_on, 'YYYY-MM-DD') AS available_on,
         l.specials, l.photos, l.is_sample,
         b.id AS building_id, b.name AS building_name, b.address, b.city, b.state, b.zip,
         b.lat::float8 AS lat, b.lng::float8 AS lng`;

export function shapeListing(r) {
  return {
    id: r.id,
    unit: r.unit_label,
    beds: r.beds,
    baths: r.baths,
    sqft: r.sqft,
    rentCents: cents(r.rent_cents),
    availableOn: r.available_on,
    specials: r.specials,
    photos: r.photos,
    isSample: r.is_sample,
    building: {
      id: r.building_id, name: r.building_name, address: r.address,
      city: r.city, state: r.state, zip: r.zip, lat: r.lat, lng: r.lng
    }
  };
}

/** searchListings — city (exact, any case), beds (exact; 0 = studio), maxRent in
 *  WHOLE DOLLARS, page (1-based). Cheapest first, id as the tiebreak. */
export async function searchListings(db, { orgId, city, beds, maxRent, page }) {
  const where = [PUBLIC_WHERE];
  const params = [orgId];
  const add = (sql, value) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };

  if (city) add(`lower(b.city) = lower(?)`, city);

  if (beds !== null && beds !== undefined) {
    const n = Number(beds);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new YdError(400, "invalid_parameter", "beds must be a whole number from 0 to 10");
    add(`l.beds = ?`, n);
  }
  if (maxRent !== null && maxRent !== undefined) {
    const dollars = Number(maxRent);
    if (!Number.isFinite(dollars) || dollars <= 0) throw new YdError(400, "invalid_parameter", "maxRent must be a positive number of dollars");
    add(`l.rent_cents <= ?`, toCents(dollars));
  }

  const pageNo = page === null || page === undefined ? 1 : Number(page);
  if (!Number.isInteger(pageNo) || pageNo < 1) throw new YdError(400, "invalid_parameter", "page must be a whole number from 1");
  const size = YD_API.listingsPageSize;

  const total = num((await db.query(
    `SELECT count(*)::int AS n FROM yd_listings l
       JOIN yd_buildings b ON b.id = l.building_id AND b.org_id = l.org_id
      WHERE ${where.join(" AND ")}`, params)).rows[0].n);

  const rows = (await db.query(
    `${SELECT}
       FROM yd_listings l
       JOIN yd_buildings b ON b.id = l.building_id AND b.org_id = l.org_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.rent_cents ASC, l.id ASC
      LIMIT ${size} OFFSET ${(pageNo - 1) * size}`, params)).rows;

  return { listings: rows.map(shapeListing), page: pageNo, pageSize: size, total };
}

/** getListing — one public listing, or null. A listing that is inactive, at an
 *  unsigned building (and not a sample), or in another company is simply not found. */
export async function getListing(db, { orgId, id }) {
  const r = await db.query(
    `${SELECT}
       FROM yd_listings l
       JOIN yd_buildings b ON b.id = l.building_id AND b.org_id = l.org_id
      WHERE ${PUBLIC_WHERE} AND l.id = $2`, [orgId, id]);
  return r.rows[0] ? shapeListing(r.rows[0]) : null;
}
