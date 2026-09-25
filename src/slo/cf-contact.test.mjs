import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSloCfContact, syncSloClickfunnelsContact } from "./cf-contact.mjs";

const PERSON = {
  email: "buyer@example.com",
  firstName: "Ada",
  lastName: "Buyer",
  phone: "+16615550100",
  ssn: "123-45-6789",
  dob: "1990-01-02",
  address: {
    addressLine1: "100 Main St",
    addressLine2: "Apt 2",
    city: "Denton",
    state: "TX",
    postalCode: "76205"
  },
  businesses: [{ name: "Ada Hauling", ein: "12-3456789" }]
};

test("contact payload has name, phone, address, and business — never SSN, DOB, or EIN", () => {
  const contact = buildSloCfContact(PERSON);
  const raw = JSON.stringify(contact);
  assert.equal(contact.email_address, "buyer@example.com");
  assert.equal(contact.first_name, "Ada");
  assert.equal(contact.last_name, "Buyer");
  assert.equal(contact.phone_number, "+16615550100");
  assert.equal(contact.custom_attributes.address, "100 Main St, Apt 2");
  assert.equal(contact.custom_attributes.city, "Denton");
  assert.equal(contact.custom_attributes.state, "TX");
  assert.equal(contact.custom_attributes.zip, "76205");
  assert.equal(contact.custom_attributes.business_name, "Ada Hauling");
  assert.equal(raw.includes("123-45-6789"), false);
  assert.equal(raw.includes("1990-01-02"), false);
  assert.equal(raw.includes("12-3456789"), false);
  assert.equal(raw.includes("ssn"), false);
  assert.equal(raw.includes("ein"), false);
});

test("prequal dollars ride along when the pull has finished", () => {
  const contact = buildSloCfContact({ email: "buyer@example.com", prequal: 212000 });
  assert.equal(contact.custom_attributes.prequal_amount, "212000");
  assert.equal(contact.first_name, undefined);
});

test("no email means no contact", () => {
  assert.equal(buildSloCfContact({ firstName: "Ada" }), null);
});

test("missing API key skips the call", async () => {
  let called = false;
  const out = await syncSloClickfunnelsContact(PERSON, {
    env: {},
    fetchImpl: async () => { called = true; return { ok: true, status: 200, text: async () => "{}" }; }
  });
  assert.equal(out.skipped, true);
  assert.equal(called, false);
});

test("upsert posts the safe contact and keeps the pull alive when ClickFunnels refuses", async () => {
  const calls = [];
  const ok = await syncSloClickfunnelsContact(PERSON, {
    env: {
      CLICKFUNNELS_API_KEY: "test-key",
      CLICKFUNNELS_SUBDOMAIN: "myworkspace",
      CLICKFUNNELS_WORKSPACE_ID: "42"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 99, email_address: "buyer@example.com" }),
        headers: { get: () => null }
      };
    }
  });
  assert.equal(ok.id, 99);
  assert.match(calls[0].url, /\/workspaces\/42\/contacts\/upsert$/);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(JSON.stringify(sent).includes("123-45-6789"), false);

  const refused = await syncSloClickfunnelsContact(PERSON, {
    env: {
      CLICKFUNNELS_API_KEY: "test-key",
      CLICKFUNNELS_SUBDOMAIN: "myworkspace",
      CLICKFUNNELS_WORKSPACE_ID: "42"
    },
    fetchImpl: async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error: "nope" }),
      headers: { get: () => null }
    })
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "clickfunnels_refused");
});
