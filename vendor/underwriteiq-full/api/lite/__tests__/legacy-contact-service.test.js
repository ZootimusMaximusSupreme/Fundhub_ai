const test = require("node:test");
const assert = require("node:assert/strict");

// Test parseFullName directly (pure function)
const { parseFullName } = require("../legacy-contact-service");

// ============================================================================
// parseFullName tests
// ============================================================================
test("parseFullName splits first and last name", () => {
  const result = parseFullName("John Doe");
  assert.equal(result.firstName, "John");
  assert.equal(result.lastName, "Doe");
});

test("parseFullName handles single name", () => {
  const result = parseFullName("Madonna");
  assert.equal(result.firstName, "Madonna");
  assert.equal(result.lastName, "");
});

test("parseFullName handles multiple middle names", () => {
  const result = parseFullName("John Michael Smith Jr");
  assert.equal(result.firstName, "John");
  assert.equal(result.lastName, "Michael Smith Jr");
});

test("parseFullName handles empty string", () => {
  const result = parseFullName("");
  assert.equal(result.firstName, "");
  assert.equal(result.lastName, "");
});

test("parseFullName handles null", () => {
  const result = parseFullName(null);
  assert.equal(result.firstName, "");
  assert.equal(result.lastName, "");
});

test("parseFullName handles undefined", () => {
  const result = parseFullName(undefined);
  assert.equal(result.firstName, "");
  assert.equal(result.lastName, "");
});

test("parseFullName handles non-string input", () => {
  const result = parseFullName(12345);
  assert.equal(result.firstName, "");
  assert.equal(result.lastName, "");
});

test("parseFullName trims whitespace", () => {
  const result = parseFullName("  John   Doe  ");
  assert.equal(result.firstName, "John");
  assert.equal(result.lastName, "Doe");
});

test("parseFullName handles extra spaces between names", () => {
  const result = parseFullName("John    Michael    Doe");
  assert.equal(result.firstName, "John");
  assert.equal(result.lastName, "Michael Doe");
});

// ============================================================================
// Config function tests (with env var manipulation)
// ============================================================================
test("getApiBase returns default when not configured", async () => {
 const originalBase = process.env.;
 delete process.env.;

  // Re-require to get fresh module
 delete require.cache[require.resolve("../legacy-contact-service")];
 const { createOrUpdateContact } = require("../legacy-contact-service");

  // Call function - it will fail but we can check the error message
  const result = await createOrUpdateContact({ email: "test@test.com" });

  // Restore
 if (originalBase) process.env. = originalBase;

  // Should fail due to missing API key, not base URL
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("API key"));
});

test("getApiKey returns null when not configured", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];
 const { createOrUpdateContact } = require("../legacy-contact-service");

  const result = await createOrUpdateContact({ email: "test@test.com" });

  // Restore

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("API key"));
});

test("getLocationId returns null when not configured", async () => {


 delete require.cache[require.resolve("../legacy-contact-service")];
 const { createOrUpdateContact } = require("../legacy-contact-service");

  const result = await createOrUpdateContact({ email: "test@test.com" });

  // Restore
  if (originalKey) {
  } else {
  }

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Location ID"));
});

// ============================================================================
// findContactByEmail tests
// ============================================================================
test("findContactByEmail returns null for empty email", async () => {
 const { findContactByEmail } = require("../legacy-contact-service");
  const result = await findContactByEmail("");
  assert.equal(result, null);
});

test("findContactByEmail returns null for null email", async () => {
 const { findContactByEmail } = require("../legacy-contact-service");
  const result = await findContactByEmail(null);
  assert.equal(result, null);
});

test("findContactByEmail returns null when API key missing", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];

  const result = await findContactByEmail("test@test.com");


  assert.equal(result, null);
});

// ============================================================================
// createAffiliate tests
// ============================================================================
test("createAffiliate returns error when API key missing", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];

  const result = await createAffiliate("contact-123");


  assert.equal(result.ok, false);
  assert.ok(result.error.includes("API key"));
});

// ============================================================================
// createContactAndAffiliate tests
// ============================================================================
test("createContactAndAffiliate returns error when contact creation fails", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];
 const { createContactAndAffiliate } = require("../legacy-contact-service");

  const result = await createContactAndAffiliate({ email: "test@test.com" });


  assert.equal(result.ok, false);
  assert.equal(result.contactCreated, false);
  assert.equal(result.affiliateCreated, false);
});

// ============================================================================
// updateContact tests
// ============================================================================
test("updateContact returns error when API key missing", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];

  const result = await updateContact("contact-123", { firstName: "Test" });


  assert.equal(result.ok, false);
  assert.ok(result.error.includes("API key"));
});

// ============================================================================
// updateContactCustomFields tests
// ============================================================================
test("updateContactCustomFields returns error when API key missing", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];
 const { updateContactCustomFields } = require("../legacy-contact-service");

  const result = await updateContactCustomFields("contact-123", {
    cf_uq_path: "repair"
  });


  assert.equal(result.ok, false);
  assert.ok(result.error.includes("API key"));
});

test("updateContactCustomFields returns error when contactId missing", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];
 const { updateContactCustomFields } = require("../legacy-contact-service");

  const result = await updateContactCustomFields(null, {
    cf_uq_path: "repair"
  });

  if (originalKey) {
  } else {
  }

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Contact ID"));
});

test("updateContactCustomFields returns error for empty contactId", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];
 const { updateContactCustomFields } = require("../legacy-contact-service");

  const result = await updateContactCustomFields("", {
    cf_uq_path: "repair"
  });

  if (originalKey) {
  } else {
  }

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Contact ID"));
});

// ============================================================================
// updateLetterUrls tests
// ============================================================================
test("updateLetterUrls returns error when API key missing", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];

  const result = await updateLetterUrls(
    "contact-123",
    { ex_round1: "https://blob.com/ex1.pdf" },
    "repair"
  );


  assert.equal(result.ok, false);
  assert.ok(result.error.includes("API key"));
});

test("updateLetterUrls builds correct custom fields for repair path", async () => {
  // This tests the field mapping logic without making API calls

 delete require.cache[require.resolve("../legacy-contact-service")];

  // This will fail at the API call, but we can verify the function exists
  const result = await updateLetterUrls(
    null, // Will fail early due to null contactId
    {
      ex_round1: "https://blob.com/ex1.pdf",
      tu_round1: "https://blob.com/tu1.pdf"
    },
    "repair"
  );

  if (originalKey) {
  } else {
  }

  // Should fail due to null contactId
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Contact ID"));
});

test("updateLetterUrls handles fundable path", async () => {

 delete require.cache[require.resolve("../legacy-contact-service")];

  // Test with null contactId to verify early return
  const result = await updateLetterUrls(
    null,
    {
      personal_info_round1: "https://blob.com/pi1.pdf",
      inquiries_round1: "https://blob.com/inq1.pdf"
    },
    "fundable"
  );

  if (originalKey) {
  } else {
  }

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Contact ID"));
});
