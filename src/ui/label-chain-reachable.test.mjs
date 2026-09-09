// src/ui/label-chain-reachable.test.mjs — CAN A PERSON REACH THE LABEL CHAIN
// FROM A SCREEN AT ALL.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE FAILURE THIS PINS, AND IT HAS ALREADY HAPPENED
//
// On 2026-09-08 three endpoints were written and routed — scripts/write,
// campaigns/link-asset, creative/generate's script_id — and NOTHING under
// public/ called any of them. Every one of them answered. Every test passed.
// The label spine still read empty forever, because a person sitting in front
// of the product had no control that sent any of those three requests.
//
// "The endpoint exists" and "a human can use it" are different facts and only
// the first one had a test. This file tests the second.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY IT READS HTML AS TEXT
//
// The two screens are single pages with their scripts inline. There is no
// module to import and no build step, so the file the browser loads is the only
// honest thing to read. src/ui/ad-spine-panel.test.mjs and
// src/http/crm-html.test.mjs:316-318 already do exactly this.
//
// npm test's glob is src/** and scripts/** only (CLAUDE.md §12), which is why
// this sits here and not beside the pages.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS CANNOT TEST, SAID PLAINLY RATHER THAN FAKED
//
// Nothing here runs a browser and nothing here touches a database. Whether the
// request is accepted, whether a row lands in ad_scripts, whether the labels
// come back on the ad — none of that is answered below, and no assertion here
// pretends to answer it. This proves the wiring is present and correctly
// shaped. It does not prove the chain has ever carried anything.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

const FACTORY = read("public", "app", "creative-factory.html");
const CAMPAIGNS = read("public", "app", "campaign-manager.html");
const ROUTES = read("netlify", "functions", "api.mjs");

/* Comments stripped. Every assertion about CODE runs against this, so a
   sentence written in a comment can never satisfy one. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ \t]*\/\/.*$/gm, " ");

const FACTORY_CODE = stripComments(FACTORY);
const CAMPAIGNS_CODE = stripComments(CAMPAIGNS);

describe("a handler file is not a route, and a route is not a screen", () => {
  /* The trap from CLAUDE.md §12, which has shipped twice: a handler absent from
     the hardcoded ROUTES map 404s locally and deployed. Asserted here as well
     as in src/http/routes.test.mjs because a screen wired to a 404 is worse
     than a screen wired to nothing — it looks like it works. */
  test("the three endpoints the chain needs are in the ROUTES map", () => {
    for (const key of ["scripts/write", "campaigns/link-asset", "creative/generate"]) {
      assert.ok(
        ROUTES.includes(`"${key}"`),
        `${key} is not a key in netlify/functions/api.mjs ROUTES — every screen calling it gets a 404`
      );
    }
  });

  test("a screen actually posts to each of the three", () => {
    assert.ok(
      FACTORY_CODE.includes("'/api/scripts/write'"),
      "nothing on creative-factory.html posts to /api/scripts/write, so no row can ever reach ad_scripts"
    );
    assert.ok(
      CAMPAIGNS_CODE.includes("'/api/campaigns/link-asset'"),
      "nothing on campaign-manager.html posts to /api/campaigns/link-asset, so no ad can ever be linked"
    );
    assert.ok(
      FACTORY_CODE.includes("'/api/creative/generate'"),
      "nothing on creative-factory.html posts to /api/creative/generate"
    );
  });
});

