/* The Lending Climate lead magnet, walked on the live site like a person.
 *   npx playwright test -c playwright.live.config.mjs e2e/live-climate.spec.mjs
 *
 * Desktop and 390px phone. Reads the map, clicks a state, fills the form, presses
 * the button, reads the number and the bank names.
 *
 * THE EMAIL CARRIES +fhtest ON PURPOSE. src/demo/test-identity.mjs reads that tag
 * and clients.is_demo is set from it at insert, so every row this spec creates is
 * disposable from birth and never reaches a sales desk. A run that used a plain
 * `e2e+…` address on 2026-09-18 left four rows on live that had to be marked by
 * hand afterwards — the tag is the fix, not the cleanup.
 *
 * Nothing here pays. The $32 button is proven by minting a checkout link and
 * reading it, which is what /optimize already does; the card is never charged.
 */

import { test, expect } from "@playwright/test";

const SIZES = [
  { label: "desktop", viewport: { width: 1440, height: 900 } },
  { label: "phone", viewport: { width: 390, height: 844 } }
];

/* The grey the stylesheet gives a path before its score arrives. A state still
   this colour after the fetch means the fill never painted — which is exactly
   what a `fill` presentation attribute does, because the stylesheet beats it. */
const UNPAINTED = "rgb(244, 244, 245)";

const BAND_WORDS = ["Very favorable", "Favorable", "Neutral", "Tight", "Very tight"];

for (const { label, viewport } of SIZES) {
  test.describe(`lending climate — ${label}`, () => {
    test.use({ viewport });

    test(`${label}: the map reads, the count is real, and nothing is promised`, async ({ page }) => {
      const consoleErrors = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e.message)));
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

      const resp = await page.goto("/climate/?utm_source=live-spec&utm_content=climate", {
        waitUntil: "domcontentloaded"
      });
      expect(resp.status()).toBe(200);
      await expect(page).toHaveTitle(/Lending Climate/i);

      /* ── the map ── */
      await page.waitForSelector("#usmap path", { timeout: 30_000 });
      await expect(page.locator("#usmap path")).toHaveCount(51);

      await expect(page.locator("#nat-score")).toHaveText(/^\d+(\.\d+)?$/);

      // The COMPUTED fill, never the attribute. UI-STANDARDS §12.6.
      const fills = await page.locator("#usmap path").evaluateAll(
        (nodes) => nodes.map((n) => getComputedStyle(n).fill)
      );
      expect(fills.filter((f) => f === UNPAINTED), "states still unpainted").toHaveLength(0);
      expect(new Set(fills).size).toBeGreaterThan(1);

      // Colour is never the only signal — the legend says each band in words.
      const legend = await page.locator("#legend").innerText();
      for (const word of BAND_WORDS) expect(legend).toContain(word);

      /* ── clicking a state, like a person ── */
      await page.locator('#usmap path[data-state="AZ"]').click();
      await expect(page.locator("#st-name")).toHaveText("Arizona");
      await expect(page.locator("#st-score")).toHaveText(/^\d+(\.\d+)?$/);
      await expect(page.locator("#home_state")).toHaveValue("AZ");

      /* ── the form ── */
      await page.selectOption("#has_business", "yes");
      await page.selectOption("#business_state", "FL");
      await page.selectOption("#score_band", "650-699");
      await page.fill("#name", `Climate Walk ${label}`);
      await page.fill("#email", `climate+fhtest-${label}@fundhub.ai`);
      await page.fill("#phone", "6616054248");
      await page.click("#go");

      /* ── the answer ── */
      await expect(page.locator("#answer")).toHaveClass(/\bon\b/, { timeout: 60_000 });
      const count = Number((await page.locator("#count").innerText()).replace(/,/g, ""));
      expect(Number.isFinite(count) && count > 0, `count was "${count}"`).toBe(true);

      // Both states asked for get their own lane.
      const lanes = await page.locator("#lanes").innerText();
      expect(lanes).toMatch(/AZ/);
      expect(lanes).toMatch(/FL/);

      // Four or five real bank names, free. Brief §2, Model A.
      const banks = page.locator("#banks li");
      const shown = await banks.count();
      expect(shown).toBeGreaterThanOrEqual(4);
      expect(shown).toBeLessThanOrEqual(5);
      for (let i = 0; i < shown; i++) {
        expect((await banks.nth(i).innerText()).trim().length).toBeGreaterThan(1);
      }

      /* ── what may never be on this page ── */
      const body = await page.locator("body").innerText();
      for (const re of [
        /\d{1,3}\s?%\s?(approval|approved)/i,
        /approval\s+(odds|chance)/i,
        /pre-?approved/i,
        /guaranteed\s+funding/i,
        /no\s+denials/i,
        /we'?ll\s+get\s+you\s+funded/i,
        /your\s+score\s+will\s+go\s+up/i,
        /up\s+to\s+\$[\d,]+/i
      ]) {
        expect(body, `banned claim matched ${re}`).not.toMatch(re);
      }
      // $32 is the only price a visitor sees.
      const prices = [...body.matchAll(/\$[\d,]+/g)].map((m) => m[0]).filter((p) => p !== "$32");
      expect(prices, `unexpected prices: ${prices.join(", ")}`).toHaveLength(0);
      await expect(page.locator("#locked")).toContainText("$32");
      await expect(page.locator("#locked")).toContainText("Business Financial Assessment");

      /* ── the $32 button has a real checkout behind it. Minted, never paid. ── */
      const minted = await page.evaluate(async () => {
        const r = await fetch("/api/public/optimize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            first_name: "Climate", last_name: "Walk",
            email: "climate+fhtest-unlock@fundhub.ai", phone: "6616054248"
          })
        });
        return r.json();
      });
      expect(minted.ok).toBe(true);
      expect(String(minted.checkoutUrl || "")).toMatch(/^https:\/\//);

      expect(consoleErrors, consoleErrors.join(" | ")).toHaveLength(0);
    });
  });
}

test("lending climate: /lender-climate still lands on the page", async ({ page }) => {
  const resp = await page.goto("/lender-climate", { waitUntil: "domcontentloaded" });
  expect(resp.status()).toBe(200);
  expect(page.url()).toMatch(/\/climate\/$/);
});

test("lending climate: the match endpoint answers a GET, so the pulse can watch it", async ({ request }) => {
  const r = await request.get("/api/public/climate-match");
  expect(r.status()).toBe(200);
  const d = await r.json();
  expect(d.ok).toBe(true);
  expect(d.book_size).toBeGreaterThan(0);
});
