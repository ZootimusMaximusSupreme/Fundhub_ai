import { test, expect } from "@playwright/test";

const BUSINESS_OPTS = [
  "Yes, less than 6 months old",
  "Yes, 6-12 months",
  "Yes, 1-2 years",
  "Yes, 2-5 years",
  "Yes, 5+ years",
  "No, personal funding only",
];

async function fillContact(page) {
  await page.getByLabel("First Name").fill("Jane");
  await page.getByLabel("Last Name").fill("Doe");
  await page.getByLabel("Email").fill("jane@example.com");
  await page.getByLabel("Phone Number").fill("4805551234");
  await page.getByRole("button", { name: "Next" }).click();
}

/** Single-select steps auto-advance after a short delay. */
async function pickSingle(page, label) {
  await page.getByRole("radio", { name: label, exact: true }).click();
  await page.waitForTimeout(350);
}

async function reachBusinessStep(page) {
  await page.goto("/apply-survey.html", { waitUntil: "domcontentloaded" });
  await fillContact(page);
  await expect(page.locator("#count")).toContainText("Question 2 of");
  await pickSingle(page, "Less than $50k");
  await pickSingle(page, "Growth (marketing, inventory, hiring)");
  await page.getByRole("checkbox", { name: /Peace of mind/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await pickSingle(page, "650-699");
  await expect(page.getByRole("heading", { name: "Do You Have a Business?" })).toBeVisible();
}

test.describe("apply-survey smoke", () => {
  test("loads contact step", async ({ page }) => {
    await page.goto("/apply-survey.html", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Let's See What You Qualify For" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Let's Start With Your Info" })).toBeVisible();
    await expect(page.getByText("Secure application")).toBeVisible();
    await expect(page.locator("#count")).toContainText("Question 1 of");
    await expect(page.locator("#count")).toContainText("0%");
  });

  test("progress text updates after contact", async ({ page }) => {
    await page.goto("/apply-survey.html", { waitUntil: "domcontentloaded" });
    await fillContact(page);
    const count = page.locator("#count");
    await expect(count).toContainText("Question 2 of");
    await expect(count).toContainText("10%");
  });

  test("business step shows six branch options", async ({ page }) => {
    await reachBusinessStep(page);
    for (const label of BUSINESS_OPTS) {
      await expect(page.getByRole("radio", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("radio")).toHaveCount(6);
  });

  test("personal branch after No, personal funding only", async ({ page }) => {
    await reachBusinessStep(page);
    await pickSingle(page, "No, personal funding only");
    await expect(page.getByRole("heading", { name: "Annual Personal Income" })).toBeVisible();
    await expect(page.locator("#count")).toContainText("Question 7 of 9");
  });

  test("business branch after Yes, 5+ years", async ({ page }) => {
    await reachBusinessStep(page);
    await pickSingle(page, "Yes, 5+ years");
    await expect(page.getByRole("heading", { name: "Annual Business Revenue" })).toBeVisible();
    await expect(page.locator("#count")).toContainText("Question 7 of 9");
  });
});
