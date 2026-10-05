import test from "node:test";
import assert from "node:assert/strict";
import { scrubSensitive, scrubText, isSensitiveKey, luhnValid, WITHHELD } from "./scrub.mjs";

test("sensitive keys are matched word by word, in snake or camel case", () => {
  for (const k of ["ssn", "ssns", "social_security_number", "accountIdentifier", "account_number",
    "date_of_birth", "dob", "dobs", "password", "api_key", "access_token", "card_number", "tin", "ein"]) {
    assert.equal(isSensitiveKey(k), true, k);
  }
  for (const k of ["waiting", "editing", "adobe_id", "account_last4", "ssn_present", "first_name",
    "phone", "email", "route_status", "tokenize_note"]) {
    assert.equal(isSensitiveKey(k), false, k);
  }
});

test("scrubSensitive withholds by key and records the path", () => {
  const withheld = [];
  const out = scrubSensitive({ a: { ssn: "123456789", name: "Jane" }, list: [{ password: "x" }] }, { withheld });
  assert.equal(out.a.ssn, WITHHELD);
  assert.equal(out.a.name, "Jane");
  assert.equal(out.list[0].password, WITHHELD);
  assert.deepEqual(withheld, ["a.ssn", "list[0].password"]);
});

/* Test card numbers are assembled at runtime so secret scanning does not read
   this file as a leaked card. 4111 1111 1111 1111 is the standard Visa test
   number; it passes the Luhn check. */
const TEST_CARD = ["4111", "1111", "1111", "1111"];

test("scrubText removes SSNs, Luhn-valid card numbers and tokens and keeps the rest", () => {
  const dashed = TEST_CARD.join("-");
  const spaced = TEST_CARD.join(" ");
  const run = TEST_CARD.join("");
  const t = scrubText(`ssn 123-45-6789, 123 45 6789, card ${dashed}, ${spaced}, ${run}, key sk-abcdefghijklmnopqrstuvwxyz, ok`);
  for (const gone of ["123-45-6789", "123 45 6789", dashed, spaced, run, "sk-abcdef"]) {
    assert.ok(!t.includes(gone), `${gone} survived: ${t}`);
  }
  assert.match(t, /^ssn \[ssn withheld\]/);
  assert.match(t, /\[number withheld\]/);
  assert.match(t, /, ok$/);
});

test("luhnValid accepts the test card and refuses a near miss", () => {
  assert.equal(luhnValid(TEST_CARD.join("")), true);
  assert.equal(luhnValid(TEST_CARD.join("").replace(/1$/, "2")), false);
});

test("a card-shaped number that fails the Luhn check is kept", () => {
  const notACard = TEST_CARD.join(" ").replace(/1$/, "2");
  assert.equal(scrubText(`order ${notACard}`), `order ${notACard}`);
});

test("phone numbers, ISO dates, dollar amounts and ids survive", () => {
  const keep = [
    "call 555-123-4567 555-987-6543 or +15551234567 or (555) 123-4567",
    "between 2026-10-01 2026-10-05 and 2026-10-01T16:00:00Z",
    "paid $12,500.00 then $1,234,567.89 and 4999 cents",
    "ref 550e8400-e29b-41d4-a716-446655440000"
  ].join(" | ");
  assert.equal(scrubText(keep), keep);
});

test("birth dates after a label are withheld, numeric or written; the label stays", () => {
  const cases = [
    ["DOB: 01/02/1980", "DOB: [dob withheld]"],
    ["D.O.B. 1980-01-02", "D.O.B. [dob withheld]"],
    ["date of birth is Jan 2, 1980.", "date of birth is [dob withheld]."],
    ["my birth date - 2 January 1980", "my birth date - [dob withheld]"],
    ["birthday 3/4/79", "birthday [dob withheld]"],
    ["I was born on March 4th, 1979 in Ohio", "I was born on [dob withheld] in Ohio"],
    ["born 1979-03-04", "born [dob withheld]"]
  ];
  for (const [input, want] of cases) assert.equal(scrubText(input), want, input);
  // A date with no birth label is not a birth date.
  assert.equal(scrubText("call booked 2026-10-05"), "call booked 2026-10-05");
});

