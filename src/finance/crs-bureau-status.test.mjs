// Per-bureau pull result and the request fields the $297 form added.
// src/finance/crs-map.mjs classifyBureauReport + mergeBureauReports.bureauStatus
// src/finance/crs-client.mjs suffixForBureau / bureauText / residencyTypeFor and
// the frozen / no-file answers that used to be stored as a success.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CRS_PRIOR_RESIDENCY_TYPE,
  bureauText,
  createCrsClient,
  residencyTypeFor,
  suffixForBureau
} from "./crs-client.mjs";
import {
  BUREAU_FILE_STATUS,
  classifyBureauReport,
  mergeBureauReports
} from "./crs-map.mjs";
import { CRS_SANDBOX_HOST, SANDBOX_TEST_IDENTITIES } from "./crs-identities.mjs";

const LIVE_ENV = Object.freeze({
  CRS_API_USERNAME: "unit-user-not-real",
  CRS_API_PASSWORD: "unit-password-not-real",
  CRS_API_HOST: CRS_SANDBOX_HOST,
  ADAPTERS_DRY_RUN: "0"
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { forEach() {} }
  };
}

function withStatus(value) {
  return {
    creditFiles: [{ creditFileDetail: { creditFileResultStatusType: value } }],
    scores: [],
    tradelines: []
  };
}

test("classify: FileReturned is a file; a freeze is frozen; NoFile… is no_file", () => {
  assert.equal(classifyBureauReport(withStatus("FileReturned")), BUREAU_FILE_STATUS.FILE_RETURNED);
  assert.equal(classifyBureauReport(withStatus("NoFileReturnedCreditFreeze")), BUREAU_FILE_STATUS.FROZEN);
  assert.equal(classifyBureauReport(withStatus("NoFileReturned")), BUREAU_FILE_STATUS.NO_FILE);
  assert.equal(classifyBureauReport(null), BUREAU_FILE_STATUS.ERROR);
  // No status at all: the old payload shape, still a file (nothing documents it as a miss).
  assert.equal(classifyBureauReport({ creditFiles: [], scores: [] }), BUREAU_FILE_STATUS.FILE_RETURNED);
});

test("merge: bureauStatus is one word per bureau asked, none for a bureau not asked", () => {
  const merged = mergeBureauReports({
    reports: { EX: withStatus("FileReturned") },
    errors: { EQ: "EQ: the file is frozen at this bureau" },
    statuses: { EQ: "frozen" }
  });
  assert.deepEqual(merged.bureauStatus, { EX: "file_returned", EQ: "frozen" });
  assert.deepEqual(merged.bureausPulled, ["EX"]);
});

test("suffix: Equifax takes 2 characters, so III goes blank there only", () => {
  assert.equal(suffixForBureau("JR", "EQ"), "JR");
  assert.equal(suffixForBureau("II", "EQ"), "II");
  assert.equal(suffixForBureau("IV", "EQ"), "IV");
  assert.equal(suffixForBureau("III", "EQ"), "");
  assert.equal(suffixForBureau("III", "EX"), "III");
  assert.equal(suffixForBureau("IV", "TU"), "IV");
  assert.equal(suffixForBureau("Jr.", "TU"), "JR");
  assert.equal(suffixForBureau("", "EQ"), "");
});

test("bureau text: capitals, no accents, single spaces", () => {
  assert.equal(bureauText("  José   de la  Cruz "), "JOSE DE LA CRUZ");
  assert.equal(bureauText(null), "");
});

test("a previous address is kept on file but not sent until CRS names its label", () => {
  assert.equal(CRS_PRIOR_RESIDENCY_TYPE, null);
  assert.equal(residencyTypeFor({ residency: "current" }), "Current");
  assert.equal(residencyTypeFor({ residency: "previous" }), null);
});

test("a frozen file is NOT a success: ok false, fileStatus frozen, report kept", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/users/login")) {
      return response(200, { token: "t", refreshToken: "r", expires: 3600 });
    }
    return response(200, withStatus("NoFileReturnedCreditFreeze"));
  };
  const client = createCrsClient({ env: LIVE_ENV, fetchImpl, now: () => 0 });
  const out = await client.orderPrequal({ bureau: "EQ", identity: SANDBOX_TEST_IDENTITIES.EQ });
  assert.equal(out.ok, false);
  assert.equal(out.fileStatus, "frozen");
  assert.ok(out.report, "the body is kept so a human can read why");
  assert.match(out.error, /frozen/);
});
