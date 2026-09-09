# Is it ready?

*Written 2026-09-09. For Chris. Five lanes read every line of today's work.*

---

## The answer

**No. If you plug in the keys today, nothing will work.**

The site is running old code, so half the new pages are not there yet. And there
is one word in one file that stops the Meta button from ever working — you would
press Sync, get a refusal, and get the same refusal forever.

Nine things need fixing first. Then it works.

---

## What you do, in order

**Do not start until the fix list below is done.** Steps 3 onward will fail if
you do them first.

---

**1. Say go on the fix list.**

Only you can say start. Reply "go" and I do all nine.

*What you see when it worked:* I tell you each one is done, in plain words.

---

**2. Put the site live from the newest code.**

The live site is old. It does not have today's work on it at all.

This one step also makes the three new database changes. There is no separate
database step — putting it live IS the database step.

*What you see when it worked:* open **fundhub.ai/api/health** on your phone.
There is a line called `missingMigrations`. When it worked, that list is empty.

*Heads up:* about ten database changes are waiting, not three. Seven of them are
older work from other days. If any one of those seven trips, the whole thing
stops and the old site stays up. That is the safe outcome, not a broken one.

---

**3. Get the Meta key and hand it to me.**

Log into Meta, make a long-lived access token, and give it to me. I put it on the
server. I never print it back to you.

*What you see when it worked:* I confirm it by name only — "META_ACCESS_TOKEN is
set." No value, ever.

---

**4. Connect the Meta ad account.**

Open **fundhub.ai/app/campaign-manager.html**. Pick the partner. Type in the Meta
Business ID. Press **Request access**.

Then go into Meta yourself and **Accept** the request. It is under Business
Settings, then Requests. Nothing on our side can do that click for you.

*What you see when it worked:* a row appears in the connections table saying
Meta, with your ad account number on it.

---

**5. Press "Sync Meta now".**

Same screen. One button.

*What you see when it worked:* a line saying how many campaigns, ad sets and ads
came in. After the fixes it will also say how many days of money it saved, or
tell you the reason it failed.

*What it says today:* "Nothing was pulled from Meta. no active Meta connection
for this partner." Every time. That is fix number 1.

---

**6. Connect ClickFunnels.**

Same screen, further down. Two boxes:

- The API key
- The subdomain — that is the **X** in `X.myclickfunnels.com`

Press connect.

*What you see when it worked:* the funnel pages panel above it fills with page
names, dates, views and sign-ups.

---

**7. Connect YouTube.**

Different screen: **fundhub.ai/app/creative-factory.html**. Three boxes:

- Client ID
- Client secret
- Refresh token

*What you see when it worked:* your video list appears with views and minutes
watched.

*One warning:* if you make the refresh token in Google's playground, you must
switch it to use your own client ID first. If you do not, it will refuse the
token. It will tell you so in Google's own words — that is not our bug.

---

**8. Paste the two boxes into ClickFunnels.**

On the watch page — **apply.fundhub.ai/watch** — you need **two** blocks of text
pasted into Custom HTML boxes at the bottom of the page, in this order:

1. `clickfunnels-fragments/06-utm-hidden-fields.html`
2. `clickfunnels-fragments/07-vsl-watch-beacon.html`

The first one is the one that remembers which ad the person came from. **Without
it, every video watch is recorded with no ad attached, and none of it can be tied
to anything.** Check whether it is already on that page before you paste a second
copy.

Then Save and Publish the page.

*What you see when it worked:* **nothing changes on the page.** That is correct
and on purpose. The script never touches what a visitor sees.

*And here is the honest part:* there is no screen that shows this data yet. So
after you paste it, you cannot check it. It collects quietly into the database
and there is nowhere to look. That is fix number 8.

---

## What I have to fix first

Worst first.

**1. Turn the Meta switch on.**
Nothing in the whole app can mark a Meta ad account as "on". The Sync button only
looks at accounts marked on. So Sync refuses every single time, forever, no
matter how good your key is. This is one word in one file. Nothing downstream
works until it is fixed — no ads, no money, no video drop-off, no cost per booked
call.

**2. Fix the name we ask Meta for.**
We ask Meta for a video number spelled a way Meta does not use. Meta refuses the
**whole** request when one name is wrong. So we lose the money numbers too — not
just the video ones. Every ad, every time. The right spelling has to be checked
against Meta's real list, not guessed. I will also split it into two requests so
a bad video name can never take the money down with it.

**3. Build the two missing boxes.**
There is no screen anywhere to write a script with its angle and hook. And no
screen to say which ad a creative is running on. Those are two of the three steps
the whole angle-and-hook idea needs. Right now the new panel shows one row called
"No angle set" and can never show anything else. Worse, the panel prints
instructions telling you to do three things that have no buttons. You would go
looking and find nothing.

