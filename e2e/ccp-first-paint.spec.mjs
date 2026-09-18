// Playwright — the client control panel's first paint while a file is on its way.
//
// HOLE 5 (live look, 2026-09-17). Opening a client's control panel from a link
// with ?id= showed "Loading…" and "No client open — pick one below." for four
// to five seconds, while the picker in the same header already named the
// client. The no-client words are the EMPTY state. A file on its way is the
// LOADING state, which UI-STANDARDS §6.1 says is skeletons in the real layout.
//
// WHAT THESE PROVE, in a real browser:
//   1. with an id and a slow file read, the no-client words never show — not
//      even for one frame — and the name arrives from the picker list
//   2. once the file lands, the full record paints and no skeleton is left
//   3. with no id, the no-client words still show, exactly as before
//   4. with an id and a failed read, the skeleton goes and the screen's own
//      honest failure words show — a skeleton never outlives the read
//
// NO BACKEND — /api/** is answered by page.route() via harness.mjs. The file
// read is held on a gate the test opens, so "slow" is a fact, not a timing hope.

import { test, expect } from "@playwright/test";
import { openScreen, json, OWNER, CLIENT_ID, CLIENT_ROW } from "./harness.mjs";

const NO_CLIENT_WORDS = [
  "No client open",
  "Pick a client below.",
  "Open a client file to see what is blocking it."
];

/* "/api/dashboard/client?" and not "/api/dashboard/client": the harness matches
   by substring, and the bare path is also the start of /api/dashboard/clients —
   the picker's list, which must answer at once. */
const FILE_READ = "/api/dashboard/client?";

function gate() {
  let open;
  const shut = new Promise((resolve) => { open = resolve; });
  // Never hang the run if an assertion fails before the test opens it.
  const timer = setTimeout(() => open(), 15_000);
  return { shut, open: () => { clearTimeout(timer); open(); } };
}

/* Every frame, before it paints, note what the header and the blockers card
   say. innerText honours display:none, so this is what a person could read. */
async function recordFrames(page) {
  await page.addInitScript(() => {
    window.__ccpFrames = [];
    const tick = () => {
      const head = document.getElementById("ccp-record-head");
      const blk = document.getElementById("ccp-cp-blockers");
      if (head) {
        const text = head.innerText + " | " + (blk ? blk.innerText : "");
        const seen = window.__ccpFrames;
        if (seen[seen.length - 1] !== text) seen.push(text);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const frames = (page) => page.evaluate(() => window.__ccpFrames.slice());

test.describe("client control panel — a file on its way is loading, not empty", () => {

  test("while the file read is slow, the no-client words never show and the picker's name does", async ({ page }) => {
    const g = gate();
    await recordFrames(page);
    const errors = await openScreen(page, `/app/client-control-panel.html?id=${CLIENT_ID}`, OWNER, {
      "/api/dashboard/clients": { ok: true, clients: [CLIENT_ROW] },
      [FILE_READ]: async () => {
        await g.shut;
        return { ok: true, client: CLIENT_ROW, transactions: [], crs_results: [], messages: [], tasks: [] };
      }
    });

    // The file read is still held here. The name comes from the picker list.
    await expect(page.locator("#ccp-name")).toHaveText("Dana Whitfield", { timeout: 5_000 });
    // useInnerText: both sets of words are in the markup and CSS shows one, so
    // what counts is what a person can read, not the raw text of the node.
    await expect(page.locator("#ccp-key")).toHaveText("Opening this client’s file…", { useInnerText: true });
    await expect(page.locator("#ccp-next-action .skel")).toBeVisible();
    const held = await page.locator("body").innerText();
    for (const words of NO_CLIENT_WORDS) {
      expect(held, "the empty-state words showed while a file was on its way").not.toContain(words);
    }

    g.open();

    // The full record paints over everything the loading state put up.
    await expect(page.locator("#ccp-key")).toHaveText("dana@example.com", { timeout: 5_000 });
    await expect(page.locator("#ccp-name")).toHaveText("Dana Whitfield");
    await expect(page.locator(".skel")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/ccp-opening/);
    await expect(page.locator("#ccp-next-action")).not.toHaveText("Pick a client below.");
    await expect(page.locator("#ccp-cp-blockers")).toHaveText("Nothing is blocking this file.");

    // Not one frame, from the first to the last, said there was no client.
    const seen = await frames(page);
    expect(seen.length, "the frame recorder never saw the header").toBeGreaterThan(0);
    for (const text of seen) {
      for (const words of NO_CLIENT_WORDS) {
        expect(text, "a painted frame said there was no client:\n" + text).not.toContain(words);
      }
    }
    expect(errors, "page threw a JavaScript error:\n" + errors.join("\n")).toEqual([]);
  });

  test("with no client id, the no-client words still show", async ({ page }) => {
    const errors = await openScreen(page, "/app/client-control-panel.html", OWNER, {});
    await expect(page.locator("#ccp-name")).toHaveText("No client open", { timeout: 5_000 });
    await expect(page.locator("#ccp-key")).toHaveText("Pick a client to open their file.");
    await expect(page.locator("#ccp-next-action")).toHaveText("Pick a client below.", { useInnerText: true });
    await expect(page.locator("#ccp-cp-blockers"))
      .toHaveText("Open a client file to see what is blocking it.", { useInnerText: true });
    await expect(page.locator("html")).not.toHaveClass(/ccp-opening/);
    await expect(page.locator(".skel:visible")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  const failures = [
    {
      what: "no such client",
      answer: (route) => json(route, { ok: false, error: "client_not_found" }, 404),
      name: "No client with that id",
      key: "Pick a client from the list."
    },
    {
      what: "the read broke",
      answer: (route) => json(route, { ok: false, error: "boom" }, 500),
      name: "Could not load this file",
      key: "The read did not answer. Nothing below has been filled in."
    }
  ];

  for (const f of failures) {
    test(`with an id and a failed read (${f.what}), the skeleton goes and the honest words show`, async ({ page }) => {
      const g = gate();
      const errors = await openScreen(page, `/app/client-control-panel.html?id=${CLIENT_ID}`, OWNER, {
        "/api/dashboard/clients": { ok: true, clients: [CLIENT_ROW] },
        [FILE_READ]: async (route) => {
          await g.shut;
          await f.answer(route);
        }
      });

      // The picker got there first and named the client…
      await expect(page.locator("#ccp-name")).toHaveText("Dana Whitfield", { timeout: 5_000 });
      g.open();

      // …and the failure still wins, in its own words.
      await expect(page.locator("#ccp-name")).toHaveText(f.name, { timeout: 5_000 });
      await expect(page.locator("#ccp-key")).toHaveText(f.key);
      await expect(page.locator("html")).not.toHaveClass(/ccp-opening/);
      await expect(page.locator(".skel:visible")).toHaveCount(0);
      await expect(page.locator("#ccp-key")).not.toContainText("Opening this client");
      expect(errors).toEqual([]);
    });
  }
});
