import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_XML_CHARS, PROVIDER, SANDBOX, listListings, parseMitsXml, parseXml } from "./mits-feed.mjs";

// A made-up MITS file shaped like the exports property managers send.
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<!-- sample feed, not a real property -->
<PhysicalProperty xmlns="http://www.mitsproject.org/ils" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Property IDValue="prop-1">
    <PropertyID>
      <Identification IDValue="prop-1" IDType="PropertyID"/>
      <MarketingName>Palo Verde Commons &amp; Lofts</MarketingName>
      <Address AddressType="property">
        <AddressLine1>100 Example Way</AddressLine1>
        <City>Tempe</City>
        <State>AZ</State>
        <PostalCode>85281</PostalCode>
      </Address>
    </PropertyID>
    <Floorplan IDValue="fp-1br">
      <Name>The One</Name>
      <Room RoomType="Bedroom"><Count>1</Count></Room>
      <Room RoomType="Bathroom"><Count>1</Count></Room>
      <SquareFeet Min="710" Max="740"/>
      <MarketRent Min="1525" Max="1600"/>
    </Floorplan>
    <Floorplan IDValue="fp-2br">
      <Name>The Two</Name>
      <Room RoomType="Bedroom"><Count>2</Count></Room>
      <Room RoomType="Bathroom"><Count>1.5</Count></Room>
      <SquareFeet Min="1040" Max="1040"/>
      <MarketRent Min="1895.50" Max="1895.50"/>
    </Floorplan>
    <ILS_Unit IDValue="u-101">
      <Units><Unit>
        <FloorplanID IDValue="fp-1br"/>
        <MarketingName>101</MarketingName>
        <UnitBedrooms>1</UnitBedrooms>
        <UnitBathrooms>1</UnitBathrooms>
        <MinSquareFeet>715</MinSquareFeet>
        <UnitRent>1550</UnitRent>
        <UnitOccupancyStatus>vacant</UnitOccupancyStatus>
        <UnitLeasedStatus>available</UnitLeasedStatus>
      </Unit></Units>
      <Availability><VacateDate Month="11" Day="1" Year="2026"/></Availability>
    </ILS_Unit>
    <ILS_Unit IDValue="u-214">
      <Units><Unit>
        <FloorplanID IDValue="fp-2br"/>
        <MarketingName>214</MarketingName>
      </Unit></Units>
      <Availability><MadeReadyDate Month="12" Day="5" Year="2026"/></Availability>
    </ILS_Unit>
    <ILS_Unit IDValue="u-305">
      <Units><Unit>
        <FloorplanID IDValue="fp-1br"/>
        <MarketingName>305</MarketingName>
      </Unit></Units>
      <EffectiveRent Min="1475" Max="1475"/>
    </ILS_Unit>
    <ILS_Unit IDValue="u-402">
      <Units><Unit>
        <MarketingName>402</MarketingName>
        <UnitOccupancyStatus>occupied</UnitOccupancyStatus>
        <UnitRent>1700</UnitRent>
      </Unit></Units>
    </ILS_Unit>
    <ILS_Unit IDValue="u-403">
      <Units><Unit>
        <MarketingName>403</MarketingName>
        <UnitLeasedStatus>leased</UnitLeasedStatus>
        <UnitRent>1700</UnitRent>
      </Unit></Units>
    </ILS_Unit>
    <ILS_Unit IDValue="u-500">
      <Units><Unit><MarketingName>500</MarketingName></Unit></Units>
    </ILS_Unit>
    <ILS_Unit IDValue="u-501">
      <Units><Unit><MarketingName>501</MarketingName><UnitRent>call us</UnitRent></Unit></Units>
    </ILS_Unit>
  </Property>
  <Property IDValue="prop-2">
    <PropertyID><MarketingName>Second Place</MarketingName></PropertyID>
    <ILS_Unit IDValue="u-A"><Units><Unit><UnitID>A-1</UnitID><UnitRent>1200</UnitRent><UnitBedrooms>0</UnitBedrooms></Unit></Units></ILS_Unit>
  </Property>
