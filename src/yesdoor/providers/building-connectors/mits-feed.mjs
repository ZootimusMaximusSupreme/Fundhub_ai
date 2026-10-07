// building-connectors/mits-feed.mjs — a MITS XML listing file becomes listings.
//
//   parseMitsXml(xml) -> { properties, listings, errors, skipped }
//
// MITS (Multifamily Information Transfer Standard) is the XML property managers
// already export for listing sites. This reads the parts Yesdoor needs:
//
//   PhysicalProperty/Property            one building
//     PropertyID/MarketingName, Address  its name and address
//     Floorplan                          Name, Room[Bedroom|Bathroom]/Count,
//                                        SquareFeet@Min, MarketRent@Min
//     ILS_Unit/Units/Unit                one unit: MarketingName (or UnitID),
//                                        FloorplanID@IDValue, UnitBedrooms,
//                                        UnitBathrooms, MinSquareFeet, UnitRent
//     ILS_Unit/EffectiveRent@Min         rent when the unit gives none
//     ILS_Unit/Availability              VacateDate or MadeReadyDate (Year/Month/Day)
//
// A unit that gives no beds, baths, size or rent takes them from its floorplan.
// Occupied or leased units are skipped (listed in `skipped`); a unit with
// neither status is treated as available. One bad unit is one error, not a
// failed file.
//
// The XML reader below is small and hand-written (no new dependencies). It does
// not expand entities declared in a DTD, and it refuses any file with a
// DOCTYPE, which closes the "billion laughs" and external-entity attacks.

import { dollarsToCents, isoFromParts, portalLeaseStatus, registrationEmail } from "./common.mjs";

export const PROVIDER = "mits_feed";
export const SANDBOX = true;

export const MAX_XML_CHARS = 5_000_000;
const MAX_DEPTH = 64;

/* ------------------------------------------------------------- XML reader */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : whole;
  });
}

const local = (name) => name.slice(name.indexOf(":") + 1);

function parseAttrs(source) {
  const attrs = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(source))) attrs[local(m[1])] = decode(m[2] ?? m[3]);
  return attrs;
}

/** Parses XML into { name, attrs, children, text }. Throws Error with a plain message on bad XML. */
export function parseXml(input) {
  const src = String(input ?? "").replace(/^﻿/, "");
  if (src.length > MAX_XML_CHARS) throw new Error("The feed file is too large.");
  if (/<!DOCTYPE|<!ENTITY/i.test(src)) throw new Error("The feed uses a DOCTYPE, which is not allowed.");

  const root = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let i = 0;

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt === -1) { top.text += decode(src.slice(i)); break; }
    if (lt > i) top.text += decode(src.slice(i, lt));

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end === -1) throw new Error("The feed has a comment that never closes.");
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      if (end === -1) throw new Error("The feed has a CDATA block that never closes.");
      top.text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      if (end === -1) throw new Error("The feed has an instruction that never closes.");
      i = end + 2;
    } else if (src.startsWith("</", lt)) {
      const end = src.indexOf(">", lt);
      if (end === -1) throw new Error("The feed ends in the middle of a tag.");
      const name = local(src.slice(lt + 2, end).trim());
      if (stack.length === 1 || top.name !== name) throw new Error(`The feed has a closing tag </${name}> that does not match.`);
      stack.pop();
      i = end + 1;
    } else {
      // Find the end of the tag, skipping ">" inside quoted attribute values.
      let j = lt + 1;
      let quote = null;
      while (j < src.length) {
        const c = src[j];
        if (quote) { if (c === quote) quote = null; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
        j++;
      }
      if (j >= src.length) throw new Error("The feed ends in the middle of a tag.");
      let body = src.slice(lt + 1, j);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[A-Za-z_][\w:.-]*/.exec(body);
      if (!nameMatch) throw new Error("The feed has a tag with no name.");
      const el = { name: local(nameMatch[0]), attrs: parseAttrs(body.slice(nameMatch[0].length)), children: [], text: "" };
      top.children.push(el);
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new Error("The feed is nested too deeply.");
        stack.push(el);
      }
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`The feed ends before </${stack[stack.length - 1].name}> closes.`);
  if (root.children.length !== 1) throw new Error("The feed must have exactly one top-level element.");
  return root.children[0];
}

const kids = (el, name) => (el ? el.children.filter((c) => c.name === name) : []);
const kid = (el, name) => kids(el, name)[0] ?? null;
const textOf = (el) => (el ? el.text.trim() : "");
const textAt = (el, name) => textOf(kid(el, name));
const walk = (el, name, out = []) => {
  for (const c of el.children) { if (c.name === name) out.push(c); walk(c, name, out); }
  return out;
};

/* ------------------------------------------------------------ MITS mapping */

const intOrNull = (t) => (/^\d+$/.test(t) ? Number(t) : null);
const numOrNull = (t) => (/^\d+(\.\d+)?$/.test(t) ? Number(t) : null);
const attrAt = (el, child, attr) => (kid(el, child)?.attrs[attr] ?? "");

