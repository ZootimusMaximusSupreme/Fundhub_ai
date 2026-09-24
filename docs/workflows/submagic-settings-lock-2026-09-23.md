# Submagic settings lock — 2026-09-23

Lock the Submagic API switches and B-roll cover **before** we spend API minutes.
This board is not ad scripts. Ad scripts are a separate job.

## Task list

| # | Workflow | Owns | Status |
|---|---|---|---|
| W1 | API truth | The real field names in Submagic's docs — eye tracking, silence, merge, templates, costs | done |
| W2 | Repo wiring | What our code already sends, what it does not, the dead-space code change, cost guard | claimed |
| W3 | B-roll coverage | AD 1–7 matrix, real Drive clips, the file naming rule | done |

No dependencies. All three run at once. W2 wrote the code change with the field
**name** taken from our own measured spec; W1 confirms the field's **value shape**.

## The shared brief — what we already know, measured

From `docs/specs/video-pipeline-unknowns-settled-2026-09-22.md`, measured with live
calls on 2026-09-22. Submagic checks the route before it checks the key, so a
`401` means "this path is real" and a `404` means "this path does not exist".

* Host is `https://api.submagic.co`. `api.submagic.com` does not exist.
* The key goes in an `x-api-key` header.
* Upload the film itself: `POST /v1/projects/upload`, multipart, up to 2 GB, up
  to 2 hours. **30 of these an hour.**
* Upload one of our own B-roll clips: `POST /v1/user-media/upload`, multipart,
  field `file`, answers `{ userMediaId }`. 500 an hour.
* Read the words and their times: `GET /v1/projects/{id}`. 100 an hour.
* Place the clips: `PUT /v1/projects/{id}`. 100 an hour.
* Make the finished film: `POST /v1/projects/{id}/export`. **50 an hour.**
* There is **no** list endpoint. You cannot ask Submagic "what projects do I
  have". That is why a crashed upload has to be looked at by a person.
* The optional switches Submagic's own upload page names:
  `items`, `templateName`, `webhookUrl`, `dictionary`, `magicZooms`,
  `magicBrolls`, `removeSilencePace`, `removeBadTakes`, `cleanAudio`,
  `hookTitle`, `music`, `disableCaptions`.
  **There is no eye-tracking or gaze field in that list.** W1 confirms against
  the live page.

Still unknown: the key itself has never been used. It is stored on Netlify with
`--secret`, so a laptop reads a mask, not the value. The first real call has to
come from a deployed function.


---

## W3 B-roll coverage

### 1. How the clip matcher really works

The file is `src/ad-videos/broll.mjs`. The rules, in plain words:

**The file name IS the tag list.** Nothing else tags a clip.

```js
// broll.mjs:53
const strip = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// broll.mjs:65-68
const base = String(name || "").replace(/\.[a-z0-9]+$/i, "");
return [...new Set(
  strip(base).split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w))
)];
```

* **Case does not matter.** Everything is forced to small letters first (`broll.mjs:53`).
* **Separators:** every character that is not a letter or a number becomes a split.
  Dashes, underscores, dots, spaces — all the same. `40k-business-card.jpg` becomes
  `40k`, `business`, `card`.
* **The file ending is thrown away** before splitting (`broll.mjs:65`).
* **Words shorter than 3 letters are dropped.** So `a`, `of`, `to` never tag anything.
* **Numbers on their own are dropped.** `broll-01.mp4` will not fire on the word "one".
  But `40k` survives, because it has a letter in it.

**There is NO stemming and NO part-word match.** The word has to be the same word:

```js
// broll.mjs:102
if (words[i + p]?.text !== parts[p]) { ok = false; break; }
```

That is a straight "is it the same" test. So a clip tagged `bank` does **not** fire when
Chris says "banks". A clip tagged `optimization` does **not** fire when he says
"optimized". This is the single biggest trap on this page.

**There is no score.** Nothing is ranked. It is first-come, first-served:

* The clips are tried **in the order they are handed in** (`broll.mjs:144`).
* For each clip, the matcher walks the spoken words from the front and takes the
  **earliest word at or after the cursor** that matches any of that clip's tags
  (`broll.mjs:94-107`).
