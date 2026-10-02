import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proveLaunchAllowed,
  checkProxyLaunchLimits,
  ENV_PROVE,
  PROVE_HEADER
} from "./launch-limits.mjs";

test("proveLaunchAllowed passes UI launches without header", () => {
  assert.equal(proveLaunchAllowed({}, { proveRequested: false }).ok, true);
});

test("proveLaunchAllowed blocks scripted prove when env unset", () => {
  const out = proveLaunchAllowed({}, { proveRequested: true });
  assert.equal(out.ok, false);
  assert.equal(out.code, "proxy_prove_disabled");
});

test("proveLaunchAllowed allows scripted prove when PROXY_LAUNCH_PROVE=1", () => {
  assert.equal(
    proveLaunchAllowed({ [ENV_PROVE]: "1" }, { proveRequested: true }).ok,
    true
  );
});

test("checkProxyLaunchLimits enforces daily org cap", async () => {
  const db = {
    query(sql) {
      if (/date_trunc\('day'/.test(sql)) return { rows: [{ n: 80 }] };
      if (/ORDER BY started_at/.test(sql)) return { rows: [] };
      return { rows: [{ n: 0 }] };
    }
  };
  const out = await checkProxyLaunchLimits(db, {
    orgId: "00000000-0000-4000-8000-000000000001",
    staffId: "00000000-0000-4000-8000-000000000002",
    env: { PROXY_LAUNCH_DAILY_CAP: "80" }
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "proxy_daily_cap");
});

test("PROVE_HEADER export matches api gate", () => {
  assert.equal(PROVE_HEADER, "x-fundhub-proxy-prove");
});
