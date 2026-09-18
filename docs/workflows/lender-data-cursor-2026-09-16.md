# Lender book — data cleanup

One page per change to the bank list the funding advisor reads. Newest at top.

---

## 2026-09-18 — Lane 3: junk rows, wrong product list, Elan split into eight

**Branch:** `fix/lane3-lender-cleanup`
**Script:** `scripts/lenders-cleanup-dedupe.mjs` (dry run by default, `--confirm` writes)
**Ran against:** the live database, once, in one transaction.

### What was wrong

Three things, all of them things an import can never fix by itself, because the
importer only adds and updates rows — it never removes one and never moves one
to a different product list.

1. **Two rows called "Verify Bank" that are not banks.** Left over from a test.
   No id from the original book, no website, no states. They read on the screen
   as two real banks nobody can apply to.

2. **Fourteen banks filed as online BUSINESS credit cards when the only link on
   the row goes to the bank's CONSUMER card application.** A funding advisor
   sends a client to what they think is a business card and the client lands on
   a personal one.

3. **Elan Financial showing as eight different lenders.** Elan is one card
   program. The original book wrote it up one US state at a time, so the import
   made eight rows out of it, each holding a different handful of states.

### What changed

| | Before | After |
|---|---|---|
| Banks in the book | 1,095 | 1,086 |
| Online business credit cards | 885 | 862 |
| Personal credit cards | 15 | 29 |

**1. Deleted both "Verify Bank" rows.** Matched on the exact name *and* on
having no id from the original book — a real bank always has one, so the rule
cannot catch a real bank. Neither row had a client application or a bureau
observation attached; the script checks that and refuses to delete if anything
is attached.

**2. Moved fourteen banks from `OnlineBizCC` to `PersonalCC`.** The rule is the
link: the row's application link has to be one of the five consumer shapes that
appear in the book (`consumer-platinum`, `consumer-credit`, `consumer/web-visa`,
`#consumer`, `consumer-products`). A business link never matches any of them.
None of the fourteen collided with a personal-card row of the same name.

> 22nd State Bank · Arrow Bank National Association · Bank OZK · CANANDAIGUA ·
> First State Bank of St. Charles, Missouri · FOOTHILLS · Germantown Trust &
> Savings Bank · Great Lakes Credit Union · International Bank of Commerce ·
> La Salle State Bank · The Bank of Herrin · The Canandaigua National Bank and
> Trust Company · Twin Cedars Bank · Union State Bank of Hazen

**3. Folded eight Elan rows into one, keeping every state.** The row that
survives is the one that already carried Elan's own website
(`LEGACY-ONLINEBIZCC-ELAN-FINANCIAL`). It now reads:

- name — `Elan Financial`
- product — `0% for 20 Months — No Business Checking Required`
- states — all **46** the eight rows covered between them: AL, AR, AZ, CA, CO,
  CT, DE, FL, GA, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT,
  NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, RI, SC, TN, UT, VA, VT, WA,
  WI, WV, WY
- tier 1 and the TransUnion bureau, both unchanged
- a line appended to its notes naming the seven rows it absorbed and the states
  each one held

The seven rows it replaced are gone. Before committing, the script re-reads the
surviving row and checks every one of the 46 states is still on it. If one had
gone missing the whole transaction would have rolled back.

The three Hawaii banks that issue an Elan card — Central Pacific Bank, Hawaii
National Bank, Territorial Savings Bank — are **separate banks** and were left
alone.

### Proof

Signed in to `https://fundhub.ai/app/lenders.html` and searched the desk.
Marked screenshots in `docs/workflows/lender-cleanup-2026-09-18-evidence/`.

| Search | Result |
|---|---|
| `Verify Bank` | 0 rows |
| `Elan` | 7 rows — one `Elan Financial` with all 46 states, plus six different banks whose names happen to contain those letters |
| `Twin Cedars` | 1 row, product list reads `PersonalCC` |

Running the script a second time reports nothing to do.

### Still open — not fixed here

- **The spreadsheets still hold the old shape.** `docs/legacy-strong/lenders-legacy-strong.csv`
  still has Elan as eight rows (lines 104–111), and the Carl merge file still
  marks the fourteen banks as business cards. **Re-running the importer would
  undo all of this**, because it matches on the id from the original book and
  puts back anything it finds there. Fixing the spreadsheets is a separate job.
- **`Cleveland State Bank` and `The Cleveland State Bank` are the same bank,
  twice** (WI, one from Carl with `#business`, one from Carl with a
  `mycommunitycc` link). Same pattern for `CANANDAIGUA` and `The Canandaigua
  National Bank and Trust Company`. Not named in this pass, so not touched.
- **Four states have no Elan row:** AK, HI, SD, TX. HI is covered by the three
  Hawaii banks above. The other three were never in the original book.
- **Five of the fourteen re-tagged rows carry a business bureau
  (`D&B/SBFE`)** on what is now a personal card row. That came in from the
  bureau pass, which keys on the bank's name, not the product. Not named in
  this pass.
