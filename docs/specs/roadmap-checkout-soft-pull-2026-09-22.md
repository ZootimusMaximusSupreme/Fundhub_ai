# $297 checkout: soft-pull success spec (2026-09-22)

Owner-set 2026-09-22: 1 business free, each extra business $15. Owner goal: the info collected results in a successful pull ~99-100% per bureau and for Experian Business.

Status: research + draft spec. Nothing built. Read the independent check at the bottom before building; it corrects several lines.


**Bureau:** a credit company. **Soft pull:** a credit check that does not hurt the score. **CRS:** the company that runs our pulls.

## 1. The answer in 3 lines

- **99% for every bureau is not possible from form data alone.** CRS says a bureau can find no file "even if all information is accurate." Our goal: no pull fails because of a typo, and every miss has a next step.
- **Today's real rate:** 4 real tries, all for 1 person. Experian 1 of 1. Equifax 0 of 1 (frozen). TransUnion 0 of 2. Experian Business has never run. 9 paid checkouts started 0 pulls.
- **Biggest cause: our setup, not buyer info.** TransUnion fails every time with CRS error E1006, "Invalid Add-On Configuration." That is a problem with our CRS account.

## 2. Fields to collect

**Personal**

| Field | Why | Format we force | Check before Submit |
|---|---|---|---|
| Legal first name | Required | Letters, space, dash, apostrophe. Up to 20 (15 for Equifax). | No numbers |
| Middle name | Optional. CRS says it helps match. | Up to 15 | None |
| Suffix | Optional. Helps match. | Pick list: Jr, Sr, III to X | None |
| Legal last name | Required | Up to 32 (25 for Equifax) | Not blank |
| Date of birth | Helps match | Type MM/DD/YYYY. We send YYYY-MM-DD. | Real date, age 18+ |
| Social Security number | Required | 9 digits, shown ###-##-####, sent digits only | Section 3 rules |
| Street | Required | House number and street only. Up to 48. | Starts with a number. No P.O. box. |
| Apt or unit | Equifax has its own 5-letter box | Up to 5 | None |
| City | Required | Up to 28 (20 for Equifax) | Not blank |
| State | Required | Pick list, 2 letters | From the list |
| ZIP | Required | 5 digits. Extra 4 optional, no dash. | Fits the state |
| Moved in last 2 years? | CRS says past addresses help | Yes opens a previous address | Same checks |

The 2-year rule is ours, not a CRS rule. We send the previous address once CRS tells us the right label for it.

**Per business (1 free, $15 each extra)**

| Field | Why | Format | Check |
|---|---|---|---|
| Legal business name | Main search input | As filed with the state | 2+ letters |
| Street, city, state, ZIP | Search inputs | Same as home | Same checks |
| EIN (business tax number) | Search input | 9 digits, no dash | 9 digits |
| Business phone (new) | Search input we skip today | 10 digits | Optional |
| Month and year started | Roadmap only | MM/YYYY | Not in the future |

## 3. Checks before we pull

The server runs every check again. Both forms use the same checks.

- **Clean up:** capital letters, no accents (José becomes JOSE), no extra spaces.
- **Social Security number:** block 000, 666 or 900-999 at the start, 00 in the middle, and 0000 at the end. Buyer sees: "That number is not valid. Please check it."
- **Birth date:** block fake dates (like Feb 31) and anyone under 18. Buyer sees: "You must be 18 or older."
- **Address:** house number first. No P.O. box (TransUnion flags addresses that are not homes). ZIP must fit the state. Buyer sees: "Use the address where you live."
- **Name vs card:** if the last name on the card is different, show a gentle note: "Use your legal name, the one on your Social Security card." Do not block.
- **Review screen:** show everything back (only the last 4 Social Security digits) with Edit buttons.
- **Errors point at the field.** Today one message covers every error.

## 4. When a pull still fails

Each bureau gets its own result: **File returned, Frozen, No file,** or **Error.** A pull counts as done only when a file came back. The pull runs in the background, so the buyer's page does not wait on it.