* **Tie break:** the earliest spoken word always wins. If one spoken word matches two
  of that clip's tags, the tag listed first wins. That is the whole tie rule.

**Where the clip lands:**

```js
// broll.mjs:169-170
const startTime = hit.word.start;
const endTime = Math.min(startTime + wanted, lastEnd);
// broll.mjs:191
cursor = endTime + (Number(minGapSeconds) || 0);
```

* It starts **exactly on the word** Chris says.
* It runs **3 seconds** by default (`DEFAULT_CLIP_SECONDS`, `broll.mjs:39`), never more
  than 12 (`MAX_ITEM_SECONDS`, `broll.mjs:35`).
* **The first 3 seconds are protected.** Nothing covers the hook (`broll.mjs:42`).
* **4 seconds of clear air** after each clip before the next one may start (`broll.mjs:45`).
* **5 clips maximum** per video (`broll.mjs:48`).
* Because the cursor only moves forward, **the order you hand the clips in decides the
  order on screen.** A clip whose word is only said early gets skipped if an earlier clip
  already ate past that point.

### 2. The seven ads

All seven are real and all seven live in `docs/ads/fundhub-297/FundHub-LOCKED-ADS.md`
(locked 2026-09-19). The content map `docs/workflows/slo-ads-content-map-2026-09-23.md`
lists which ones are on tape, not what they say. Both were read.

| AD | Name | The beat that needs cover |
|---|---|---|
| AD 1 | Straight offer, full read | "a list of the banks that will approve you" — the proof that approvals are real |
| AD 2 | Straight offer, declined open | "You got declined and nobody told you why" — the decline, then the fix |
| AD 3 | Straight offer, what your file is worth | "two hundred, three hundred, four hundred thousand dollars in funding" — big numbers |
| AD 4 | Straight offer, the roadmap without the call | "I'll give you the roadmap without the call" — the roadmap document itself |
| AD 5 | Straight offer, max fundability | "what you qualify for at the top end" — the two amounts, now and after |
| AD 6 | Haynes, you already know | "that gap is a couple hundred thousand dollars in extra capital" — the gap |
| AD 7 | Haynes, the call that was never a roadmap | "hundreds of thousands in personal funding plus hundreds of thousands in business" |

### 3. What is actually in Drive today

Read live from Google Drive on 2026-09-23. SLO Ads folder is
`13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ`, the `broll` folder inside it is
`1GclLLeMNOVjVSQOJUVBgQYp7WAd3pF11`.

**Two things are wrong with the folders before we even look at the files.**

1. `broll/deliverables` **does not exist.** The `deliverables` folder is real, but it sits
   one level up, directly under **SLO Ads**, not under **broll**
   (`1Dbwyvdb5a3mTu1rzZWLv2otM9cMl0tQ7`). Our own code expects all three side by side —
   `BROLL_FOLDERS` at `broll.mjs:30` and `FOLDERS` at `scripts/slo-broll-upload.mjs:14`.
2. **There is not one single video clip in there.** Every file is a picture or a PDF.
   No .mp4, no .mov. B-roll on a video ad is normally moving footage. Right now the whole
   library is still pictures.