test("passwords, passcodes and PINs after a label are withheld", () => {
  const cases = [
    ["password: hunter2!", "password: [password withheld]"],
    ["my password is Tr0ub4dor&3 thanks", "my password is [password withheld] thanks"],
    ["passcode=8812", "passcode=[password withheld]"],
    ['password: "two words"', "password: [password withheld]"],
    ["PIN: 4821", "PIN: [pin withheld]"],
    ["the pin is 0042.", "the pin is [pin withheld]."],
    ["pin code # 99881", "pin code # [pin withheld]"],
    ["pwd: s3cret!", "pwd: [password withheld]"],
    ["your OTP is 993311", "your OTP is [pin withheld]"]
  ];
  for (const [input, want] of cases) assert.equal(scrubText(input), want, input);
  // No separator, no value: ordinary words stay.
  for (const keep of ["send the password reset link", "pin it to the top", "passcode screen"]) {
    assert.equal(scrubText(keep), keep);
  }
});

test("quoted JSON keys inside a string have their values withheld", () => {
  const raw = '{"name":"Jane","dob":"1980-02-03","password":"hunter2","ssn":"123456789","token":"abc.def",' +
    '"api_key":"k-1","customer_ssn":"987-65-4321","pin":4821,"amount":"12.50"}';
  const t = scrubText(raw);
  for (const gone of ["1980-02-03", "hunter2", "123456789", "abc.def", "k-1", "987-65-4321", "4821"]) {
    assert.ok(!t.includes(gone), `${gone} survived: ${t}`);
  }
  assert.ok(t.includes('"dob":"[withheld]"'));
  assert.ok(t.includes('"pin":"[withheld]"'));
  assert.ok(t.includes('"name":"Jane"'));
  assert.ok(t.includes('"amount":"12.50"'));
  // Escaped JSON nested in another string.
  const nested = String.raw`{\"password\":\"hunter2\",\"dob\":\"02/03/1980\"}`;
  const n = scrubText(nested);
  assert.ok(!n.includes("hunter2") && !n.includes("02/03/1980"), n);
  assert.ok(n.includes(String.raw`\"password\":\"[withheld]\"`), n);
});

test("SSNs with dots, en dashes, or glued to letters are withheld; a $ amount is not", () => {
  for (const ssn of ["123.45.6789", "123–45–6789", "ssn123456789", "id_123456789", "SSN:123-45-6789"]) {
    const t = scrubText(`x ${ssn} y`);
    assert.ok(!/\d{4}/.test(t.replace(/\[[^\]]*\]/g, "")), `${ssn} survived: ${t}`);
  }
  for (const keep of ["paid $123456789 total", "paid $123456789.00", "price 123456789.50", "v1.2.3456789"]) {
    assert.equal(scrubText(keep), keep);
  }
});

test("token shapes are withheld: webhook secrets, Slack, AWS keys, Basic auth", () => {
  // Assembled at runtime so secret scanning does not read these as real keys.
  const tokens = [
    ["whsec", "FAKEFAKEFAKEFAKEFAKE1234"].join("_"),
    ["xoxb", "1234567890", "FAKEFAKEFAKE"].join("-"),
    ["AKIA", "FAKEFAKEFAKE1234"].join(""),
    ["Basic", "dXNlcjpwYXNzd29yZGZha2U="].join(" ")
  ];
  for (const tok of tokens) {
    const t = scrubText(`header ${tok} end`);
    assert.ok(!t.includes(tok), `${tok} survived: ${t}`);
    assert.match(t, /^header .*\[token withheld\] end$/);
  }
});

test("a signed URL reads ?token=[withheld] cleanly", () => {
  const key = ["sk", "live", "FAKEFAKEFAKE0000TESTONLY"].join("_");
  assert.equal(
    scrubText(`open https://pay.example/c?id=7&token=${key}&sig=abc123 now`),
    "open https://pay.example/c?id=7&token=[withheld]&sig=[withheld] now"
  );
});

test("new sensitive keys: pwd, credentials, cookie, otp, bank_account — numbers included", () => {
  for (const k of ["pwd", "credentials", "credential", "cookie", "set_cookie", "otp", "bank_account", "bank_account_number"]) {
    assert.equal(isSensitiveKey(k), true, k);
  }
  const out = scrubSensitive({ answers: { pin: 4821, bank_account: 123456789012, otp: 993311, note: "ok" } });
  assert.deepEqual(out.answers, { pin: WITHHELD, bank_account: WITHHELD, otp: WITHHELD, note: "ok" });
  const t = scrubText('{"pwd":"x1","credentials":{"a":1},"cookie":"s=1","otp":123456,"bank_account":"000123"}');
  for (const gone of ['"x1"', '{"a":1}', '"s=1"', "123456", '"000123"']) assert.ok(!t.includes(gone), `${gone} survived: ${t}`);
});
