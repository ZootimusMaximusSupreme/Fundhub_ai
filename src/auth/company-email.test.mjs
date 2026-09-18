import { test } from "node:test";
import assert from "node:assert";
import { suggestCompanyEmail, staffRoleKey, COMPANY_EMAIL_DOMAIN } from "./company-email.mjs";

test("suggestCompanyEmail builds first.last@fundhub.ai", () => {
  assert.equal(suggestCompanyEmail("Sam Rivera"), `sam.rivera@${COMPANY_EMAIL_DOMAIN}`);
});

test("suggestCompanyEmail bumps the number when the login is taken", () => {
  assert.equal(
    suggestCompanyEmail("Sam Rivera", ["sam.rivera@fundhub.ai"]),
    "sam.rivera2@fundhub.ai"
  );
});

test("staffRoleKey folds labels the screen uses", () => {
  assert.equal(staffRoleKey("Funding Advisor"), "funding_advisor");
  assert.equal(staffRoleKey("closer"), "closer");
  assert.equal(staffRoleKey("wizard"), null);
});

// The catalog key is "csm" but the printed name is "Client Success Manager",
// and neither folds onto the other. Both have to resolve or POST
// /api/auth/invite answers unknown_role and the role cannot be staffed.
test("staffRoleKey resolves the Client Success Manager role both ways", () => {
  assert.equal(staffRoleKey("csm"), "csm");
  assert.equal(staffRoleKey("Client Success Manager"), "csm");
  assert.equal(staffRoleKey("client_success_manager"), "csm");
});
