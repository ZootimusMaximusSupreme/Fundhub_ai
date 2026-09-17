# Marketing walkthrough validate — 2026-09-17

**Who:** Validator (Grok). Re-clicked live. Did not trust the walker.
**Site:** fundhub.ai · apply.fundhub.ai
**Partner:** FundHub (house) `55272246-b97f-4c4b-a693-bce3f7e2dfd2`
**Client:** Sim Eight-Funding `d682c13b-11f3-4bd5-a0c5-232b6a7875c4`
**When:** 2026-09-17 ~12:52 PDT
**Login:** staff session for chris@fundhub.ai, role owner. Token not printed.

Did **not** press: Enqueue with kind=copy, Write page copy, Send anything due now, Queue post, Approve it on a held post, Connect Facebook/Instagram/LinkedIn/YouTube/ClickFunnels, Request access, Stop spending, Start spending again, Change daily budget, Save this link, Approve this brand, Write 3 posts for me.

Pressed only: Sync Meta now (read-only), the four ad-book group buttons, the Sim Eight-Funding card, Check the wording. Opened `/watch` in a fresh browser with no staff token.

| item | CONFIRMED or CONTRADICTED | what you saw |
|---|---|---|
| 1. Creative Factory house: Writes on. Script drop-down empty (— none —). Library has copy tiles. | CONFIRMED | URL `https://fundhub.ai/app/creative-factory.html?partner_id=55272246-b97f-4c4b-a693-bce3f7e2dfd2`. Chip: **WRITES ON**. Script drop-down options: only **— none —**. Library showed two copy tiles, not empty: “MKT-WALK-2026-09-17 simulated copy. Banks say no. We get you funded anyway.” `1x1 COPY` **APPROVED** `b185955f`, and the same words **BLOCKED** `59020a8b`. Did not enqueue a job. |
| 2. Campaigns house: Sync Meta sentence is no Meta connection. Spend today a dash. Live campaigns 0/0. Needs Attention four zeros. Campaigns table empty. | CONFIRMED | URL `https://fundhub.ai/app/campaign-manager.html?partner_id=55272246-b97f-4c4b-a693-bce3f7e2dfd2`. After **Sync Meta now**, grey sentence: **no Meta connection for this partner**. Spend today: **SPEND TODAY — no daily limit set for this partner** (dash, not a zero). **LIVE CAMPAIGNS 0 / 0 running right now, out of every campaign**. Needs Attention: **0** Daily limits already hit, **0** Changes that did not go through, **0** Connections that cannot go live, **0** Campaigns with an error on them. Campaigns table: **No campaigns yet. Press Sync Meta now to pull them in.** Pager: **showing 0–0 of 0**. |
| 3. Ad performance gate / entry / primary offer / secondary offer: walker said RETURN ROWS. Sheet said they fail. | CONFIRMED (walker). Sheet is wrong today. | All four buttons returned rows. None showed “This could not be read right now.” Gate: `none 5 5 100.00%` / `600 2 2 100.00%` / `720 1 1 100.00%` — foot **3 gate groups · 8 leads · 8 booked calls**. Entry: `sorting 5 5` / `direct 3 3` — **2 entry groups**. Primary offer: `funding dfy 7 6 85.71%` / `capital blueprint 1 2 200.00%` — **2 primary offer groups**. Secondary offer: `capital academy`, `capital blueprint`, `credit optimization`, `funding dfy`, `white label`, `none` — **6 secondary offer groups**. |
| 4. Pipeline Sim Eight-Funding How they got here: walker said Source fb, Campaign funding600, Ad 42-ringlights, Magnet VSL, AND Gate / Entry / Primary / Secondary SHOW. Sheet said those four stay hidden. | CONFIRMED (walker). Sheet is wrong today. | Card **Sim Eight-Funding** opened. Quoted lines from **HOW THEY GOT HERE**: Source **fb**. Campaign **funding600**. Ad **42-ringlights**. Landed on **/watch**. Magnet **VSL**. Gate **600+**. Entry **Direct · sell what they were promised**. Primary offer **Funding, done-for-you**. Secondary offers **None**. Those last four were on screen, not hidden. |
| 5. apply.fundhub.ai/watch in a fresh context: page loads. Is the sales-video counting script on the HTML or not? | CONFIRMED page loads. Counting script is **not** on the HTML. | Fresh browser, no staff token. HTTP 200. Title **VSL**. Headline on screen: **Get $50,000 to $1,000,000 in Funding in 14 Days or Less**. **TAP FOR SOUND** and **Get Started** present. Page HTML (~119k) has **no** `https://fundhub.ai/api/public/vsl-watch`, **no** `fhShouldSample`, **no** `fh_visitor_v1`, **no** `vsl-watch`. The only “beacon” on the page is New Relic (`bam.nr-data.net`), not our watch counter. |
| 6. Social Studio house: Writing on, 0 connected accounts, 0 waiting. Type a short line, Check the wording, read Copy check. | CONFIRMED | URL `https://fundhub.ai/app/social-studio.html?partner_id=55272246-b97f-4c4b-a693-bce3f7e2dfd2`. Notice: **Showing FundHub (house).** Chip: **WRITING ON · 250000 LEFT**. Connected accounts tile: **0 of 8**. Waiting: **0**. Typed “Validator check: a short line about funding.” Pressed **Check the wording**. Copy check: **SOMEONE MUST APPROVE IT** / **1 REASON**. What it said: “This post would be saved and stopped. It does not go out on its own. Somebody signed in as the owner or an admin has to approve it in the waiting list on this screen before it can go out. If they refuse it instead, it is kept and never sent.” Reason: `human-approval-required APPROVAL This partner is set so a person must approve posts before they go out.` Did **not** press Write 3. Did **not** press Queue post. |

## Score

Walker notes on these six rows: **6 CONFIRMED / 0 CONTRADICTED**.

Sheet vs live on two “known broken” rows: the sheet said gate/entry/primary/secondary would fail, and that Gate/Entry/Primary/Secondary would stay hidden on the pipeline card. Live showed the opposite on both.

No product code changed. Stop.