function dateFrom(el) {
  if (!el) return null;
  const { Year, Month, Day } = el.attrs;
  return isoFromParts(Year, Month, Day);
}

function floorplanOf(fp) {
  const room = (type) => kids(fp, "Room").find((r) => (r.attrs.RoomType || "").toLowerCase() === type);
  return {
    beds: intOrNull(textAt(room("bedroom"), "Count")),
    baths: numOrNull(textAt(room("bathroom"), "Count")),
    sqft: intOrNull(attrAt(fp, "SquareFeet", "Min")),
    rentCents: dollarsToCents(attrAt(fp, "MarketRent", "Min"))
  };
}

export function parseMitsXml(xml) {
  const empty = { properties: [], listings: [], errors: [], skipped: [] };
  let root;
  try {
    root = parseXml(xml);
  } catch (e) {
    return { ...empty, errors: [{ unit: null, message: e.message }] };
  }
  if (root.name !== "PhysicalProperty") {
    return { ...empty, errors: [{ unit: null, message: "This is not a MITS file: the top element should be PhysicalProperty." }] };
  }

  const out = { properties: [], listings: [], errors: [], skipped: [] };
  const propertyEls = kids(root, "Property");
  if (propertyEls.length === 0) {
    out.errors.push({ unit: null, message: "The feed has no Property elements." });
    return out;
  }

  for (const prop of propertyEls) {
    const pid = kid(prop, "PropertyID");
    const addr = kid(pid, "Address");
    const externalId = prop.attrs.IDValue || attrAt(pid, "Identification", "IDValue") || null;
    out.properties.push({
      externalId,
      name: textAt(pid, "MarketingName") || null,
      address: {
        line1: textAt(addr, "AddressLine1") || null,
        city: textAt(addr, "City") || null,
        state: textAt(addr, "State") || null,
        zip: textAt(addr, "PostalCode") || null
      }
    });

    const floorplans = new Map(kids(prop, "Floorplan").map((fp) => [fp.attrs.IDValue, floorplanOf(fp)]));

    for (const ils of kids(prop, "ILS_Unit")) {
      const effectiveRent = dollarsToCents(attrAt(ils, "EffectiveRent", "Min"));
      const availableOn = dateFrom(kid(kid(ils, "Availability"), "VacateDate"))
        ?? dateFrom(kid(kid(ils, "Availability"), "MadeReadyDate"));

      for (const unit of walk(ils, "Unit")) {
        const label = textAt(unit, "MarketingName") || textAt(unit, "UnitID") || ils.attrs.IDValue || "";
        const fp = floorplans.get(attrAt(unit, "FloorplanID", "IDValue")) ?? {};

        const occupancy = textAt(unit, "UnitOccupancyStatus").toLowerCase();
        const leased = textAt(unit, "UnitLeasedStatus").toLowerCase();
        if (occupancy === "occupied" || leased === "leased") {
          out.skipped.push({ unit: label, reason: occupancy === "occupied" ? "occupied" : "leased" });
          continue;
        }
        if (!label) {
          out.errors.push({ unit: null, message: "A unit has no name or number." });
          continue;
        }

        const rentText = textAt(unit, "UnitRent");
        const unitRent = rentText === "" ? null : dollarsToCents(rentText);
        if (rentText !== "" && unitRent === null) {
          out.errors.push({ unit: label, message: `"${rentText}" is not a rent amount.` });
          continue;
        }
        const rentCents = unitRent ?? effectiveRent ?? fp.rentCents ?? null;
        if (rentCents === null || rentCents <= 0) {
          out.errors.push({ unit: label, message: "The unit has no rent, and neither does its floorplan." });
          continue;
        }

        out.listings.push({
          external_id: ils.attrs.IDValue || null,
          property_external_id: externalId,
          unit_label: label,
          beds: intOrNull(textAt(unit, "UnitBedrooms")) ?? fp.beds ?? null,
          baths: numOrNull(textAt(unit, "UnitBathrooms")) ?? fp.baths ?? null,
          sqft: intOrNull(textAt(unit, "MinSquareFeet")) ?? fp.sqft ?? null,
          rent_cents: rentCents,
          available_on: availableOn,
          specials: null,
          source: "feed"
        });
      }
    }
  }
  return out;
}

export async function listListings({ xml, propertyExternalId = null } = {}) {
  const parsed = parseMitsXml(xml);
  const listings = propertyExternalId
    ? parsed.listings.filter((l) => l.property_external_id === propertyExternalId)
    : parsed.listings;
  return { listings, errors: parsed.errors, properties: parsed.properties, skipped: parsed.skipped };
}

export async function pushGuestCard(ctx = {}) {
  return registrationEmail(ctx);
}

export async function getLeaseStatus() {
  return portalLeaseStatus();
}