</PhysicalProperty>`;

test("it is a sandbox connector", () => {
  assert.equal(PROVIDER, "mits_feed");
  assert.equal(SANDBOX, true);
});

describe("parseMitsXml", () => {
  const out = parseMitsXml(FEED);

  test("reads each property: id, name (with entities decoded) and address", () => {
    assert.deepEqual(out.properties, [
      { externalId: "prop-1", name: "Palo Verde Commons & Lofts", address: { line1: "100 Example Way", city: "Tempe", state: "AZ", zip: "85281" } },
      { externalId: "prop-2", name: "Second Place", address: { line1: null, city: null, state: null, zip: null } }
    ]);
  });
  test("a unit's own numbers win; its date comes from VacateDate", () => {
    assert.deepEqual(out.listings.find((l) => l.unit_label === "101"), {
      external_id: "u-101", property_external_id: "prop-1", unit_label: "101", beds: 1, baths: 1, sqft: 715,
      rent_cents: 155000, available_on: "2026-11-01", specials: null, source: "feed"
    });
  });
  test("a unit with only a floorplan takes beds, baths, size and rent from it; MadeReadyDate is its date", () => {
    assert.deepEqual(out.listings.find((l) => l.unit_label === "214"), {
      external_id: "u-214", property_external_id: "prop-1", unit_label: "214", beds: 2, baths: 1.5, sqft: 1040,
      rent_cents: 189550, available_on: "2026-12-05", specials: null, source: "feed"
    });
  });
  test("rent falls back from the unit, to the unit's EffectiveRent, to the floorplan's MarketRent", () => {
    assert.equal(out.listings.find((l) => l.unit_label === "305").rent_cents, 147500);
  });
  test("occupied and leased units are skipped and listed", () => {
    assert.deepEqual(out.skipped, [{ unit: "402", reason: "occupied" }, { unit: "403", reason: "leased" }]);
    assert.equal(out.listings.some((l) => ["402", "403"].includes(l.unit_label)), false);
  });
  test("a unit with no rent anywhere, or an unreadable rent, is one error and the rest still import", () => {
    assert.deepEqual(out.errors, [
      { unit: "500", message: "The unit has no rent, and neither does its floorplan." },
      { unit: "501", message: '"call us" is not a rent amount.' }
    ]);
    assert.deepEqual(out.listings.map((l) => l.unit_label), ["101", "214", "305", "A-1"]);
  });
  test("a unit with no MarketingName uses UnitID", () => {
    assert.equal(out.listings.find((l) => l.property_external_id === "prop-2").unit_label, "A-1");
    assert.equal(out.listings.find((l) => l.unit_label === "A-1").beds, 0);
  });
  test("the namespace on the root does not matter", () => {
    const ns = parseMitsXml(FEED.replace('xmlns="http://www.mitsproject.org/ils"', 'xmlns:m="urn:x"').replaceAll("<Property ", "<m:Property ").replaceAll("</Property>", "</m:Property>"));
    assert.equal(ns.listings.length, 4);
  });
});

describe("bad files give errors, not crashes", () => {
  const msg = (xml) => parseMitsXml(xml).errors[0].message;

  test("not XML, truncated XML and mismatched tags", () => {
    assert.match(msg("hello"), /exactly one top-level/);
    assert.match(msg("<PhysicalProperty><Property>"), /before <Property>|ends before/);
    assert.match(msg("<PhysicalProperty><a></b></PhysicalProperty>"), /does not match/);
    assert.match(msg("<PhysicalProperty"), /middle of a tag/);
    assert.match(msg("<PhysicalProperty><!-- never closes"), /comment/);
  });
  test("a different XML format is named as not MITS", () => {
    assert.match(msg("<html><body/></html>"), /not a MITS file/);
  });
  test("a MITS file with no properties", () => {
    assert.match(msg("<PhysicalProperty/>"), /no Property/);
  });
  test("a DOCTYPE is refused (no entity tricks)", () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><PhysicalProperty><Property/></PhysicalProperty>';
    assert.match(msg(evil), /DOCTYPE/);
  });
  test("a huge file is refused", () => {
    assert.match(msg("<PhysicalProperty>" + "x".repeat(MAX_XML_CHARS) + "</PhysicalProperty>"), /too large/);
  });
  test("empty and null input", () => {
    assert.equal(parseMitsXml("").errors.length, 1);
    assert.equal(parseMitsXml(null).errors.length, 1);
  });
  test("returns empty lists alongside the error", () => {
    const r = parseMitsXml("nope");
    assert.deepEqual([r.properties, r.listings, r.skipped], [[], [], []]);
  });
});

describe("parseXml", () => {
  test("attributes in either quote style, self-closing tags, CDATA, comments, and numeric entities", () => {
    const root = parseXml(`<?xml version="1.0"?><r a="1" b='two &amp; three'><c/><d><![CDATA[<raw & text>]]></d><e>&#65;&#x42;&lt;</e><!-- skip --></r>`);
    assert.equal(root.name, "r");
    assert.deepEqual(root.attrs, { a: "1", b: "two & three" });
    assert.deepEqual(root.children.map((c) => c.name), ["c", "d", "e"]);
    assert.equal(root.children[1].text, "<raw & text>");
    assert.equal(root.children[2].text, "AB<");
  });
  test("a > inside an attribute value does not end the tag", () => {
    assert.equal(parseXml('<r a="x>y"><c/></r>').attrs.a, "x>y");
  });
  test("unknown entities are left alone", () => {
    assert.equal(parseXml("<r>&nbsp;</r>").text, "&nbsp;");
  });
  test("deep nesting is refused", () => {
    assert.throws(() => parseXml("<a>".repeat(100) + "</a>".repeat(100)), /nested too deeply/);
  });
  test("two top-level elements are refused", () => {
    assert.throws(() => parseXml("<a/><b/>"), /exactly one/);
  });
});

describe("connector methods", () => {
  test("listListings can narrow to one property", async () => {
    const all = await listListings({ xml: FEED });
    const two = await listListings({ xml: FEED, propertyExternalId: "prop-2" });
    assert.equal(all.listings.length, 4);
    assert.deepEqual(two.listings.map((l) => l.unit_label), ["A-1"]);
    assert.equal(all.errors.length, 2);
    assert.equal(all.properties.length, 2);
  });
  test("a bad feed comes back as errors", async () => {
    const out = await listListings({ xml: "nope" });
    assert.deepEqual(out.listings, []);
    assert.equal(out.errors.length, 1);
  });
  test("pushGuestCard builds the registration email and getLeaseStatus defers to the portal", async () => {
    const { pushGuestCard, getLeaseStatus } = await import("./mits-feed.mjs");
    const push = await pushGuestCard({ renter: { email: "r@example.com" }, building: { leasing_email: "l@example.com" }, registrationSentAt: "2026-10-07T12:00:00Z" });
    assert.equal(push.ok, true);
    assert.equal((await getLeaseStatus()).known, false);
  });
});
