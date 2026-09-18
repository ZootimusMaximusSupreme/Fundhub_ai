// public/progress.html — the page must ask the server before it sends anyone
// to sign in.
//
// Live walk 2026-09-17, hole 4: staff signed in with the fundhub_session cookie
// opened /progress.html?id=<client> and were sent straight to the "Email me a
// sign-in link" page. boot() checked for a token in localStorage first, and the
// cookie is httpOnly, so page code can never see it. The server would have said
// yes: api/read/client-progress.mjs accepts the cookie through requirePrincipal.
//
// So the only sign-in gate on this page is the server's own 401. A stranger with
// no cookie and no token still gets 401 and is still sent to sign in.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, "../../public/progress.html");
const html = fs.readFileSync(PAGE, "utf8");

/** The source of one top-level `function <name>() { … }` in the page script. */
function fnBody(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `progress.html must define function ${name}()`);
  const open = html.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(open + 1, i);
    }
  }
  assert.fail(`function ${name}() is never closed`);
}

test("boot() asks the server before it sends anyone to sign in", () => {
  const boot = fnBody("boot");
  const call = boot.indexOf("api(progressPath())");
  assert.ok(call !== -1, "boot() must read the progress endpoint");
  const before = boot.slice(0, call);
  assert.doesNotMatch(
    before,
    /toLogin\s*\(/,
    "boot() must not send the visitor to sign in before the server has answered — " +
      "a staff cookie is httpOnly and cannot be seen from the page"
  );
  assert.doesNotMatch(
    before,
    /token\s*\(\s*\)/,
    "boot() must not decide who is signed in from localStorage alone"
  );
});

test("a 401 from the server still sends the visitor to sign in", () => {
  const boot = fnBody("boot");
  const call = boot.indexOf("api(progressPath())");
  assert.match(
    boot.slice(call),
    /r\.status\s*===\s*401\)\s*return toLogin\(\)/,
    "the server's 401 must stay the sign-in gate, so a stranger is still turned away"
  );
});

test("every read sends the session cookie", () => {
  assert.match(
    fnBody("api"),
    /credentials\s*=\s*"same-origin"/,
    "api() must send credentials so the fundhub_session cookie reaches the server"
  );
});

// Live walk 2026-09-18, hole 19: Sim Twelve-Academy owns only the Capital
// Academy course. The page told them "Your checklist has not been set up yet. It
// appears here as soon as your file is reviewed." Nothing builds a checklist on
// review. Only buying the Capital Blueprint (src/waypoints/purchase.mjs) or
// enrolling in a program (src/repair/enroll.mjs) does, so that promise was never
// going to be kept for a course buyer.
test("an empty checklist does not promise a list that nothing will build", () => {
  const body = fnBody("paintWaypoints");
  const empty = body.slice(0, body.indexOf("return;"));
  assert.match(empty, /class="empty"/, "the empty checklist must still say something");
  assert.doesNotMatch(
    empty,
    /as soon as your file is reviewed/i,
    "no code builds a checklist when a file is reviewed, so the page must not say it will"
  );
  assert.doesNotMatch(
    empty,
    /has not been set up yet/i,
    "a course buyer's checklist is not late — there is none to set up"
  );
});
