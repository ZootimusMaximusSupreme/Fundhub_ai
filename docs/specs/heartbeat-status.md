# The heartbeat — what it is and whether it is working

Written 2026-09-08. Read-only check. No app code was changed.

## The short answer

No. It is built, it is correct, and it has never once recorded a run. The
database that is supposed to hold one row every morning holds **zero** rows for
it — not one, ever, since it was built on 2026-08-25. So nothing is watching the
system right now, and when something breaks, nobody gets told.

## What it is

Two different things in this repo answer to the word "heartbeat". They are not
related. Chris almost certainly means the first one.

### 1. The daily pulse — the thing that tracks breakage

This is the one that "tracks all of the breaking of the system."

* `src/pulse/daily-pulse.mjs` — the whole morning check. Line 319 is the job.
* `src/pulse/registry.mjs` — a hand-typed list of every page and every door in
  the product. Lines 26–292 are the doors. Lines 294–331 are the screens.
  Line 333 builds the list the checker walks.
* `src/pulse/notify.mjs` — how it tells a human. Line 63 texts Chris. Line 86
  writes a ticket for Darwin.
* `src/workflows/daily-pulse.mjs` — the timer. Line 39 says "run this every day."
* `src/workflows/index.mjs` lines 15 and 101 — puts it on the live job list.
* `scripts/daily-pulse.mjs` — a way to run it by hand from a laptop.

It only looks. It never fixes anything. `src/pulse/daily-pulse.mjs` line 1 and
line 317 both say so in writing.

### 2. The gate relay heartbeat — a different, smaller thing

`scripts/gate-relay/index.mjs` is a small messenger that runs on Chris's Mac and
texts him when an agent needs a decision. Every 15 seconds it writes a file
called `heartbeat.json` to prove it is still alive
(`scripts/gate-relay/index.mjs` lines 32–33 and 390–406). If that file goes 90
seconds without an update, it counts as dead.

It is **not running on this Mac.** There is no `.fundhub-relay` folder here at
all. That fits — this Mac was set up on 2026-09-07 after the old one died.

The daily pulse checks this file as one of its own checks
(`src/pulse/daily-pulse.mjs` line 145).

## What it checks

Eight named checks, then a big sweep.

The eight named checks (`src/pulse/daily-pulse.mjs` lines 338–346):

1. **health** — asks the site "is your database up and is it the right shape?"
2. **login** — loads the sign-in page and looks for a sign-in form on it.
3. **apply** — loads the Client Control Panel and checks the Funding Apply door
   is on it, and that it shows the client's email and not a Fundhub one.
4. **suggestions** — checks the door behind the underwriting suggestions.
5. **gate-relay** — is the little Mac messenger alive (see above).
6. **recon** — is the robot named AG-07 switched on in the database.
7. **unrecorded** — were any sales calls logged with no recording and no
   transcript.
8. **gmail** — can it still search the Gmail account.

Then the sweep (`src/pulse/registry.mjs`). It opens **256 web addresses**, one
at a time, eight at once:

* 222 back-end doors — every list, every save, every read the product uses.
* 34 screens — Pipeline, Sales Floor, Finance OS, Client Portal, Contracts,
  Documents, Hiring, Messaging, and the rest.

A door counts as "up" if it answers at all, including "you are not signed in"
(`src/pulse/registry.mjs` lines 383–392). A screen has to actually load.

## When it runs

**On paper:** every day at 7:00 a.m. Denver time. The timer is written at
`src/pulse/daily-pulse.mjs` line 20 as `0 13 * * *` and switched on at
`src/workflows/daily-pulse.mjs` lines 39–43.

The timer lives in a service called Inngest. Inngest is not the same as the
site's own timers. The site's own timers are listed in `netlify.toml` at lines
135, 138, 141, 144 and 152 — five jobs, and **the pulse is not one of them.**

Nothing else starts it:

* No scheduled job in GitHub. `.github/workflows/tests.yml` runs only on a code
  push. There is no `schedule:` line anywhere in `.github/workflows/`.
* No button. No screen in `public/app/` starts it.
* The only other way is a person typing `node scripts/daily-pulse.mjs` on a
  laptop.

## Is it running right now

The evidence, in order of how much it settles the question.

### 1. It has never left a record. Not once.

Every real morning run is supposed to write one row into a table called
`agent_runs` (`src/pulse/daily-pulse.mjs` lines 304–313). I queried the live
production database on 2026-09-08.

| Question | Answer |
|---|---|
| Rows from the pulse (`cron.daily-pulse`), ever | **0** |
| Rows in that table from anything at all | 126 |
| Oldest row | 2026-08-22 |
| Newest row | 2026-08-27 |

The pulse was built on 2026-08-25 (commit `acfa8bc9`). There were 13 days of
mornings after that. It should have written 13 rows. It wrote none.

The write would have worked if it had been tried. The table accepts the exact
shape the pulse sends, and the default company row it needs exists
(`Fundhub`, `is_default = true`). So this is not a broken write. Nothing
reached the write.

### 2. The code IS on the live site. This is not a "not deployed yet" problem.

The live site reports it expects 267 database updates
(`https://fundhub.ai/api/health`, checked 2026-09-08). That matches a build from
2026-09-06. The pulse was added on 2026-08-25, eleven days earlier, and I
confirmed it is present in that build's job list. So the deployed site does
carry the pulse.