**4. Stop the sync saying it worked when it saved nothing.**
Everything the sync does is one all-or-nothing batch. If a single row fails, the
whole batch is thrown away — but the screen still prints "Pulled in 12 campaigns
· 40 ad sets · 210 ads". The server already collects the reasons it failed and
the screen throws that list in the bin. Two fixes: give each row its own safety
net, and print the errors on the screen.

**5. Make the sync survive a real ad account.**
It makes one separate trip to Meta for every single ad, one after another, all
inside one request. A real account will run past the time the server allows,
throw everything away, and save nothing — every time you press the button. It
also only ever reads the **first 100** of anything. More than 100 campaigns and
the rest go missing with no message.

**6. Widen the money window and put the pull on a clock.**
Meta money only reaches back **7 days**, and only when a person presses the
button. Nothing runs it automatically. Miss a week and that week's money is gone
for good. Worse today: the panel defaults to a 30-day view, so it divides **7
days of money** by **30 days of booked people** and prints a confident dollar
amount. That number can be four times too low with nothing on screen saying so.

**7. Finish the VSL number.**
The video auto-plays silent. Tapping for sound sends it back to zero. So "sat
through it on mute" and "chose to watch" are two different things — and the
pasted page script never sends the second one. The database column and the
receiving code are both ready and waiting. Half the point of the VSL work is
blank without it.

**8. Build one screen for the VSL.**
Nothing reads the watch data. No page, no report. It piles up in the database and
there is nowhere to look at it.

**9. Fix one wrong word.**
A column headed "Cost per booked **person**" prints the sentence "Need 10 booked
**calls**." Those are two different counts and the older panel on the same screen
really does count calls. It will not add up when you try to.

**Small one, worth doing while I am in there:** the ClickFunnels sync button can
stick on "Syncing…" forever if your wifi drops. A page reload clears it.

---

## What will look broken and is not

Do not chase these.

- **A grey dash is not a bug.** It means "we do not know". A black **0** means we
  counted and the answer really was zero. They are meant to look different. Hover
  the dash and it tells you which kind of unknown it is.

- **A photo ad with no hook rate is right.** There is no video, so there is no
  such number. Printing 0 would make a good photo ad look like the worst one in
  the account.

- **A hook rate over 100% is right.** Meta changes its own numbers after the
  fact. We pass through what arrives rather than tidying it.

- **"Need 10 booked calls. Have 0."** is a refusal, not a failure. Under ten
  people it will not invent a cost. That is the behaviour you want.

- **The "FundHub (house)" partner says "invited". Leave it.** Switching it on
  starts a monthly grade that this partner can never pass, and the mark it leaves
  cannot be undone.

- **A preview link saying database changes are waiting is correct.** Only the
  live site runs them. That is on purpose and was set up after a preview once
  rewrote the live database.

- **"META_APP_ID is not set" is not a blocker.** It only matters for renewing a
  token months from now.

- **The beacon changes nothing you can see on the sales page.** On purpose.

- **Pages that say "not found" today** — video stats, the ClickFunnels connect
  box, the YouTube connect box — come back the moment step 2 is done. They are
  not missing, the live site is just old.

---

## What has never been tested

**Nothing built today has ever touched a database. Not once.**

There is no database on this Mac and the automatic checks are locked out. So
every new table, every rule, and every new screen read is careful reading on
paper — not something anyone watched work.

The parts that do not need a database were run today and they pass: 171 tests,
zero failures. The parts that do — about 442 of them — were skipped. A green test
result here proves nothing about anything that touches data.

**Worse: some of the tests hand-write the exact state the app can never reach.**
That is why fix number 1 was never caught. The tests set up an "on" Meta account
by hand, then check that syncing an "on" account works. It does. The app just
cannot ever make one.

Things nobody knows, that one small check each would answer:

- **Whether Meta accepts the seven video field names.** Nobody has ever asked
  Meta. One throwaway call answers it, and it is the single most valuable thing
  to test first.
- **How long the server lets one request run.** Nothing in our settings says. It
  decides whether fix 5 bites on day one or later.
- **How many campaigns and ads are actually in your Meta account.** Nobody has
  counted. Under 100 of everything and the missing-pages problem never shows up.
- **Whether the first ClickFunnels box is already on the live watch page.**
  Nobody has looked. Without it, no video watch can ever be tied to an ad.
- **Whether the account that runs database changes can see the whole table.** If
  it cannot, the flood guard on the open video door does nothing at all — quietly,
  with no error. One read-only query settles it after the deploy.
- **Whether the beacon actually reaches us from a real browser.** Traced on paper,
  never watched.
- **Whether the ten waiting database changes apply cleanly.** Only three are from
  today.
