# Business Duplication Map — how the document is made

Generated from the code on 2026-10-02. Not a spec. Every box names the file that does it.

The map is the free bonus of the $297 Funding Roadmap and the fifth hosted page of the funding
pack. The /roadmap sales page shows a sample of it; this is the real document. Its sections mirror
that sample. Its numbers come only from the client's file and the UnderwriteIQ engine.

## Where each fact comes from

```mermaid
flowchart TD
    PULL[Credit pull<br/>src/finance/crs-pull.mjs] -->|three bureaus| CRS[(crs_results.result)]
    PULL -->|one Experian Business report per saved company<br/>with a name and a 2-letter state;<br/>never on a simulated pull| BR[(crs_results.result.businessReports)]
    BIZ[(businesses rows<br/>name, age_months, entity_data)] --> READ[readBusinessOnFile → companies<br/>src/underwrite/letter-pack.mjs]

    CRS --> ENG[Tier engine on the stored pull<br/>src/finance/crs-tier.mjs]
    ENG --> CLIENT[CLIENT dict<br/>src/underwrite/black-report-client.mjs]
    ENG --> FOUR[The four analysis pages<br/>src/deliverables/index.mjs]
    BR --> SCORE[scoreCompanyReports: the same engine,<br/>once per stored report<br/>src/underwrite/letter-pack.mjs]

    ENG -->|decision_label, totalPersonal,<br/>personalCard.final| FACTS
    CLIENT -->|median score, cover, footer| FACTS
    READ -->|name, state, start date, NAICS| FACTS
    SCORE -->|businessSignals + preapprovals.business<br/>per company, or the error| FACTS
    AUDIT[company-audit.mjs<br/>name flags, NAICS list, set-up rules] --> FACTS
    AGE[business-funding.mjs<br/>businessAgeMultiplier 0.5 / 1 / 2] --> FACTS
    SEQ[funding-sequence.mjs<br/>the five-step order] --> FACTS

    FACTS[duplicationMapFacts<br/>src/deliverables/business-duplication-map.mjs] --> PAGE[renderBusinessDuplicationMapHtml<br/>same frame as the four]
    PAGE --> FILE[business_duplication_map.html<br/>type business_duplication_map]
    FOUR --> PACK[funding pack files]
    FILE --> PACK
    PACK --> SAVE[persistFundingLetterFiles<br/>src/underwrite/funding-letter-pdf.mjs]
    SAVE --> DOC[(documents row<br/>subtype business_duplication_map<br/>title Business Duplication Map, text/html)]
    DOC --> PORTAL[Client portal — What You Own<br/>every deliverable row on file<br/>public/app/client-portal.html ownRows]
```

## The states the document can be in

```mermaid
flowchart TD
    START([funding pack is built]) --> P{pack = funding?}
    P -->|no — repair| NF[no map<br/>duplicationMapSkip = not_funding]
    P -->|yes| S{stored pull with scores?}
    S -->|no| NS[no map, no four<br/>duplicationMapSkip = no_engine or no_scores]
    S -->|yes| F{the four pages built?}
    F -->|no| RE[no map<br/>duplicationMapSkip = render_empty or the error]
    F -->|yes| M{map builds?}
    M -->|throws| MS[four ship, no map<br/>duplicationMapSkip = the error]
    M -->|yes| OK[five pages ship<br/>duplicationMapSkip = null]

    OK --> C{companies on file?}
    C -->|none| C0[02 says no company yet;<br/>plan starts at company one]
    C -->|one or more| R{Experian Business report<br/>for that company?}
    R -->|none stored| RM[checks print NOT ON FILE;<br/>NAICS and name still checked]
    R -->|stored, engine could not read it| RU[checks print NOT READ]
    R -->|stored and scored| RS[score, blemishes, balances, NAICS, name<br/>each with its fix;<br/>the engine's business dollars for that company]
    RS -->|engine gave $0| RZ[the engine's own block reasons,<br/>in plain words]
```

## What each section prints

| Section | Prints | Source |
|---|---|---|
| 01 both files | decision, median score, personal funding, card funding, company count, reports count, business funding today; the five-step funding order | engine, CLIENT dict, `funding-sequence.mjs` |
| 02 your business today | per company: Experian Business score, blemishes (bankruptcy, judgment, tax lien, late payments over 30 days, UCC filings), business balances, NAICS code, business name — each with its fix — and the engine's business dollars | stored Experian Business report scored by the engine, `company-audit.mjs` |
| 03 by age | the three age bands in words; the card-funding anchor; when each saved company turns 24 months | `businessAgeMultiplier`, engine, saved or Experian start date |
| 04 quarterly plan | eight quarters from today: one new company a quarter, each new one's 12-month mark, each saved company's 12- and 24-month marks | owner rule in `company-audit.mjs` ("Open one new shell LLC each quarter") |
| 05 set up | NAICS low-risk list, one exact name, website, LinkedIn, the shell-LLC rule | `company-audit.mjs` standing rules (client-facing text only) |

## Not on the file today

* **NAICS code.** No write path saves one (`src/slo/businesses.mjs` saves state and start date,
  not NAICS). Until something does, every company's NAICS row prints "NOT ON FILE" with the
  low-risk list. Open question on `ops/workflows/2026-10-02-roadmap-sample-content.md`.
* **Experian Business on a simulated pull.** `crs-pull.mjs` buys business reports only on a real
  pull, so a simulated client's map prints "not on the file" for every Experian check.