For the record, the live site is behind: it expects 267, the database has 270,
and `main` on this Mac now expects 277.

### 3. The parts it checks are healthy. The checker is what is missing.

I ran the real pulse by hand against the live site on 2026-09-08, read-only, no
texts sent. It finished in **12.5 seconds**.

```
PASS  health        strict health answered 200
PASS  login         login page loaded
PASS  apply         funding Apply door page loaded
PASS  suggestions   underwrite read door answered 401
skip  gate-relay    not running on this Mac
skip  recon         no database in that run
skip  unrecorded    no database in that run
skip  gmail         Gmail sign-in not set on this Mac

Sweep: 253 up / 3 down, out of 256
```

The three that answered "gone":

* `/api/public/decline-autopsy` — **a false alarm, permanently.** Chris shelved
  Decline Autopsy on 2026-08-31 and its doors are switched off on purpose
  (`netlify/functions/api.mjs` lines 726–728, commented out). But it is still on
  the watch list at `src/pulse/registry.mjs` line 172. So the pulse would cry
  wolf about this every single morning forever.
* `/api/read/funnel-pages` and `/api/read/video-stats` — real, and expected.
  Both were added on 2026-09-07, after the live site's last build. They are on
  `main`, not on the site yet.

### 4. Why it never runs — the most likely reason, stated as a guess

The pulse takes **12.5 seconds** on a fast laptop with a fast connection. The
site's functions normally get **10 seconds** before they are cut off, and
`netlify.toml` sets no longer limit. So the pulse very likely gets killed
partway through the sweep — before it can text anybody, and before it can write
its row.

That fits the evidence exactly: no row, no text, no complaint. This is a strong
guess, not a measured fact. See UNKNOWN below.

## Where an alert goes

Four places. Three of them are dead ends.

1. **A text to Chris.** `src/pulse/notify.mjs` line 63. It goes to whatever
   number is in `PULSE_SMS_TO`. That number is set on this Mac, and
   `netlify.toml` line 94 names it as living on the live site too. **This is
   the only route that could actually reach a human.**
   Note: the text goes out *every* morning, pass or fail — not only when
   something is broken (`src/pulse/daily-pulse.mjs` line 356). If Chris is not
   getting a text every morning, the pulse is not running.
2. **A WhatsApp to Darwin.** `src/pulse/notify.mjs` line 86. **Switched off.**
   The number is not set, so it is skipped and nothing is sent.
3. **A written scorecard file.** `src/pulse/daily-pulse.mjs` lines 291–296. It
   saves a page into `docs/workflows/`. **Only one such page exists on this
   Mac, dated 2026-08-26.** And a scorecard from the live site could never
   land here anyway — the site cannot save files into this repo, and if it
   tries, the error is swallowed (`src/pulse/daily-pulse.mjs` lines 378–382).
4. **A row in the database.** As covered above — zero rows, and **no screen in
   the product shows that table.** The Agent Editor screen hard-codes the run
   count to zero and says so in a note:
   `public/app/agent-editor.html` lines 522–524, "No agent_runs table yet — do
   not invent counters", `runs: 0`.

So: if the pulse ran and found something broken, the only person who would find
out is Chris, by text. Everything else lands nowhere.

## What it misses

Short and specific.

* **Itself.** Nothing checks that the pulse ran. That is the whole reason this
  has been silently dead for 13 days.
* **The other timed jobs.** On 2026-09-06 every scheduled job on the site died
  at once and nothing noticed — `netlify.toml` records it, and records that a
  simulated $3,000 payment sat unprocessed for 20 minutes. The pulse does not
  check whether a single scheduled job ran.
* **Whether messages actually go out.** It never asks how many messages are
  stuck waiting to send.
* **The failure list.** There is a table of failed events and a door to read it
  (`read/failed-events`). The pulse pings that door but never reads the number.
* **Whether a screen actually works.** It only asks "did the page load". A
  screen that loads and then shows an error counts as up. It never signs in and
  never clicks anything.
* **The shelved door it still watches.** `public/decline-autopsy` at
  `src/pulse/registry.mjs` line 172 is off on purpose and would be reported
  broken every morning.

## UNKNOWN

* **Whether Inngest is firing the timer at all.** I cannot see the Inngest
  dashboard from here. Zero database rows is consistent with "the timer never
  fires" and also with "the timer fires and the job is killed mid-run". I could
  not tell those apart.
* **The 10-second cut-off.** I could not read the live site's function timeout
  setting. The 10 seconds is the normal default. The 12.5 seconds is measured.
  The conclusion joining them is reasoning, not proof.
* **The live site's settings.** The Netlify command-line tool is not installed
  on this Mac, so I could not confirm that `PULSE_SMS_TO`, the Twilio texting
  keys, or `INNGEST_EVENT_KEY` are set on the live site. All are set on this
  Mac. `netlify.toml` line 94 implies `PULSE_SMS_TO` is set live.
* **Whether Chris has been getting the 7 a.m. text.** Only Chris can answer
  that. The text is sent straight to Twilio and leaves no record in the
  database (`src/messaging/providers/twilio.mjs` line 109), so there is nothing
  here for me to check. **This is the fastest way to confirm the whole finding.**
