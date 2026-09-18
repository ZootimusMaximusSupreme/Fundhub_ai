# Claude Code — UnderwriteIQ pack look (HTML, not Python)

Owner: Chris. 2026-09-17. Paste the box below into Claude Code. One job.

Look target is the gold pack. Live Netlify cannot run Python, so these become web pages. Same facts. Same charts. Same pretty.

```
You are in /Users/chrisstanbridge/Developer/fundhub-platform on Claude Code.

Make the four UnderwriteIQ client documents as pretty as the gold pack, as normal web pages. Zero loss in function. This is look + completeness only.

WHY
Netlify cannot run Python / WeasyPrint. The live site falls back to short ugly PDFs. Do not bring Python back.

DO NOT USE
- Python
- WeasyPrint
- scripts/black-reports/fundhub_gen.py as a live printer
- render-service / BLACK_REPORT_RENDER_URL / FUNDHUB_RENDER_KEY
- Paged.js
- Puppeteer / Playwright-as-a-printer / any headless Chrome print
- A new npm package
- Fake numbers, fake testimonials, SIM MODE, earnings claims
- A new Commas product
- www.fundhubbookingurl.template (dead). Book link is https://apply.fundhub.ai/schedule/phonecall

DO NOT TOUCH
- Checkout, CRS pull, Commas titles, ClickFunnels, /watch, /apply
- src/underwrite/black-report-client.mjs (the data mapper is done)
- Dispute letters, personal-info letters, the fifth vendor summary PDF
- Tests: do not skip, delete, or weaken them. If a test pins wording or a dash, keep it.

PRETTY MEANS
Match the gold pack a buyer would hold up next to the screen and say "same thing."

Read, in this order:
1. docs/workflows/gold-deliverables-v5/compare/gold-credit_analysis_report.txt
2. docs/workflows/gold-deliverables-v5/compare/gold-funding_snapshot.txt
3. docs/workflows/gold-deliverables-v5/compare/gold-lender_match_list.txt
4. docs/workflows/gold-deliverables-v5/compare/gold-optimization_roadmap.txt
5. docs/workflows/gold-deliverables-v5/DIAGRAM_SPEC.md (eleven charts)
6. scripts/black-reports/fundhub_gen.py CSS + cover (look only, do not run it)
7. src/deliverables/* (facts and sections already live here)
8. docs/UI-STANDARDS.md for layout law. Brand spectrum already exists (the rainbow rule, Inter + JetBrains Mono, dark cover, confidential foot).

Cover, spaced eyebrows, rainbow rule, stat cards, tables, explainer charts, last-page book CTA. Paper / grid / real company. Not a thin blog post. Not the short pdf-lib fallback.

The gold last page lied: "You have clean bureaus ready for funding now" to every file. KEEP the honest CTA already in src/deliverables/chrome.mjs ctaPage() — clean bureaus if they have them, else lenders open today, else book the call. Do not put the lie back.

ZERO LOSS IN FUNCTION
These four documents, all sections, all tables, all eleven charts:

1. Financial Profile Assessment (credit_analysis)
   Cover. Opening. 01 Bureaus. 02 Scores. 03 Utilization. 04 AU accounts. 05 Negatives one-by-one. 06 Inquiries (cleanup only, zero funding impact). 07 Personal data. 08 Bottom line (today vs after). Honest CTA.

2. Capital Readiness Snapshot (funding_snapshot)
   Cover. 01 Numbers now vs after. 02 Breakdown (cards, installment, mortgage, child support / public, business). 03 Costing you money. 04 Not a factor. 05 After optimization lender table. 06 Next step. Honest CTA.

3. Capital Partner Shortlist (lender_match)
   Cover. 01 Available now. 02 After-optimization shortlist by type with why-this-fits. 03 Application order warning. 04 Strategy / order rules. 05 Numbers at a glance. Honest CTA.

4. 6-Month Business Readiness Roadmap (roadmap)
   Cover. Opening. 01 Projection. Months 1 through 6. Before/after table. Checklist. Call to action. Honest CTA.

Charts (DIAGRAM_SPEC.md). No model in the drawing path. Same inputs → same SVG. Explainers are the product; if you must cut for space, cut an analytic, never an explainer:
  score_lineup, utilization_tank, severity_scale, money_chain, journey_map, dispute_clock, application_order
  utilization_bars, waterfall, unlock_ladder, timeline

HONEST EMPTY
A missing limit, score, or dollar is a dash. Never invent 0. Never invent a lender match. Never say a bureau is clean unless the file says so.

WHERE TO WORK
src/deliverables/ — css.mjs, chrome.mjs, the four builders, existing SVG/chart helpers. Restyle. Do not drop a section the gold pack has. Do not rebuild the CLIENT dict.

Jordan Sample in the gold text is the LOOK reference only. Live pages read the CLIENT dict.

Book / QR: link to https://apply.fundhub.ai/schedule/phonecall. A real QR is optional; a clear link is enough. Do not add a qrcode package.

DONE WHEN
A person can open all four pages, sit them next to the four gold text extracts, and find every section, every table, and every chart. It looks like the gold pack, not the short PDF. npm test on src/deliverables/** still passes.

Do not wire the email / save path. Do not paste into ClickFunnels.
```
