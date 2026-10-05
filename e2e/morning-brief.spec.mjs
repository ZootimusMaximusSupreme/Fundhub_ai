// Morning brief report page (MB5) — the page the 6:00 a.m. text links to.
//
// /api/** is answered by page.route() (see playwright.config.mjs: no backend).
// The brief below is shaped exactly like a morning_briefs row that
// src/ops/morning-brief.mjs writes, so the page is walked against the real
// contract, not a guess at it.
//
// EVIDENCE. With MB_EVIDENCE=1 the walk also saves viewport screenshots and the
// real on-screen box of every element it talks about to
// ops/workflows/morning-brief-2026-10-05-evidence/shots/, and
// _apply-marks.py there burns the numbered red boxes on (CLAUDE.md §8).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { OWNER, CLOSER, wireApi, gotoScreen, json } from "./harness.mjs";

const EVIDENCE = process.env.MB_EVIDENCE === "1";
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..",
  "ops", "workflows", "morning-brief-2026-10-05-evidence", "shots");
const MARKS = {};

const DATE = "2026-10-05";

const BRIEF = {
  id: "b-1", org_id: "org-1", brief_date: DATE,
  systems: {
    status: "ok", total: 4, green: 2, red: 1, not_checked: 1,
    line: "Systems: 2 of 4 checks green. 1 red: login. 1 not checked.",
    reds: [],
    scorecard: {
      date: DATE, ran_at: "2026-10-05T13:00:04Z", source: "runDailyPulse",
      checks: [
        { id: "health", group: "backend", status: "green", proof: "/api/health 200 in 212 ms, pending 0" },
        { id: "gate-relay", group: "mac", status: "not_checked", proof: "GATE_RELAY_URL not set" },
        { id: "apply", group: "front_doors", status: "green", proof: "apply.fundhub.ai/apply 200" },
        { id: "login", group: "front_doors", status: "red", proof: "POST /api/auth/login answered 500",
          customer_sees: null, since: null, day_count: null, fix: "Read the login function log; redeploy if the build is stale." }
      ]
    }
  },
  marketing: {
    status: "partial", spend_day: "2026-10-04", spend_cents: 41250, spend_source: "ad_metrics_daily",
    spend_line: "Ad spend 2026-10-04: $412.50.",
    waiting: [
      "Booked calls, shows, sales and return on ad spend: waiting on the marketing numbers (marketing machine M5).",
      "Dying ads: waiting on the marketing numbers (marketing machine M5)."
    ],
    dashboard_url: null, dashboard_line: "Marketing dashboard: not built yet."
  },
  money: { status: "not_connected", reason: "PLAID_ENV is not production", line: "Money: not connected yet." },
  team: {
    status: "ok", window: "last 24 hours",
    waiting: ["Funding advisor files per person: no source yet. Nothing links a funding round to an advisor."],
    company_8: {
      new_clients: { value: 2 }, booked_calls: { value: 6 }, show_rate: { value: 0.67 },
      close_rate: { value: 0.25 }, cash_cents: { value: 300000 }, funded_count: { value: 1 },
      funded_dollars_cents: { value: 5000000 }, cost_per_funded_cents: { value: null, reason: "ad_spend_unavailable" }
    },
    closers: [{ staff_id: "s-2", name: "Casey Reed", calls_held: 4, no_shows: 2, deposits: 1, downsells: 0 }],
    csm_overdue: 3, unrecorded_calls: 1,
    line: "Team, last 24 hours: 4 calls held, 2 no-shows, 1 files funded."
  },
  suggestions: [],
  today: { status: "waiting", line: "Today: no source yet (MB4)." },
  text_body: "Good morning, Chris. Monday, October 5.",
  report_url: "https://fundhub.ai/app/morning-brief.html?date=2026-10-05",
  sent_to_last4: "6457", dry_run: true, delivery_status: "dry_run", delivery_error: null,
  provider_message_id: null, sent_at: null,
  created_at: "2026-10-05T13:00:09Z", updated_at: "2026-10-05T13:00:09Z"
};

function briefHandler(seen) {
  return async (route, { url }) => {
    const u = new URL(url);
    seen.push(u.search);
    const date = u.searchParams.get("date");
    if (date !== DATE) return json(route, { ok: false, error: "no_brief", date }, 404);
    // Current main ignores kind and answers the morning row (MB6 adds kind).
    return json(route, { ok: true, date, brief: BRIEF });
  };
}

