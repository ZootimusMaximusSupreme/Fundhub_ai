# SLO video ↔ script check — 2026-09-21

Videos read from `/tmp/slo-videos` (already on disk). Audio extracted with macOS `afconvert` (16 kHz WAV). Speech-to-text with local **faster-whisper** `base.en` (CPU). **SFSpeechRecognizer was not used** (prior exit 134).

Drive folder (reference only, no re-upload): Fundhub + DirectRoas → Marketing Videos → SLO Ads (`13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ`).

## Quick summary

| Video file | Script matched (by filename intent → best fit from speech) | Spoken vs matched script |
|---|---|---|
| Fundhub Welcome Video.mp4 | `docs/ads/portal-welcome-video.md` → **`docs/ads/fundhub-297/FundHub-VSL-Scripts.md` (VSL 2 — Booking)** | **no** (wrong file for welcome; body is booking VSL) |
| SLO Ad 1 Take 1.mp4 | `FundHub-LOCKED-ADS.md` AD 1 → **`FundHub-VSL-Scripts.md` VSL 1 (mid)** | **no** |
| SLO Ad 1 Take 2.mp4 | AD 1 | **unheard** (2.5 s clip) |
| SLO Ad 3 Take 1.mp4 | AD 3 → **VSL 1 (tail / FAQ + close)** | **no** |
| SLO Ad 5 Take 1.mp4 | AD 5 → **VSL 1 (head + offer block)** | **no** |
| SLO Ad 6 Take 1.mp4 | AD 6 → **`FundHub-LOCKED-ADS.md` AD 7** | **no** (file labeled 6, speech is AD 7) |
| SLO Ad 7 Take 1.mp4 | AD 7 → **no script in repo** | **no** |
| SLO Funding Roadmap Call Take 1.mp4 | VSL 2 booking → **VSL 1 (FAQ block)** | **no** |
| SLO Funding Roadmap Take 3.mp4 | VSL 1 sales → **no script in repo** (checkout-abandon retarget) | **no script** |
| SLO Retargeting Take 3.mp4 | (no dedicated retarget doc) → **`FundHub-LOCKED-ADS.md` AD 1** | **yes** (straight offer; minor wording / ASR) |
| SLO VSL Take 1.mp4 | VSL 1 full → **`FundHub-LOCKED-ADS.md` AD 6 (Haynes, partial)** | **no** |

**Note:** Spoken **VSL 1 — Sales page** is split across several misnamed files (Ad 5 ≈ open, Ad 1 Take 1 ≈ middle, Funding Roadmap Call ≈ FAQ, Ad 3 ≈ close). None of those files is a full ~3:05 read of `FundHub-VSL-Scripts.md` VSL 1.

---

## Method

- Duration from `afinfo` on each `.mp4`.
- Transcripts are what the model heard; dollar amounts below appear **only** where the transcript contains them (no amounts inferred from visuals).

---

## Fundhub Welcome Video.mp4

