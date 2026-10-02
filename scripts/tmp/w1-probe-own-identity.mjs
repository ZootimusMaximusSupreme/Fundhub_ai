// DIAGNOSIS ONLY — scratch. Not used to write any sample file.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const R = "/Users/chrisstanbridge/Developer/fundhub-platform";
const req = createRequire(import.meta.url);
const { runCRSEngine } = req(`${R}/vendor/underwriteiq-full/api/lite/crs/engine.js`);
const sb = (n) => JSON.parse(readFileSync(`${R}/vendor/underwriteiq-full/api/lite/crs/sandbox/${n}.json`, "utf8"));
const rawResponses = [sb("tu"), sb("exp"), sb("efx")];
const base = { rawResponses, submittedName: "WILLIE BOOZE", submittedAddress: "1234 MAIN ST, SAN ANTONIO, TX, 78201",
  expectedBureaus: ["transunion","experian","equifax"], formData: { name: "WILLIE BOOZE", email: null, phone: null } };
function show(label, e) {
  console.log("\n==", label);
  console.log(" outcome", e.outcome, "| label:", e.decision_label);
  console.log(" identityGate", JSON.stringify(e.identityGate));
  console.log(" reason_codes", JSON.stringify(e.reason_codes));
  console.log(" preapprovals total/personal/business", e.preapprovals?.totalCombined, e.preapprovals?.totalPersonal, e.preapprovals?.totalBusiness, "suppressedByOutcome", e.preapprovals?.suppressedByOutcome, "personalCard", JSON.stringify(e.preapprovals?.personalCard), "personalLoan", JSON.stringify(e.preapprovals?.personalLoan));
  console.log(" projected total", e.projectedPreapproval?.totalCombined, "suppressed", e.projectedPreapproval?.suppressedByOutcome);
  console.log(" outcomeResult", JSON.stringify(e.outcomeResult)?.slice(0, 400));
}
show("AS THE APP RUNS IT TODAY (real clock), sandbox owner's own name + address", runCRSEngine(base));
show("DIAGNOSIS: same input, clock pinned to 2026-03-12 (one day after the pull)", runCRSEngine({ ...base, referenceDate: new Date("2026-03-12T00:00:00Z") }));
