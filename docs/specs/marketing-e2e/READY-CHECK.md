# Is it ready?

**Rewritten 2026-09-09, after the fixes.** For Chris. Read on a phone.

---

## The answer

**The code is done. Eight things that would have stopped it working are fixed.**

But you cannot just plug in the keys yet, and it is not because anything is broken.
**The live site is running old code.** None of this is out there. One deploy fixes
that, and the deploy is step 2.

Nothing here has ever run against a database. That is not laziness — there is no
Postgres on this Mac and GitHub is locked out, so there was nowhere to run it.
The first deploy is the first real test.

---

## What you do, in order

### 1. The five ClickFunnels boxes — 15 minutes

Full steps: `docs/clickfunnels/CHRIS-DO-THIS-FIRST.md`

You told me these do not exist. Until they do, every visitor arrives with no ad
attached and the whole measuring half stays blank no matter what else works.

**You can do this one from your phone.** It is all inside ClickFunnels.

*Worked when:* every survey question shows a box name instead of the word "None".

---

### 2. Run the migration, then deploy — needs your laptop

```bash
DATABASE_URL="$(netlify env:get DATABASE_URL --context production)" node db/migrate.mjs
```

```bash
netlify deploy --build --prod
```

**Read this before you run it.** The migration applies **every** waiting database
change, not only mine. Your live database was at 270 changes; the repo now expects
281. So about eleven will run, and only four are from this work. The other seven are
from other work that was already waiting. Nothing deletes anything — they only add.

*Worked when:* `fundhub.ai/api/health` says `pending: 0`, and
`fundhub.ai/api/read/ad-spine` answers "not logged in" instead of "not found".

---

### 3. Paste the beacon script into ClickFunnels

The file is `clickfunnels-fragments/07-vsl-watch-beacon.html`.

It goes on the watch page at `apply.fundhub.ai/watch`, in a Custom HTML box.

**It cannot be deployed from the repo.** ClickFunnels owns that page. Until you
paste it, nobody is measuring the video at all — which is the situation today.

*Worked when:* you watch your own VSL, then the video panel shows one viewing.

---

### 4. Plug in the four keys

- **Meta ad account** — the big one. Spend, clicks, and where people stop watching
  your ads all come from here.
- **ClickFunnels API key** — *and tell me which workspace.* A key belongs to a whole
  team and a team can hold more than one. The wrong one connects to the wrong funnel
  and every number after that is wrong.
- **YouTube** — client id, secret, refresh token. Only useful for videos on your
  YouTube channel. **It will not measure your VSL** — that is a file on our own
  server, which is why step 3 exists.
- **Microsoft Clarity project ID** — paste into `public/js/clarity.js` line 27, then
  on Clarity's own website set Masking to **Strict**. No code can set that second
  part.

*Worked when:* you press "Sync Meta now" and it says how many campaigns and how many
days of spend it saved.

---

### 5. Label one ad, end to end

This is the real test. In Creative Factory: write a script and give it an angle and a
hook. Generate a creative from it. Then in Campaign Manager, press **Label** on one ad,
pick that creative, and type the ad's number.

*Worked when:* the angle panel shows that angle with 1 ad and its spend.

---

## What I fixed after the audit

Eight things, all confirmed by a second agent whose job was to prove me wrong.

**Would have stopped it dead:**

1. **A Meta account could never be switched on.** Sync only runs on an account marked
   "active" and nothing in the app ever marked one. You would have pressed Sync and
   been refused forever.
2. **We asked Meta for a field that does not exist.** Meta rejects the *whole* request
   over one bad name, so spend and clicks would have gone missing too and the whole
   thing would have looked broken. Six of our seven names were right; the seventh was
   invented.
3. **The sync died on a real account and saved nothing** — one call per ad inside one
   big save, so hundreds of ads ran out of time and threw everything away, while still
   reporting success.
4. **No screen could label anything.** The parts worked but nothing on any page could
   reach them.

**Would have quietly lost data:**

5. **Only the first 100 of anything was pulled.** More than 100 ads and the rest
   vanished silently.
6. **Nothing pulled Meta on a schedule, and it only looked back 7 days.** Miss eight
   days and that spend was gone for good — showing as blank, which reads as "we spent
   nothing".
7. **The VSL threw away its most important number.** The video restarts when you tap
   for sound, so "it played to 3:00" and "someone chose to watch to 3:00" are different
   facts. Only the first was being sent.
8. **The sync counted rows it had not saved**, and a screen said "calls" where it meant
   "people".

---

## What will look broken and is not

- **Every panel is empty at first.** Nothing is labelled yet and no account is
  connected. Empty is correct. The panels say why they are empty.
- **A blank cell is not a zero.** Blank means we do not know. Zero means we know it
  is zero. They are drawn differently on purpose — a photo ad has no hook rate at all,
  and that is a fact, not a zero.
- **"Need 10 booked people. Have 0."** That is deliberate. A cost per booked call from
  one booking is noise. It refuses to show a number it cannot stand behind.
- **YouTube shows nothing about your VSL.** Correct. Your VSL is not on YouTube.

---

## What has never been tested

Be clear-eyed about this.

**No code here has run against a database.** Not one line. There is no Postgres,
Docker or Homebrew on this Mac and GitHub is locked out, so there was nowhere to run
it. Every database test skips, and a skipped test proves nothing.

**No code here has talked to real Meta.** The field names were checked against Meta's
own published list, which is why the invented one was caught — but checking a list is
not the same as making a call.

**What that means in practice:** the first deploy and the first sync are the real test.
Something will probably go wrong there. It should be small and it should be visible,
because the errors now say what happened instead of claiming success.

**The one thing worth watching on the first run:** whether the daily Meta pull can read
across partners. If it cannot, it reports zero partners and does no harm — but it also
does no good, and nobody would notice.

---

## Where everything is

| What | Where |
|---|---|
| The plan | `docs/specs/marketing-e2e-spec.md` |
| What we are building and why | `docs/specs/marketing-e2e/THE-TARGET.md` |
| The ClickFunnels steps | `docs/clickfunnels/CHRIS-DO-THIS-FIRST.md` |
| What the VSL can and cannot tell us | `docs/specs/marketing-e2e/vsl-measurement-truth.md` |
| How a label reaches an ad | `docs/journeys/ad-label-spine-flow.md` |
| How the video gets measured | `docs/journeys/vsl-watch-flow.md` |
| The heartbeat, which has never run | `docs/specs/heartbeat-status.md` |
