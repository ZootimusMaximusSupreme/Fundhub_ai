// The two screens for an authorized representative.
// Staff add the person on the client file. He switches files in the portal.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = fs.readFileSync(path.resolve(HERE, "../../public/app/client-control-panel.html"), "utf8");
const PORTAL = fs.readFileSync(path.resolve(HERE, "../../public/app/client-portal.html"), "utf8");

test("the client file has a place to add the person, and it is hidden until the role is known", () => {
  assert.match(PANEL, /id="ccp-rep-wrap" hidden>/);
  assert.match(PANEL, /Add this person to the file/);
  assert.match(PANEL, /Take them off this file/);
  assert.match(PANEL, /FHData\.write\("\/api\/auth\/authorized-rep", \{/);
  assert.match(PANEL, /viewerRole !== "owner" && viewerRole !== "admin"/);
});

test("the portal lists his files and posts the one he picks", () => {
  assert.match(PORTAL, /id="rep-files"/);
  assert.match(PORTAL, /\/api\/auth\/authorized-rep-file/);
  assert.match(PORTAL, /authorized_rep !== true/);
  assert.match(PORTAL, /client_id: f\.client_id/);
});