| What happened | Our system does | Buyer sees |
|---|---|---|
| Timeout or CRS server error | Try 3 times, waiting longer each time | Nothing |
| Login refused | Log in again once, then alert staff | "Your report is on the way." |
| Setup error (E1006, CRS113) | Alert staff. Run that bureau again when fixed. | Same |
| Bad birth date (E4000) | Stop that bureau | "Please check your birth date." |
| Frozen | "I lifted it" button emails CRS support, then pulls again | "Your Equifax file is frozen. Call 1-800-685-1111, then tap I lifted it." (Experian 1-888-397-3742, TransUnion 1-888-909-8872) |
| No file | Ask for middle name, suffix and previous address if blank. Pull once more. | Still none: "Equifax has no file on you." The roadmap uses the other bureaus. |
| Social Security number only partly matched | Flag for staff | "Please confirm your Social Security number." |

## 5. Experian Business

A **search** returns a list of matches. Each match has a **BIN** (Experian's ID number for a business). We **order the report** with that BIN.

- **Send every input.** The only old code sends just the name and state.
- **Picking:** use the match with the same street and ZIP. If none is clear, show the buyer up to 3: "Which one is yours?" plus "None of these."
- CRS does not explain Experian's match score, so we never pick on that score alone.
- **No match:** search again with name, state and ZIP. Then with the EIN only. Still none: "Experian has no business file yet." The roadmap shows that.
- **First:** confirm Experian Business is turned on for our CRS account. Nothing on record says it is.

## 6. Gaps in our code (back end first)

1. **Live pulls are off** (measured 2026-09-17). On the test server, every buyer gets a fake person's report. `src/finance/crs-identities.mjs:26-27, 187-201`
2. **TransUnion E1006 is not fixed.** `src/finance/crs-identities.mjs:32-41`
3. **Paid checkouts never start a pull.** The pull runs inside the Submit click and may get cut off. `src/slo/pull.mjs:167-176`
4. **Frozen and no-file results are saved as success.** `src/finance/crs-client.mjs:116-121, 347-358`
5. **A missing bureau is hidden from scoring.** `src/finance/crs-pull.mjs:626-628`
6. **No retry after a timeout or server error.** `src/finance/crs-client.mjs:84-86, 268-278`
7. **Middle name and suffix are always sent blank. No apt line, no previous address.** `src/finance/crs-pull.mjs:386-396`, `src/finance/crs-client.mjs:293-312`
8. **The staff form sends the name in our customer records, not the legal name the buyer typed.** `api/soft-pull-approve.mjs:449, 457-469`
9. **Weak checks on our server.** `api/public/slo-pull.mjs:46-78`, `api/soft-pull-approve.mjs:108-230`
10. **No business pull at all. Our safety list blocks the business report links.** `src/finance/crs-identities.mjs:30`, `src/messaging/providers/crs-softview.mjs:22-31`
11. **Price is $32 plus $10 per business, with no free business.** `src/finance/soft-pull-pricing.mjs:3-35`. The $297 checkout has no business count. `src/slo/offer.mjs:12,25`
12. **Email goes to all 3 bureaus.** Only TransUnion is shown to take it. `src/finance/crs-client.mjs:310`
13. **Front end last:** the /roadmap form has no middle name, suffix, apt, previous address or businesses. It also shows one error for everything. `public/roadmap/pull.html:134-187, 303-341`

CRS's full field rules are only in their sample-request file. That file is not in our repo.

## 7. Open questions for Chris

1. May an agent email CRS support to fix E1006, get that file, and turn on Experian Business?
2. Should we add a paid address-check service (a new vendor) to catch address typos before the pull?
3. When a file is frozen or missing: keep the full sale and build the roadmap from what came back, or refund part?
## Independent check: corrections to the draft

Spec check against research. Three claims re-opened live on 2026-09-22:
- **Confirmed:** the CRS "No Hit" article says a bureau can find no file "even if all information is accurate."
- **Confirmed:** Equifax's `suffix` field allows only 2 characters (Redocly Equifax tag).
- **Confirmed, and it changes a spec line:** the CRS unfreeze article says to email support and "we will update the file, so you can re-pull." The re-pull has to wait for CRS to update the file.

Issues:

1. **§2 Suffix pick list is wrong for Equifax.** "Jr, Sr, III to X" does not fit Equifax, whose suffix allows only 2 characters. III through X will not fit. Experian's `nameSuffix` also shows a 3-character limit, but its allowed list includes VII and VIII, which are 4 characters. It is not documented whether the Standard Format endpoint cuts these short or rejects them.

2. **§2 The length limits come from the wrong endpoints.** The limits (20/15, 32/25, 48, 28/20) come from the public "basic" endpoints. Fundhub calls the `standard/*-prequal-fico9` endpoints, and their limits are not documented anywhere public. The spec should call these assumed limits.

3. **§2 Street "Up to 48" is Experian and TransUnion only.** Equifax basic splits the address into houseNumber (10), streetName (26) and apartmentNumber (5). It is unknown whether Standard Format splits `addressLine1` for Equifax. The "5-letter box" is really 5 characters, and it exists only in the basic schema.

4. **§2 EIN "no dash" has no source.** The docs do not say whether `taxId` takes a dash. I re-checked the Experian tag page and it does not say.

5. **§3 The SSN block list (000, 666, 900-999, 00, 0000) has no source in the research.** Every CRS test person's SSN starts with 666 (666455730, 666125812, 666001613, 666321120, 666265040, 666154480). Blocking 666 with no sandbox exception breaks vendor test runs. CRS also has an account setting for all-zero SSNs, `allowAllZeroesSSN`.

6. **§3 The P.O. box rule is overstated.** The source is a TransUnion user guide, not CRS, and it is a third-party copy rated medium confidence. It flags commercial or institutional addresses. It does not name P.O. boxes.

7. **§3 The 18+ block is our rule, not a CRS rule.** CRS does not document what happens for anyone under 18. Label it "ours," the same way the spec labels the 2-year rule.

8. **§4 Frozen: "emails CRS support, then pulls again" skips a wait.** CRS must update the file first. A pull right away will likely come back frozen again. A CRS article says a file can still show frozen because of "account cache or specific account settings."

9. **§4 "No file" and "SSN partly matched" have no documented signal on the endpoint we call.** Only two status values are known: `FileReturned` (test files) and `NoFileReturnedCreditFreeze` (seen once in production). No no-hit value is documented. `ssnMatchIndicator` exists only in the TransUnion basic schema. The partial-SSN "code 2" comes from a general help article.

10. **§4 Login refused and setup errors.** CRS says a 403 can mean "API plan limits," so logging in again will not fix it. E1006 and CRS113 are not documented publicly. "Setup error" and §1's "a problem with our CRS account" are guesses from the error text ("Invalid Add-On Configuration. Contact Support"), not proven.

11. **§5 Business search fallbacks and report ordering have no source.** "Search again with name, state and ZIP, then EIN only" has no source. The minimum search inputs and EIN-only behavior are not documented. "Order the report": the only documented order path is `/ccc/exp/score` (Intelliscore+). The Premier Profile path and the vendored `/api/ccc/exp/report` are both undocumented. The spec should name `/ccc/exp/score`.

12. **§6 #3 gives a cause the data does not support.** C-00 creates the ledger row with key `diagnostic-paid:<event.id>` before it runs the pull (`src/workflows/c-00-crs-soft-pull-request.mjs:84-107`). A cutoff in the middle of a pull would leave a row stuck in "processing." Production shows 0 such rows. So C-00 stopped earlier or never ran. The code shows three early exits:
    - `no_client`
    - `no_account_for_attribution`
    - consent refused

    The outcomes research says it did not look into why. The timeout chain is reasoned, medium confidence, and was never measured.

13. **§6 #5 cites the wrong lines.** `src/finance/crs-pull.mjs:626-628` is the loop that runs each bureau. The line that sets the expected bureaus from the ones pulled is `src/finance/crs-tier.mjs:65-74`, with `src/finance/crs-map.mjs:149-155`.

14. **§6 #2 cites a switch, not the error.** `src/finance/crs-identities.mjs:32-41` is only the bureau on/off list (`activeBureausFromEnv`). E1006 appears nowhere in `src/`. "Not fixed" rests on the 2026-08-24/25 production rows and docs. Nothing newer was measured, including after TransUnion was turned back on 2026-08-24.

15. **§6 #1 "On the test server" is misleading.** It was measured on 2026-09-17 on the production site, which points at the CRS sandbox host with `CRS_ALLOW_LIVE=0`. The research rates it medium confidence, "if still true."

16. **§6 closing line is overstated.** It says CRS's full field rules exist only in their sample-request file. The public OpenAPI file does give field rules for the basic endpoints. Only the schema for the Standard Format prequal endpoints is limited to the Postman collection.