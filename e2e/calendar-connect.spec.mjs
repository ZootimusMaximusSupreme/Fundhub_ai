// Calendar — the "Connect your calendar" box (owner-approved 2026-10-07).
// /api/staff/calendar-link is answered here with page.route(); no backend.

import { test, expect } from "@playwright/test";
import { CLOSER, wireApi, gotoScreen, trackErrors, assertPageAlive } from "./harness.mjs";

const OWNER_EMAIL = "owner-calendar@example.com";
const LINK_URL = "/api/staff/calendar-link";

function linkApi({ get, post }) {
  return {
    [LINK_URL]: async (route, { method }) => {
      const answer = method === "POST" ? post : get;
      const { status = 200, body } = typeof answer === "function" ? answer(route) : answer;
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    },
    "/api/tasks": () => ({ ok: true, tasks: [] })
  };
}

const NO_LINK = { status: 200, body: { ok: true, link: null, owner_email: OWNER_EMAIL, google_ready: false } };

test.describe("Calendar — connect your calendar", () => {

  test("no link yet: chip says Not connected, the four steps name the address to share with", async ({ page }) => {
    const errors = trackErrors(page);
    await wireApi(page, { session: CLOSER, handlers: linkApi({ get: NO_LINK }) });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await expect(page.locator("#calLinkChipText")).toHaveText("Not connected");
    await expect(page.locator("#calLinkOwner")).toHaveText(OWNER_EMAIL);
    await expect(page.locator("#calLink .callink-steps li")).toHaveCount(4);
    await expect(page.locator("#calLink .callink-steps")).toContainText("See only free/busy");
    await expect(page.locator("label[for=calLinkEmail]")).toHaveText("Your Google Calendar email");
    await expect(page.locator("#calLinkSave")).toHaveText("Save and check");
    await assertPageAlive(page, errors);
  });

  test("Save and check posts the typed address and says what Google said", async ({ page }) => {
    let posted = null;
    await wireApi(page, {
      session: CLOSER,
      handlers: linkApi({
        get: NO_LINK,
        post: (route) => {
          posted = JSON.parse(route.request().postData() || "{}");
          return { status: 200, body: {
            ok: true, result: "not_shared", owner_email: OWNER_EMAIL, google_ready: true,
            link: { calendar_email: "justice@gmail.com", status: "pending", last_error: "Not shared yet", last_checked_at: new Date().toISOString(), blocks_booking: true }
          } };
        }
      })
    });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await page.locator("#calLinkEmail").fill(" justice@gmail.com ");
    await page.locator("#calLinkSave").click();
    await expect(page.locator("#calLinkMsg")).toContainText("not shared yet");
    expect(posted).toEqual({ calendar_email: "justice@gmail.com" });
    await expect(page.locator("#calLinkChipText")).toHaveText("Not ready yet");
    await expect(page.locator("#calLinkNote")).toHaveText("Not shared yet");
    await expect(page.locator("#calLinkSave")).toBeEnabled();
  });

  test("a connected calendar says Connected in words, with the address filled in", async ({ page }) => {
    await wireApi(page, {
      session: CLOSER,
      handlers: linkApi({ get: { status: 200, body: {
        ok: true, owner_email: OWNER_EMAIL, google_ready: true,
        link: { calendar_email: "justice@gmail.com", status: "connected", last_error: null, last_checked_at: new Date().toISOString(), blocks_booking: true }
      } } })
    });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await expect(page.locator("#calLinkChipText")).toHaveText("Connected");
    await expect(page.locator("#calLinkChip")).toHaveClass(/\bon\b/);
    await expect(page.locator("#calLinkEmail")).toHaveValue("justice@gmail.com");
  });

  test("a bad address shows the server's sentence, not a code", async ({ page }) => {
    await wireApi(page, {
      session: CLOSER,
      handlers: linkApi({
        get: NO_LINK,
        post: { status: 400, body: { ok: false, error: "invalid_calendar_email", message: "Type the email address of your Google Calendar, like name@gmail.com." } }
      })
    });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await page.locator("#calLinkEmail").fill("justice");
    await page.locator("#calLinkSave").click();
    await expect(page.locator("#calLinkMsg")).toHaveText("Type the email address of your Google Calendar, like name@gmail.com.");
    await expect(page.locator("#calLinkMsg")).not.toContainText("invalid_calendar_email");
  });

  test("an empty box asks for the address and sends nothing", async ({ page }) => {
    let posts = 0;
    await wireApi(page, { session: CLOSER, handlers: linkApi({ get: NO_LINK, post: () => { posts += 1; return NO_LINK; } }) });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await expect(page.locator("#calLinkChipText")).toHaveText("Not connected");
    await page.locator("#calLinkSave").click();
    await expect(page.locator("#calLinkMsg")).toHaveText("Type your Google Calendar email first.");
    expect(posts).toBe(0);
  });

  test("a login the endpoint does not serve never sees the box", async ({ page }) => {
    await wireApi(page, {
      session: CLOSER,
      handlers: linkApi({ get: { status: 403, body: { ok: false, error: "not_available", message: "x" } } })
    });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await expect(page.locator("#calLink")).toBeHidden();
    await expect(page.locator("#calLinkTitle")).toBeHidden();
  });

  test("a read that fails says so instead of claiming Not connected", async ({ page }) => {
    await wireApi(page, {
      session: CLOSER,
      handlers: linkApi({ get: { status: 500, body: { ok: false, error: "internal_error" } } })
    });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await expect(page.locator("#calLinkChipText")).toHaveText("Not loaded");
    await expect(page.locator("#calLinkNote")).toContainText("status is unknown");
  });

  test("at phone width the box is one column with a 40px button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await wireApi(page, { session: CLOSER, handlers: linkApi({ get: NO_LINK }) });
    await gotoScreen(page, "calendar.html", "", CLOSER);
    await expect(page.locator("#calLinkChipText")).toHaveText("Not connected");
    const box = await page.locator("#calLinkSave").boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
    const card = await page.locator("#calLink").boundingBox();
    expect(card.width).toBeLessThanOrEqual(390);
  });
});