**broll/approvals — 62 files, all pictures.**
22 older `.jpg` screenshots: `23k-chase-freedom-unlimited.jpg`, `24k-navy-federal.jpg`,
`25k-keypoint.jpg`, `25k-personal-card.jpg`, `30k-navy-federal.jpg`,
`30k-navy-federal-email.jpg`, `39k-personal-loan.jpg`, `40k-business-card.jpg`,
`40k-business-card-gm.jpg`, `41k-chase-ink.jpg`, `41k-chase-ink-business-unlimited.jpg`,
`50k-line-of-credit.jpg`, `54k-ink-business.jpg`, `70k-line-of-credit.jpg`,
`70k-line-of-credit-letter.jpg`, `70k-line-of-credit-rate-notice.jpg`,
`250k-line-of-credit.jpg`, `400k-line-of-credit.jpg`, `469k-line-of-credit.jpg`,
`469k-line-of-credit-account.jpg`, `500k-line-of-credit.jpg`,
`500k-line-of-credit-account.jpg`.
40 newer `.png` win cards uploaded today, all starting `win-`: `win-10000-lender.png`,
`win-10000-lender-2.png`, `win-10000-u-s-bank.png`, `win-12000-bank-of-america.png`,
`win-12000-bank-of-america-2.png`, `win-14000-chase.png`, `win-15000-fnbo.png`,
`win-15000-lender.png`, `win-16000-bankunited.png`, `win-16000-bankunited-2.png`,
`win-20000-truist.png`, `win-25000-enterprise-bank-trust.png`,
`win-25000-highland-bank.png`, `win-25000-lender.png`, `win-25000-umpqua-bank.png`,
`win-45000-chase.png`, `win-45000-fnbo.png`, `win-5000-nihfcu.png`,
`win-5000-u-s-bank.png`, `win-50000-chase.png`, `win-50000-keybank.png`,
`win-7000-citizens.png`, `win-70000-lender.png`, `win-74000-chase.png`,
`win-7500-pnc.png`, `win-9000-southstate.png`, plus 14 `win-noamount-…` cards
(`win-noamount-american-express-p05-2.png`, `-p23-1`, `-p27-1`,
`win-noamount-american-express-and-b-p05-3.png`, `win-noamount-chase-p02-1.png`,
`win-noamount-chase-p32-1.png`, `win-noamount-enterprise-bank-trust-p08-2.png`,
`win-noamount-first-citizens-bank-p04-1.png`, `win-noamount-ibc-bank-p10-1.png`,
`win-noamount-keybank-p37-1.png`, `win-noamount-lender-p27-2.png`,
`win-noamount-southstate-bank-p08-3.png`, `win-noamount-u-s-bank-p08-1.png`,
`win-noamount-u-s-bank-p24-1.png`).

**broll/portal — 9 pictures.**
`advisor.png`, `portal.png`, `refer.png`, `send-a-file.png`, `sign.png`, `status.png`,
`unlock-more.png`, `welcome.png`, `what-you-own.png`.

**deliverables (sitting under SLO Ads, not under broll) — 14 files, 7 pairs.**
`bank-lender-match-list.png` / `.pdf`, `credit-analysis-report.png` / `.pdf`,
`credit-optimization-roadmap.png` / `.pdf`, `funding-snapshot.png` / `.pdf`,
`letter-round-1-equifax.png` / `.pdf`, `letter-round-1-experian.png` / `.pdf`,
`letter-round-2-experian.png` / `.pdf`.

**Three other folders sit inside broll that our code does not know about:**
`client-wins` (the 37 `sanitized-page-NN.png` report pages, `client-wins-all.html`,
`AMOUNTS.md`, `fundhub-generic-face.png`), `old-approvals` (38 `deck-page-NN.png` plus
another copy of the 37 sanitized pages and `view-test.png`), and two folders made today
that are **completely empty**: `video-testimonials` and `written-testimonials`.

### 4. The matrix

"Fires" means the exact word is said in that locked ad AND a real file carries that exact
word in its name. Nothing here is invented.

