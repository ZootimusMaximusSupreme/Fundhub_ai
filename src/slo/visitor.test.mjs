import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyVisitor, phoenixDay } from "./visitor.mjs";

test("a normal browser with a normal email is a person", () => {
  const who = classifyVisitor({
    email: "pat.lee@gmail.com",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    webdriver: false
  });
  assert.equal(who.actor, "person");
  assert.equal(who.reason, "browser");
});

test("the word test inside a real name is still a person", () => {
  const who = classifyVisitor({ email: "latest@gmail.com", userAgent: "Mozilla/5.0" });
  assert.equal(who.actor, "person");
});

test("an automated browser is an agent before any email", () => {
  assert.equal(classifyVisitor({ webdriver: true, userAgent: "Mozilla/5.0" }).actor, "agent");
  assert.equal(classifyVisitor({ webdriver: true }).reason, "automated_browser");
  assert.equal(classifyVisitor({ userAgent: "Mozilla/5.0 HeadlessChrome/120" }).reason, "bot_browser");
});

test("a company or test email is an agent even in a normal browser", () => {
  assert.equal(classifyVisitor({ email: "sam@fundhub.ai", userAgent: "Mozilla/5.0" }).reason, "company_email");
  assert.equal(classifyVisitor({ email: "e2e+aff-1@example.com" }).reason, "test_email");
  assert.equal(classifyVisitor({ email: "buyer+test@gmail.com" }).reason, "test_email");
  assert.equal(classifyVisitor({ email: "pat@example.com" }).reason, "test_email");
});

test("arizona day is the ad account's calendar", () => {
  assert.equal(phoenixDay(new Date("2026-09-27T02:01:34Z")), "2026-09-26");
  assert.equal(phoenixDay(new Date("2026-09-27T08:00:00Z")), "2026-09-27");
});