- **Duration:** ~99 s  
- **Filename intent:** `docs/ads/portal-welcome-video.md`  
- **Best script fit from speech:** `docs/ads/fundhub-297/FundHub-VSL-Scripts.md` — **VSL 2 — Booking page**  
- **Match (filename script):** **no** — does not say portal welcome copy (“Hey — it's Chris. Welcome in…”).  
- **Match (VSL 2):** **mostly yes** — same beats as booking VSL; several stumbles and extra lines.

### Transcript (spoken)

Your roadmap is in your account, good move. Most people find out what their file, most people never find out what their file is actually worth. You just did, you have the exact steps to get there. Everything that packages built off your own credit in about 10 seconds. That's the smallest thing our system does. Behind it is 10 years of files, the processes we built running them, and a team that does this every day. You can run the roadmap yourself on your own timeline and it works. Or we run it with you, the parts that eat months, when you're doing them alone, waiting on a response, guessing which letter goes next, figuring out which bank to hit first, are the parts we built systems around. Same destination a lot less to your time. Here's what the call is. We go through your file with you. We make sure you're working the roadmap in the right order. We show you where the shortcuts are on your file specifically, and if it makes sense for us to take more of it off of your plate, we'll tell you what that looks like. If your file is already close, we'll tell you that too. Here's what I want you to understand. Run this structure, run this right, structure it right, and funding stops being something you chase once, and you'll be pulling hundreds of thousands of dollars again and again for as long as you're in business. You're giving the banks, you're giving banks the green light to shovel hundreds of thousands of dollars to you and your companies for the rest of your life. People mess this up on their own. Wrong order, wrong bank, wrong month, and it costs them a year. That's why I built a system with guardrails, so you, so you're not one of those people. Everything you bought is yours either way, the call just adds to it. Pick a time below, bring your roadmap, you made the right move, you're on the road to riches and I appreciate you trusting us to guide you to hundreds of thousands of dollars and funding as quickly as possible. Book the call and let's make this year your best.

### Lines wrong vs VSL 2 script

- Opens with a garbled double line (“find out what their file, most people never…”); script has a single clean open.
- “Everything that packages built” vs “Everything in that package was built”.
- “Same destination a lot less to your time” vs “Same destination, a lot less of your time”.
- Repeated / fumbled “Run this structure, run this right, structure it right”.
- **Not in script:** “you're on the road to riches”.
- “guide you to hundreds of thousands of dollars and funding” vs script “guide you to hundreds of thousands of dollars in funding”.

---

## SLO Ad 1 Take 1.mp4

- **Duration:** ~89 s  
- **Filename intent:** `docs/ads/fundhub-297/FundHub-LOCKED-ADS.md` — **AD 1**  
- **Best script fit from speech:** `docs/ads/fundhub-297/FundHub-VSL-Scripts.md` — **VSL 1** (from “machine learning” through deliverables; cuts before full FAQ)  
- **Match (AD 1):** **no** — AD 1 opens “For $297 I'll tell you how much funding you qualify for…”, not heard.  
- **Match (VSL 1 segment):** **partial yes** for the middle of VSL 1.

### Transcript (spoken)

The system runs on machine learning, so every file that goes through it teaches it something and that analysis it gives you today is better than the one it gave you a month ago. The condition of your credit determines where you land in the funding process. A file that's ready and a file that isn't are two completely different conversations at a bank and most of the time the difference is a couple small tweaks nobody told you about. I spent thousands of hours learning what those tweaks are. The industry sells that to you as a 5, 10, $20,000 course and you come out the other side more confused and no closer to the maximum amount of funding for yourself or for your business. So here's what 297 gets you. We pull your credit from all three bureaus with a soft inquiry so your score doesn't move. You get how much funding we think you'll qualify for right now even if your file's banged up you get how much funding you'll qualify for once your file's cleaned up and you get the exact steps to fix your file and the order to do them in which cards come down and to what balance which harmful items come off each one of them with the letter already written your accounts in it for all six rounds. What personal data needs cleaning up whether another entity like an LLC belongs in your plan the month by month calendar and the banks most likely to approve a file like yours where you live and in the order to apply. You fill out a form it takes about 10 seconds and all of it is in your account. Three questions I get why 297 when everybody else charges five figures because you're getting the finished file and with them you're just paying to dig for it yourself. Do you know? Do you...

### Lines wrong vs VSL 1 (this segment)

- Missing entire VSL open (“Your credit file could be worth… I'm Chris, I run FundHub”).
- “So here's what 297 gets you” vs script “So here's what two ninety seven gets you”.
- “each one of them with the letter already written your accounts in it for all six rounds” vs “each one with the letter already written, your accounts in it, all six rounds”.
- Adds “like an LLC” (script: “Whether another entity belongs in the plan”).
- Ends mid-FAQ (“Do you know? Do you…”) — script continues “Do you do the work for me?” etc.

---

## SLO Ad 1 Take 2.mp4

- **Duration:** ~2.5 s  
- **Filename intent:** AD 1  
- **Match:** **unheard** — only fragment captured: “Series score doesn't move.” (likely tail of “soft inquiry / score doesn't move”; not a usable AD 1 read).

### Transcript (spoken)

Series score doesn't move.

---

## SLO Ad 3 Take 1.mp4

- **Duration:** ~75 s  
- **Filename intent:** `FundHub-LOCKED-ADS.md` — **AD 3**  
- **Best script fit from speech:** `FundHub-VSL-Scripts.md` — **VSL 1** (FAQ + close)  
- **Match (AD 3):** **no** — AD 3 opens “You have no idea what your credit file is actually worth…”.  
- **Match (VSL 1 tail):** **partial yes**.

### Transcript (spoken)

Do you do the work for me? No, you mail your own letter so you hold every receipt and you see every response to day at lands. This is for you if you want the most funding your file can possibly get you. Clean credit or not, if you'd rather learn it all, if you'd rather learn it all the long way, plenty of people do, it takes about six months and five figures. I know there are a lot of people in this space who will tell you whatever you want to hear to get you on a call, we're not going to do that. There's no call here, you still do the work, you mail the letters and you follow the steps. What you skip is the 2,000 to 2,000 hours of losing brain cells trying to figure it out on your own. Nobody else in this industry sells this, it took 10 years of files to build and there's no shortcut to that. If you're not happy with what you get, email us and we'll refund you. Click below, pay the 297, fill up the form, 10 seconds later you're holding the roadmap that takes a file that only qualifies for $50,000 and turns it into a file worth $700,000. All of it aimed at your file, optimized for the maximum amount of funding. All aimed at your file, optimized for the maximum amount of funding.

### Lines wrong vs VSL 1 script

- “mail your own letter” vs “mail your own letters”.
- “every response to day at lands” vs “every response the day it lands”.
- Repeated “if you'd rather learn it all”.
- “2,000 to 2,000 hours” vs “the thousand to two thousand hours”.
- “fill up the form” vs “Fill out the form”.
- **$700,000** spoken vs script “several hundred thousand” (transcript shows $700,000 — not AD 3 script).
- Duplicated closing line twice.

---

## SLO Ad 5 Take 1.mp4

- **Duration:** ~97 s  
- **Filename intent:** `FundHub-LOCKED-ADS.md` — **AD 5**  
- **Best script fit from speech:** `FundHub-VSL-Scripts.md` — **VSL 1** (opening through deliverables; cuts mid-offer)  
- **Match (AD 5):** **no** — AD 5 opens “If you're going after the most funding your file can possibly get you…”.  
- **Match (VSL 1 head):** **partial yes**.

### Transcript (spoken)

Your credit file could be worth $100,000 in funding. It could be worth a million. For $297, I'll tell you how much yours is worth right now, how much it's worth once it's optimized, and exactly how to get there. I'm Chris, the founder of FundHub. I've been doing this for 10 years. I've seen hundreds of files, and there are tens of thousands of data points behind every roadmap we build. The system runs on machine learning, so every file that goes through it teaches it something, and the analysis it gives you today is better than the one it gave you a month ago. The condition of your credit determines where you land in the funding process. A file that's ready, and a file that is it, are two completely different conversations at a bank, and most of the time, the difference is a couple small tweaks nobody told you about. I spent thousands of hours learning what those tweaks are. The industry sells that to you as a five, 10, or $20,000 course, and you come out the other side, more confused and no closer to the maximum amount of funding for yourself or for your business. So here's what $297 gets you. We pull your credit from all three bureaus as a soft inquiry, so your score doesn't move. You get how much funding we think you qualify for right now, even if your file is banged up, you get how much funding you qualify for once your file is cleaned up, and you get the exact steps to fix your file and the order to do them in, which cards come down and into what balance, which harmful items come off, each one with a letter already written, your accounts in it, all six rounds. What personal data needs cleaning up, whether another entity belongs in the plan, the month-by-month calendar, and the bank's most likely to approve a file like yours, where do you live in order to apply? In the order to apply, you fill out a form.

### Lines wrong vs VSL 1 script

- “I'm Chris, the founder of FundHub” vs “I'm Chris, I run FundHub”.
- “a file that is it” vs “a file that isn't”.
- Garbled bank line: “where do you live in order to apply? In the order to apply” vs “where you live, in the order to apply”.
- Cuts before “it takes about ten seconds, and all of it is in your account” and before FAQ / close.

---

## SLO Ad 6 Take 1.mp4

- **Duration:** ~66 s  
- **Filename intent:** `FundHub-LOCKED-ADS.md` — **AD 6** (Haynes — “You already know your credit file…”)  
- **Best script fit from speech:** **`FundHub-LOCKED-ADS.md` — AD 7** (call / roadmap pitch)  
- **Match (AD 6):** **no**  
- **Match (AD 7):** **mostly yes**

### Transcript (spoken)

They told you to hop on a call and they'd walk you through your file, remove your inquiries, show you the road map, tell you what exactly to fix, you got on the call and the whole thing turned into a pitch. The road map was never the product and that was the whole reason you picked up the phone. And the road map is the most valuable thing in this, the exact steps and the exact order to get you from where you are to where you want to be. That's the difference between a little bit of funding and hundreds of thousands of dollars in personal funding, plus hundreds of thousands of dollars in business funding across multiple businesses. If you've backed up, that's potentially seven figures. Every company in this space gate keeps it for that exact reason. You deserve to have it. If somebody's going to sell you something, fine. Getting told the call as a road map, what it never was, is a different thing. So I took mine out of the call completely. Ten years of doing this, hundreds of files, I'll pull your credit, tell you what you qualify for right now, and what you qualify for once your file is optimized, name every single thing in the way, hand you the document for each one already written and give you the exact order to set it all up. Nobody calls you. Nobody pitches you. Click the link below so you can know the whole plan before you talk to anybody ever. We'll pull your credit with a soft inquiry so you're scored as a move.

### Lines wrong vs AD 7 script

- “tell you what exactly to fix” vs “tell you exactly what to fix”.
- “The road map was never the product and that was the whole reason” vs “The roadmap was never the product. It was the reason you picked up the phone.”
- “get you from where you are to where you want to be” vs “get from where your file is to where it could be”.
- “If you've backed up, that's potentially seven figures” vs “Stacked up, that's potentially seven figures”.
- “Getting told the call as a road map, what it never was” vs “Getting told the call is a roadmap when it never was”.
- Close ASR error: “so you're scored as a move” vs “so your score doesn't move”.
- CTA wording differs slightly (“Click the link below so you can know…” vs “Click below and grab it, so you know…”).

---

## SLO Ad 7 Take 1.mp4

- **Duration:** ~75 s  
- **Filename intent:** `FundHub-LOCKED-ADS.md` — **AD 7**  
- **Best script fit from speech:** **No matching script in repo** (personal + business “two sides” / stacking angle not in `FundHub-LOCKED-ADS.md` AD 7 or `FundHub-297-Final-Ten.md`)  
- **Match (AD 7 locked):** **no** — locked AD 7 is the “call turned into a pitch” script (that content is on **Ad 6 Take 1**, mislabeled).

### Transcript (spoken)

If you want to get the most funding your file could possibly get you, here's what all most everybody misses. Your file has two sides, personal and business, and most people stop after the first approval and don't continue. For $297, I'll pull your credit from all three bureaus and show you both sides. What you qualify for right now and what you qualify for once your file is fully optimized, personal and business together. Sequence right, the same file that gets you typically one approval can also get you 10. And that's the difference between walking away with $50,000 and walking with a few hundred thousand dollars across your personal side and your business. Most people leave the second half sitting there because nobody told them it existed. I'll name every single thing between you and maximum funding. Sometimes it's one item, sometimes it's 12. You get the documents for each one already written with your accounts on them, on them to expedite the optimization process. I'll give you the order to do it in month by month including when the business side comes in and what has to be optimized on the personal side first. And I'll hand you a list of banks handpicked for your file that will approve you once your file is already there. I've been doing this for 10 years and I've seen hundreds of files. I reverse engineered all of it so you can get the whole thing instead of just the first half. If you're not happy with it, we'll email us and we'll refund you. Click below, pay the $297, fill out the form, it takes about 10 seconds. All we're going to do is soft pull your credit. That's it. Cheers.

### Script status

- **No script path** — save this transcript to repo if this angle is kept.

### Notable spoken lines (no locked script to diff)

- “typically one approval can also get you 10”.
- “If you're not happy with it, we'll email us” (grammar error on tape).
- Close “Cheers.” not in standard locked ads.

---

## SLO Funding Roadmap Call Take 1.mp4

- **Duration:** ~35 s  
- **Filename intent:** `FundHub-VSL-Scripts.md` — **VSL 2 — Booking** (“call” page)  
- **Best script fit from speech:** **VSL 1 — FAQ block** (same words as middle of sales VSL, not booking VSL)  
- **Match (VSL 2):** **no**  
- **Match (VSL 1 FAQ segment):** **partial yes** (truncated)

### Transcript (spoken)

Three questions I get why 297 when everybody else charges five figures because you're getting the finished file and with them You're paying to dig it out yourself Do you do the work for me? No, you mail out your own letter So you hold every receipt and you see the response to day at lands from the bureaus that is How long does it take some files these six months of rounds some need two cards paid down and nothing else the road map tells you exactly What you need to do the day you open it This is for you if you want the most funding for your file you could possibly get Clean credit or not if you'd rather learn all along the way plenty of people do it takes about six

### Lines wrong vs VSL 1 script

- Missing “Three questions I get.” punctuation / pacing; runs FAQ together.
- “mail out your own letter” vs “mail your own letters”.
- Adds “from the bureaus that is” (not in script).
- “some files these six months” vs “Some files need six months of rounds”.
- **Cuts off** before refusal line, guarantee, and final CTA.

---

## SLO Funding Roadmap Take 3.mp4

- **Duration:** ~61 s  
- **Filename intent:** likely **`FundHub-VSL-Scripts.md` VSL 1** (“Funding Roadmap” sales VSL)  
- **Best script fit from speech:** **No script in repo** — checkout-abandon / retargeting talk (“You stopped at checkout…”)  
- **Match:** **no script**

### Transcript (spoken)

You stopped at checkout fair most people in this industry are scammers and liars and everything else you've tried to get you and your businesses Funded has been a runaround or a disappointment. So two ninety seven probably looks like one more So let me put this in plain terms If I could show you that your file supports two or three hundred thousand dollars more in funding than you're getting right now And hand you the exact moves to get you there. Would you pay two ninety seven for that? What do you have to do fall the steps in the order I give you and mail the letters are already wrote It's all in the road map. That's the whole job How long 10 seconds in all your documents and roadmaps are in your account the road map runs as long as your file needs One month or six and it'll tell you in the road map how long you're gonna have to be doing this for What's the risk if you're not happy with what you get? Email us and we'll refund you and we'll pull your credit with a soft inquiry so your score doesn't move

### Script status

- **No script path** — not in `docs/ads/fundhub-297/` or `SLO-CHAT-PROMPT.md` (grep 2026-09-21).

---

## SLO Retargeting Take 3.mp4

- **Duration:** ~67 s  
- **Filename intent:** no dedicated retarget script file  
- **Best script fit from speech:** **`FundHub-LOCKED-ADS.md` — AD 1** (straight offer full read)  
- **Match (AD 1):** **yes** (same structure and most lines; ASR / delivery variants)

### Transcript (spoken)

For $297, I'll tell you how much fun you qualify for right now and how much you qualify for once your file is optimized. Here's what comes with it. Your credit pull from all three bureaus where your score sits today and where it can sit once your file is cleaned up. Everything on your file holding you back will show you all of it. Sometimes it's one item, sometimes it's 12. Every one of them comes with the document you need to address it so you can maximize your fundability. We tell you what order to do it in and we give you the list of banks that will approve you once your file is fully optimized. Call a funding company today, call a funding company today and they'll promise you a roadmap you get on the call and you get pitched because that was the intention all along. Buy a course instead and you're paying five to ten thousand dollars to go dig the answers out yourself. I've been doing this for ten years, I've seen hundreds of files, I have tens of thousands of data points across the funding ecosystem and I reverse engineer all of it so you can get it for a fraction of the price with none of the run around. If you're not happy with what you get, email us and we'll refund you. Click below, pay the $297, fill up the form, takes about ten seconds, then you're holding the roadmap that takes a file that only qualifies for fifty thousand and turns it into a file worth several hundred thousand dollars. We'll pull your credit with a soft inquiry so the score doesn't move.

### Lines wrong vs AD 1 script

- ASR likely misheard **“funding”** as “fun” in the first sentence.
- “Everything on your file holding you back will show you all of it” vs “Everything on your file holding you back, we show you all of it”.
- Duplicated “Call a funding company today”.
- “that was the intention all along” vs “because the intention was always to sell you”.
- “reverse engineer” vs “reverse engineered”.
- “fill up the form” vs “fill out the form”.
- “so the score doesn't move” vs “so your score doesn't move”.

---

## SLO VSL Take 1.mp4

- **Duration:** ~57 s  
- **Filename intent:** **`FundHub-VSL-Scripts.md` — VSL 1** full sales read (~3:05)  
- **Best script fit from speech:** **`FundHub-LOCKED-ADS.md` — AD 6** (Haynes — partial; REASONS + CTA tail only)  
- **Match (VSL 1 full):** **no** — missing VSL open, deliverables list, FAQ, and full close.  
- **Match (AD 6):** **partial yes** for a slice of AD 6 REASONS + CTA.

### Transcript (spoken)

Your application goes out, it gets shotgun to a list of banks with zero strategy or preparation. I've been doing this for 10 years and I've seen hundreds of files. I'll pull your credit and tell you what you qualify for right now and what you qualify for once your file is optimized. Then I'll hand you every document needed in the exact order to work them in. Click below and grab it so you can go so you can go after the full amount your file carries instead of settling for whatever it gets you today. We'll pull your credit with a soft inquiry so your score stays safe.

### Lines wrong vs AD 6 script

- Missing AD 6 **HOOK** (“You already know your credit file decides…”).
- “shotgun” vs “shotgunned”.
- “every document needed” vs “every document you need”.
- Stutter: “so you can go so you can go”.
- “your score stays safe” vs “so your score doesn't move”.

---

## Files with no repo script

1. **SLO Ad 7 Take 1** — personal/business stacking script (transcript above).  
2. **SLO Funding Roadmap Take 3** — checkout-abandon retarget (transcript above).

---

## Re-labeling note (content vs filename)

Several Drive filenames do not match what was recorded:

| Filename | What the audio actually is |
|---|---|
| Fundhub Welcome Video | VSL 2 booking page |
| SLO Ad 6 Take 1 | LOCKED AD 7 |
| SLO Ad 7 Take 1 | Unwritten stacking script |
| SLO VSL Take 1 | Partial LOCKED AD 6 |
| SLO Retargeting Take 3 | LOCKED AD 1 |
| SLO Ad 5 / Ad 1 Take 1 / Ad 3 / Funding Roadmap Call | Pieces of VSL 1 sales script |

Transcript files (local only, not committed): `/tmp/slo-transcripts/*.txt`.