| AD | Line / theme | Word that must fire | Covered | Real file that covers it |
|---|---|---|---|---|
| AD 1 | "a list of the banks that will approve you" | `list` | **Y** | `bank-lender-match-list.png` |
| AD 1 | "holding the roadmap" | `roadmap` | **Y** | `credit-optimization-roadmap.png` |
| AD 1 | "Your credit pulled from all three bureaus" | `credit` | **Y** | `credit-analysis-report.png` |
| AD 1 | "how much funding you qualify for" | `funding` | **Y** | `funding-snapshot.png` |
| AD 1 | "the document you need to address it" | `document` | **N** | nothing. No file has the word `document` |
| AD 1 | "Where your score sits today" | `score` | **N** | nothing. No file has the word `score` |
| AD 1 | "soft inquiry, so your score doesn't move" | `inquiry` | **N** | nothing |
| AD 2 | "You got declined and nobody told you why" | `declined` | **N** | nothing |
| AD 2 | "the cards sitting too high" | `cards` | **N** | files say `card`, he says `cards`. No match |
| AD 2 | "a list of the banks" | `list` | **Y** | `bank-lender-match-list.png` |
| AD 2 | "Your credit pulled from all three bureaus" | `credit` | **Y** | `credit-analysis-report.png` |
| AD 2 | "already written with your accounts in it" | `accounts` | **N** | files say `account`, he says `accounts`. No match |
| AD 3 | "two, three, four hundred thousand dollars in funding" | `funding` | **Y** | `funding-snapshot.png` |
| AD 3 | "starts your new business" | `business` | **Y** | `41k-chase-ink-business-unlimited.jpg` (or `40k-business-card.jpg`, `54k-ink-business.jpg`) |
| AD 3 | "what your credit file is actually worth" | `credit` | **Y** | `credit-analysis-report.png` |
| AD 3 | "the list of banks that will approve you" | `list` | **Y** | `bank-lender-match-list.png` |
| AD 3 | "what you qualify for right now" | `qualify` | **N** | nothing |
| AD 4 | "I'll give you the roadmap without the call" | `roadmap` | **Y** | `credit-optimization-roadmap.png` |
| AD 4 | "pull your credit from all three bureaus" | `credit` | **Y** | `credit-analysis-report.png` |
| AD 4 | "the list of banks that will approve you" | `list` | **Y** | `bank-lender-match-list.png` |
| AD 4 | "you get on the call, you get pitched" | `call` | **N** | nothing |
| AD 4 | "the document you need… already written" | `document` | **N** | nothing |
| AD 5 | "the most funding your file can possibly get you" | `funding` | **Y** | `funding-snapshot.png` |
| AD 5 | "once your file is fully optimized" | `optimized` | **N** | file says `optimization`, he says `optimized`. No match |
| AD 5 | "I'll hand you the list of banks" | `list` | **Y** | `bank-lender-match-list.png` |
| AD 5 | "leaving money on the table" | `money` | **N** | nothing |
| AD 5 | "some files take six months, some take one" | `months` | **N** | nothing |
| AD 6 | "how much more that same file would carry" | `more` | **Y** (weak) | `unlock-more.png` — a portal screen, nothing to do with the line |
| AD 6 | "a couple hundred thousand dollars in extra capital" | `capital` | **N** | nothing |
| AD 6 | "One card sitting too high" | `card` | **Y** | `40k-business-card.jpg`, `25k-personal-card.jpg` |
| AD 6 | "Personal data that doesn't match across the three bureaus" | `personal` | **Y** | `39k-personal-loan.jpg`, `25k-personal-card.jpg` |
| AD 6 | "shotgunned to a list of banks" | `list` | **Y** | `bank-lender-match-list.png` |
| AD 6 | "10x your file" | `10x` | **N** | nothing |
| AD 7 | "hundreds of thousands in personal funding" | `personal` | **Y** | `39k-personal-loan.jpg` |
| AD 7 | "plus hundreds of thousands in business funding" | `business` | **Y** | `41k-chase-ink-business-unlimited.jpg` |
| AD 7 | "Remove your inquiries, show you the roadmap" | `roadmap` | **Y** | `credit-optimization-roadmap.png` |
| AD 7 | "I'll pull your credit" | `credit` | **Y** | `credit-analysis-report.png` |
| AD 7 | "the whole thing turned into a pitch" | `pitch` | **N** | nothing |
| AD 7 | "Nobody calls you. Nobody pitches you." | `pitches` | **N** | nothing |

**Three things fall out of that table.**

1. **The word "approve" or "approval" is on no file at all.** We own 62 approval
   screenshots and not one of them will fire when Chris says "the banks that will approve
   you". The folder is called `approvals`, but the folder name is not part of the clip
   name, so the matcher never sees it. This is exactly the failure the top of
   `broll.mjs` warns about.
2. **Nothing fires on a dollar amount.** Every file leads with `41k`, `500k` or `45000`.
   Chris never says "forty one k" — he says "four hundred thousand dollars". Those tags
   are dead weight on every single ad.