describe("link 1 — the script, with its labels", () => {
  test("the form carries the words and all five labels", () => {
    for (const id of ["swBody", "swType", "swAngle", "swHook", "swOffer", "swLane"]) {
      assert.ok(
        FACTORY.includes(`id="${id}"`),
        `creative-factory.html has no #${id} field, so that part of a script cannot be typed`
      );
    }
  });

  /* THE OWNER RULE, 2026-09-06: naming is never a blocker. A brand-new angle
     nobody has written down must save the first time it is typed. An <input
     list=…> accepts any value; a <select> does not. The four free-text labels
     must never become selects. */
  test("the four free-text labels are inputs with a datalist, never a select", () => {
    for (const [id, list] of [
      ["swType", "swTypeList"], ["swAngle", "swAngleList"],
      ["swHook", "swHookList"], ["swOffer", "swOfferList"]
    ]) {
      assert.ok(
        new RegExp(`<input id="${id}" list="${list}"`).test(FACTORY),
        `#${id} is no longer an input with a datalist — a label nobody has used before can no longer be typed`
      );
      assert.ok(
        new RegExp(`<datalist id="${list}"></datalist>`).test(FACTORY),
        `#${list} no longer starts empty — no vocabulary may be invented on this screen`
      );
    }
  });

  /* lane is the ONE validated field, and not as a naming rule: it is the ad_lane
     enum, so an unrecognised lane is a Postgres error nobody can read. The five
     values must stay equal to LANES in src/ads/registry.mjs. */
  test("the lane picker offers exactly the five lanes the code knows", () => {
    const lanes = read("src", "ads", "registry.mjs")
      .match(/export const LANES = Object\.freeze\(\[([^\]]*)\]\)/)[1]
      .match(/"([a-z0-9_]+)"/g)
      .map((s) => s.replace(/"/g, ""));
    assert.equal(lanes.length, 5, "LANES is no longer five values; the picker must be re-checked");
    const picker = FACTORY.slice(FACTORY.indexOf('<select id="swLane">'));
    for (const lane of lanes) {
      assert.ok(
        picker.includes(`<option value="${lane}">`),
        `the lane picker is missing ${lane}, which the database accepts`
      );
    }
  });

  /* A blank field must be LEFT OUT of the request. api/scripts/write.mjs
     normalises whatever it is handed, and an empty string is not a label. */
  test("a blank field is left out of the request rather than sent empty", () => {
    const block = FACTORY_CODE.slice(FACTORY_CODE.indexOf("var payload = { body: text };"));
    assert.ok(block.includes("if(title) payload.title = title;"), "the title is sent even when blank");
    assert.ok(block.includes("if(v) payload[pair[1]] = v;"), "a blank label is sent as an empty string");
    assert.ok(block.includes("if(lane) payload.lane = lane;"), "a blank lane is sent as an empty string");
  });
});

describe("link 2 — the script reaches the creative", () => {
  /* api/creative/generate.mjs:131 reads spec.scriptId, stores it on the job, and
     src/creative/generate.mjs:248 copies it onto creative_assets.script_id.
     Sent anywhere else in the body it is dropped and the creative carries no
     script, which makes every ad it lands on show NULL for every label. */
  test("the Generate form has a script picker and sends it inside the spec", () => {
    assert.ok(FACTORY.includes('<select id="genScript">'), "the Generate form has no script picker");
    assert.ok(
      FACTORY_CODE.includes("genSpec.scriptId = scriptId;"),
      "the picked script is not folded into the spec, so the creative is saved with no script on it"
    );
    assert.ok(
      FACTORY_CODE.includes("spec: genSpec"),
      "the spec sent to /api/creative/generate is not the object the script id was added to"
    );
  });

  /* "none" must send NOTHING. An empty string fails the uuid shape check at
     api/creative/generate.mjs:132 and refuses the whole job. */
  test("choosing no script sends no script id at all", () => {
    assert.ok(
      /if \(scriptId\) genSpec\.scriptId = scriptId;/.test(FACTORY_CODE),
      "an empty script id can reach the request, which refuses the whole generation job"
    );
  });

  test("the script picker is filled from what was saved, never typed by hand", () => {
    assert.ok(
      !/id="genScript"[^>]*>\s*<input/.test(FACTORY),
      "the script picker became a free-text box — nobody may be asked to type an internal id"
    );
    assert.ok(
      FACTORY_CODE.includes("sel.appendChild(o);") && FACTORY_CODE.includes("sel.value = s.id;"),
      "a saved script is no longer added to the Generate form's picker"
    );
  });
});

describe("link 3 — the creative reaches the ad", () => {
  test("every ad row carries its own internal id on a button", () => {
    assert.ok(
      CAMPAIGNS.includes("data-link-ad=\"'+esc(f.ad_id)+'\""),
      "the ad row no longer hands over its own id, so the endpoint cannot be told which ad this is"
    );
    assert.ok(
      CAMPAIGNS_CODE.includes("LINK.adId = b.getAttribute('data-link-ad');"),
      "the form no longer takes the ad id from the row that was clicked"
    );
  });

  /* THE RULE THE AUDIT FOUND BROKEN ELSEWHERE: ads.id is a long random string
     printed on no screen. If a text box for it ever appears, a person is being
     asked to find something they cannot find. */
  test("there is no box for a person to type an ad id into", () => {
    assert.ok(
      !/<input[^>]*id="link(Ad|AdId|AdRow)"/.test(CAMPAIGNS),
      "a field for typing the ad's internal id has appeared on the screen"
    );
  });

  /* KEY PRESENCE IS THE WHOLE TEST on this endpoint (link-asset.mjs:44-54). A
     key sent blank CLEARS the value, and clearing asset_id turns an ad's labels
     back off with no error anywhere — the exact silent-empty failure the
     endpoint's own header warns about. */
  test("an empty field is left out of the body, never sent blank", () => {
    const block = CAMPAIGNS_CODE.slice(CAMPAIGNS_CODE.indexOf("var body = { ad_id: LINK.adId };"));
    assert.ok(
      block.includes("if(assetId) body.asset_id = assetId;"),
      "asset_id can be sent blank, which silently unlinks the creative and turns the ad's labels off"
    );
    assert.ok(
      block.includes("if(number) body.fundhub_ad_number = number;"),
      "fundhub_ad_number can be sent blank, which silently clears our number for the ad"
    );
  });

  test("both fields empty is stopped before anything is sent", () => {
    assert.ok(
      CAMPAIGNS_CODE.includes("if(!assetId && !number){"),
      "a save with nothing filled in is sent to the server instead of being answered on the screen"
    );
  });
});

describe("every one of them answers back (UI-STANDARDS §5 and §6)", () => {
  /* Three answers, all three required: signed out, refused, and saved. A control
     that shows a spinner and nothing else is the failure being pinned here. */
  test("the script form says something on refusal and on success", () => {
    const block = FACTORY_CODE.slice(FACTORY_CODE.indexOf("document.getElementById('swSaveBtn')"));
    assert.ok(block.includes("'Nothing was saved. ' + swSay(res)"), "a refusal is silent on the script form");
    assert.ok(/msg\.textContent = 'Saved as version '/.test(block), "success is silent on the script form");
    assert.ok(block.includes("btn.disabled = false;"), "the button can be left disabled forever");
  });

  test("the script form turns being signed out into a sentence", () => {
    const say = FACTORY_CODE.slice(FACTORY_CODE.indexOf("function swSay(res)"));
    assert.ok(
      /case 'unauthorized':/.test(say.slice(0, 600)),
      "swSay no longer handles being signed out, so the raw word 'unauthorized' can reach a person"
    );
  });

  test("the link form says something on refusal and on success", () => {
    const block = CAMPAIGNS_CODE.slice(CAMPAIGNS_CODE.indexOf("document.getElementById('linkSaveBtn')"));
    assert.ok(block.includes("'Nothing was saved. ' + linkPlain(res)"), "a refusal is silent on the link form");
    assert.ok(block.includes("msg.textContent = 'Saved.'"), "success is silent on the link form");
    assert.ok(block.includes("btn.disabled = false;"), "the button can be left disabled forever");
  });

  test("the link form turns being signed out into a sentence", () => {
    const say = CAMPAIGNS_CODE.slice(CAMPAIGNS_CODE.indexOf("function linkPlain(res)"));
    assert.ok(
      /case 'unauthorized':/.test(say.slice(0, 600)),
      "linkPlain no longer handles being signed out, so the raw word 'unauthorized' can reach a person"
    );
  });

  /* NEVER INVENT A ROW OR A NUMBER. The labels shown after a link are the ones
     the endpoint read back out of v_ad_label_spine, not the ones this screen
     believes it just set. */
  test("the labels shown after a link are read back, not assumed", () => {
    const block = CAMPAIGNS_CODE.slice(CAMPAIGNS_CODE.indexOf("document.getElementById('linkSaveBtn')"));
    assert.ok(block.includes("var sp = res.spine;"), "the spine row the endpoint returned is no longer read");
    assert.ok(
      block.includes("The labels could not be read back just now."),
      "a missing spine row is no longer said out loud, so an unknown can read as 'no labels'"
    );
  });
});

describe("no page, tab or menu row was added", () => {
  /* A hard constraint on this work. The controls live on screens that already
     exist; a new file under public/app or a new nav row would break it. */
  test("both controls live on screens that already existed", () => {
    const pages = fs.readdirSync(path.join(ROOT, "public", "app")).filter((f) => f.endsWith(".html"));
    assert.ok(pages.includes("creative-factory.html"), "creative-factory.html is gone");
    assert.ok(pages.includes("campaign-manager.html"), "campaign-manager.html is gone");
    assert.ok(
      !pages.some((f) => /script-writer|ad-labels|label-spine/.test(f)),
      "a new page was added for this work; the rule was to add controls to pages that already exist"
    );
  });
});