/* Put a section's top just under the sticky header, then let layout settle. */
async function scrollTo(page, sel) {
  await page.evaluate((q) => {
    const el = document.querySelector(q);
    el.scrollIntoView({ block: "start" });
    const header = document.querySelector("header");
    const gap = el.getBoundingClientRect().top - (header ? header.getBoundingClientRect().bottom : 0) - 16;
    if (gap < 0) window.scrollBy(0, gap);
  }, sel);
  await page.waitForTimeout(150);
}

/* Measured where the page sits NOW. It must not scroll: scrolling for one mark
   moves every box already measured for the same picture. */
async function box(page, locator) {
  const b = await locator.boundingBox();
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

async function shoot(page, file, legend, marks) {
  if (!EVIDENCE) return;
  fs.mkdirSync(path.join(SHOTS, "_raw"), { recursive: true });
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    out.push({ n: i + 1, caption: marks[i].caption, box: marks[i].box });
  }
  await page.screenshot({ path: path.join(SHOTS, "_raw", file) });
  MARKS[file] = { legend, marks: out };
  fs.writeFileSync(path.join(SHOTS, "shot-marks.json"), JSON.stringify(MARKS, null, 2));
}

test.describe("Morning brief report page", () => {
  test("owner sees six parts in order, red checks first, every time in Arizona", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen = [];
    await wireApi(page, { session: OWNER, handlers: { "/api/read/morning-brief": briefHandler(seen) } });
    await gotoScreen(page, "morning-brief.html", `date=${DATE}`);

    await expect(page.locator("#mb-checks tbody tr").first()).toBeVisible();
    expect(seen[0]).toContain(`date=${DATE}`);
    expect(seen[0]).toContain("kind=morning");

    const heads = await page.locator("#mb-report section h2").allTextContents();
    expect(heads).toEqual(["1. Systems", "2. Marketing", "3. Money", "4. Team", "5. Suggestions", "6. Today"]);

    const order = await page.locator("#mb-checks tbody tr").evaluateAll((rows) => rows.map((r) => r.dataset.status));
    expect(order).toEqual(["red", "not_checked", "green", "green"]);
    const red = page.locator("#mb-checks tbody tr").first();
    await expect(red).toContainText("Red");
    await expect(red).toContainText("login");
    await expect(red).toContainText("What a customer sees: Not recorded yet.");
    await expect(red).toContainText("Fastest fix: Read the login function log");

    // Times: 13:00 UTC is 6:00 a.m. Arizona — never the browser's own zone.
    await expect(page.locator("#sec-systems .src")).toContainText("6:00 AM MST");
    await expect(page.locator("#mb-ran")).toContainText("Built Oct 5, 6:00 AM MST");
    await expect(page.locator("#mb-delivery")).toHaveText("Not texted (dry run)");
    await expect(page.locator("#mb-date")).toHaveValue(DATE);

    await shoot(page, "01-systems-red-first.png", "Morning brief: Systems, red first", [
      { caption: "Morning / Evening switch, and the day picker", box: await box(page, page.locator(".hr")) },
      { caption: "Not texted yet: the brief is still a dry run", box: await box(page, page.locator("#mb-delivery")) },
      { caption: "Headline: 2 of 4 green, 1 red, 1 not checked", box: await box(page, page.locator("#sec-systems .hero")) },
      { caption: "The red check is the first row", box: await box(page, red) }
    ]);

    // Every number names where it came from.
    await expect(page.locator("#sec-marketing .src")).toContainText("ad_metrics_daily");
    await expect(page.locator("#sec-marketing")).toContainText("$412.50");
    await expect(page.locator("#sec-marketing")).toContainText("waiting on the marketing numbers");
    await expect(page.locator("#sec-marketing")).toContainText("Marketing dashboard: not built yet.");
    await expect(page.locator("#sec-money")).toContainText("Money: not connected yet.");
    await expect(page.locator("#sec-money")).toContainText("PLAID_ENV is not production");
    await expect(page.locator("#sec-suggestions")).toContainText("Suggestions: none yet.");
    await expect(page.locator("#sec-today")).toContainText("Today: no source yet (MB4).");

    await scrollTo(page, "#sec-marketing");
    await shoot(page, "02-marketing-money.png", "Morning brief: Marketing and Money", [
      { caption: "Ad spend, with where it came from", box: await box(page, page.locator("#sec-marketing .grid")) },
      { caption: "Waiting lines print as-is, no made-up numbers", box: await box(page, page.locator("#sec-marketing .card")) },
      { caption: "Money: not connected yet, and why", box: await box(page, page.locator("#sec-money .card")) }
    ]);

    await expect(page.locator("#mb-closers")).toContainText("Casey Reed");
    await expect(page.locator("#sec-team")).toContainText("$3,000.00");
    await expect(page.locator("#sec-team")).toContainText("the call log, last 24 hours");
    await scrollTo(page, "#sec-team");
    await shoot(page, "03-team.png", "Morning brief: Team", [
      { caption: "Company numbers, source named under them", box: await box(page, page.locator("#sec-team .grid").first()) },
      { caption: "Per closer, from the call log, last 24 hours", box: await box(page, page.locator("#mb-closers")) }
    ]);

    await scrollTo(page, "#sec-suggestions");
    await shoot(page, "04-suggestions-today.png", "Morning brief: Suggestions and Today", [
      { caption: "Suggestions: waiting line until MB4", box: await box(page, page.locator("#sec-suggestions .card")) },
      { caption: "Today: waiting line until MB4", box: await box(page, page.locator("#sec-today .card")) }
    ]);
  });

  test("Evening asks with kind=evening and never shows the morning row as evening", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen = [];
    await wireApi(page, { session: OWNER, handlers: { "/api/read/morning-brief": briefHandler(seen) } });
    await gotoScreen(page, "morning-brief.html", `date=${DATE}`);
    await expect(page.locator("#mb-checks")).toBeVisible();
    await page.locator('.segb[data-kind="evening"]').click();
    await expect(page.locator("#mb-state")).toContainText("No evening brief was saved for Monday, October 5, 2026.");
    expect(seen[seen.length - 1]).toContain("kind=evening");
    await expect(page).toHaveURL(/kind=evening/);
    await shoot(page, "05-evening-not-yet.png", "Evening switch (MB6 not merged yet)", [
      { caption: "Evening picked; the ask carries kind=evening", box: await box(page, page.locator(".seg")) },
      { caption: "Honest answer: no evening brief yet", box: await box(page, page.locator("#mb-state .state")) }
    ]);
  });

  test("a day with no brief says so, and Show today comes back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seen = [];
    await wireApi(page, { session: OWNER, handlers: { "/api/read/morning-brief": briefHandler(seen) } });
    await gotoScreen(page, "morning-brief.html", "date=2026-10-01");
    await expect(page.locator("#mb-state")).toContainText("No morning brief was saved for Thursday, October 1, 2026.");
    await expect(page.locator("#mb-today")).toBeVisible();
    await shoot(page, "06-no-brief-that-day.png", "A day with no saved brief", [
      { caption: "Plain answer, not a blank page", box: await box(page, page.locator("#mb-state .state")) },
      { caption: "One click back to today (Arizona)", box: await box(page, page.locator("#mb-today")) }
    ]);
  });

  test("no date defaults to today in Arizona", async ({ page }) => {
    const seen = [];
    await wireApi(page, { session: OWNER, handlers: { "/api/read/morning-brief": briefHandler(seen) } });
    await gotoScreen(page, "morning-brief.html");
    const az = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await expect(page.locator("#mb-date")).toHaveValue(az);
    expect(seen[0]).toContain(`date=${az}`);
  });

  test("phone width stacks to one column with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await wireApi(page, { session: OWNER, handlers: { "/api/read/morning-brief": briefHandler([]) } });
    await gotoScreen(page, "morning-brief.html", `date=${DATE}`);
    await expect(page.locator("#mb-checks")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await scrollTo(page, "#sec-systems");
    await shoot(page, "07-phone.png", "Phone, 390 wide", [
      { caption: "Tiles stack, one per row", box: await box(page, page.locator("#sec-systems .hero .kpi").first()) }
    ]);
  });

  test("a closer is not shown the report", async ({ page }) => {
    await wireApi(page, { session: CLOSER, handlers: { "/api/read/morning-brief": { ok: false, error: "forbidden" } } });
    await page.route("**/api/read/morning-brief**", (route) => json(route, { ok: false, error: "forbidden" }, 403));
    await gotoScreen(page, "morning-brief.html", `date=${DATE}`, CLOSER);
    await page.waitForLoadState("networkidle");
    // The shell bounces a role the page is not for; if it ever did not, the
    // endpoint's 403 still leaves no numbers on screen.
    expect(page.url()).not.toContain("morning-brief.html");
    await expect(page.locator("body")).not.toContainText("$3,000.00");
  });
});