3. **Two clips will fire on the wrong thing.** `what-you-own.png` carries the tags `what`,
   `you` and `own`. "You" is said within the first few seconds of every ad, so this clip
   will slap itself over the first line after the 3-second lead-in, every time.
   `send-a-file.png` carries `file` — Chris says "your file" meaning his credit file, but
   the picture is a portal upload button. Both are mis-fires waiting to happen.

### 5. The naming rule for new clips

**The rule in one line: name the clip with the exact words Chris says out loud in the ad.**

1. Use **small letters and dashes**. `approve-banks-list.mp4`. Dots, underscores and
   spaces work too, but pick dashes and stay with them.
2. Every word must be **3 letters or longer**. Shorter words are thrown away.
3. **Never lead with a number on its own.** `45000` is thrown away. `45k` survives but is
   useless, because nobody says "forty five k" out loud.
4. **Match the exact form he says.** "banks" not "bank". "optimized" not "optimization".
   "accounts" not "account". "cards" not "card". There is no stemming — close is a miss.
5. **Never use common filler words**: `you`, `what`, `the`, `and`, `now`, `more`, `file`.
   They fire in the first seconds and waste one of the five slots.
6. **Two or three real words is plenty.** Extra words only add more ways to mis-fire.
7. Put the **picture's own subject last** if you want it readable — it does not change the
   firing, only the tags do.

**Three examples, using clips that exist right now:**

| Real file today | Rename to | Why it fires |
|---|---|---|
| `approvals/41k-chase-ink-business-unlimited.jpg` | `approve-business-card-chase-ink-41k.jpg` | AD 1, 2, 3, 4 and 5 all say "banks that will **approve** you". AD 3, 6 and 7 all say "**business**". Today this file only fires on "business" by luck; renamed it also covers the approval line in all five straight-offer ads. |
| `deliverables/bank-lender-match-list.png` | `banks-approve-lender-match-list.png` | Chris always says "**banks**", plural. The file says `bank`, singular, so that half is dead. Adding `banks` and `approve` makes it fire on the real line in AD 1–6 instead of only on the word "list". |
| `deliverables/credit-optimization-roadmap.png` | `roadmap-optimized-credit-plan.png` | `optimization` never fires because he says "**optimized**". Swapping the word makes this clip cover both "the **roadmap**" (AD 1, 4, 7) and "once your file is **optimized**" (AD 1, 3, 4, 5, 6, 7). |

## W2 Repo wiring — done

### What our code sends today

| What Chris wants | Submagic field | Value we send | Wired? |
|---|---|---|---|
| No auto-edit before we read the words | `autoRender` | `false`, forced, a caller cannot turn it on | **Yes** |
| No AI stock B-roll | `magicBrolls` | `false`, forced | **Yes** |
| No mystery cuts | `removeBadTakes` | `false`, forced | **Yes** |
| Dead space trimmed | `removeSilencePace` | **new 2026-09-23** — off by default, a caller may pass it on one take | **Yes, off** |
| Spell Fundhub right | `dictionary` | `["Fundhub","fundhub.ai"]` plus extras | **Yes** |
| One caption look | `templateName` | passes through; now also reads `SUBMAGIC_TEMPLATE_NAME` | **Yes, unset** |
| Big words on the hook | `hookTitle` | passes through | **Yes, unset** |
| Cleaner voice | `cleanAudio` | passes through, only when `true` | **Yes, unset** |
| Tell us when it is done | `webhookUrl` | `SUBMAGIC_WEBHOOK_URL` | **Yes** |
| Our own clips as B-roll | `items[]` type `user-media` | `buildItems()` refuses any other type | **Yes** |
| Slow push-in on the face | `magicZooms` | not sent | **No — and leave it that way** |
| Music bed | `music` | not sent | **No** |
| Captions off | `disableCaptions` | not sent | **No** |

Eye tracking is not in that table because Submagic's upload page does not name
such a field. W1 confirms against the live page.

### Dead space — the call

**Approach A, gated on one measurement.** Turn the trim on for the pilot take
only, then check one number before it goes on anything else.

Why not the others. B is not real: the export call takes an id and nothing else,
so there is no export preset to hide a trim in. C means Chris edits, and Chris
films and approves — he does not edit.

The risk in A, in one sentence: our order is make the project, read the words and
their times, drop our clips on those times, then export — so if Submagic cuts the
silence at export instead of at create, every word time we read is from the long
version and every clip lands late.

**The measurement that settles it, free, on the pilot:** the project comes back
with a `durationSeconds`. Compare it to the length of the file we sent. Shorter
means the trim already happened and the times we read are the real ones — leave
it on. The same means the trim is waiting for export — turn it back off and the
answer becomes C after all.

### The code change, made

`src/messaging/providers/submagic.mjs`

* `createProject` and `createProjectFromFile` now take a `removeSilencePace`
  argument. It is sent **only** when a caller passes something that is not
  `false` or unset. The multipart route sends it as text, so `true` goes as
  `"true"` and a mode such as `"light"` goes as itself — either shape works,
  whichever one W1 finds on the live page.
* The file header no longer says the trim is banned forever. It says it is off
  by default and names the pilot measurement above.

`src/ad-videos/pipeline.mjs`

* `submagicCreate` now accepts and passes through `templateName`,
  `removeSilencePace`, `hookTitle` and `cleanAudio`. Before this, the provider
  supported all four and the pipeline sent none of them — so the caption look
  could never have been set on a real run.
* `templateName` falls back to `SUBMAGIC_TEMPLATE_NAME` from the environment,
  so one template covers every ad without a code change.

`src/messaging/providers/submagic.test.mjs`

* The old guard said a caller may never ask for the trim. That was an owner rule
  and Chris changed it. It is replaced by two guards of the same strength: the
  trim is not sent by default on either route, and a caller that asks for it
  gets it. Nothing was deleted or weakened to make a suite pass.

Checks: lint clean on 2628 files, `tsc --noEmit` clean, 97 of 97 tests pass.

### Merging clips — what the API can and cannot do

Submagic takes **one** film per project: `POST /v1/projects/upload` has a single
`file` field. There is no endpoint that joins two takes. `POST /v1/user-media/upload`
adds clips, but those are B-roll laid **on top of** the film, capped at 12 seconds
each — they are not a way to staple two takes end to end.

So: **anything that needs joining is joined before upload.** One finished MP4 goes
up, and Submagic's job is captions and our B-roll on top of it.

### Cost guard

* **30 project creates an hour.** That is the tight one at the front. One take,
  one create. A crashed create still costs one, which is why our code writes the
  claim before it calls and never spends a second one on the same take.
* **50 exports an hour**, and every re-edit costs another export. A take that
  gets its B-roll adjusted twice has cost two exports.
* **No AI B-roll, ever.** 3 credits a clip against 15 a month is five clips for
  a hundred ads.
* **Nothing is sent at all unless `ADAPTERS_DRY_RUN=0` is set on Netlify.**
  That is the default and it is deliberate: an edit that costs money should not
  start because a deploy forgot a variable.
* Submagic publishes **no list endpoint**. Nothing can ask "what did I already
  make", so a double-create is money that cannot be found again.

### Pilot plan — ONE file

Do **not** put all 14 Raw files in. The sweeper polls the Raw folder
(`DRIVE_RAW_FOLDER_ID` = `12L_RH8QycTZFeaXn4rHs9AIeGq7XokWU`) and takes whatever
is in it.

1. Raw holds exactly **one** take — the ad with the best B-roll cover on W3's
   matrix. Everything else stays where it is.
2. Set `SUBMAGIC_TEMPLATE_NAME` to W1's recommended template, and set
   `removeSilencePace` for this one run only.
3. Let it run: create, read the words, place our clips, export.
4. Read the pilot number — `durationSeconds` against the raw file's length — and
   write the answer on this board.
5. Only then does take two go in.

The first real call has to come from a deployed Netlify function, not a laptop:
the key is stored with `--secret`, so a laptop reads a mask and gets a 401 that
proves nothing.

