# Lead alert role-play: what lands on Chris's phone and inbox

Date of the simulated day: Wednesday, October 7, 2026 (Arizona time). Branch `claude/ecstatic-galileo-h9suqe`, commits `9e432b5` and `f0d2f5a`.

This file is a simulation. No real text and no real email was sent. Every name, phone number and email below is made up (555 numbers, @example.com).

## How the run was done

* The real alert code ran: `handle()` in `src/workflows/lead-alert-owner.mjs`, with the real message builders in `src/staff/lead-alert.mjs`.
* It ran against a throwaway Postgres 16 database on this machine (port 55436) with all 341 migrations applied. It was never pointed at the live database.
* Each client file was made by the real `resolveClient()`, the same call the ClickFunnels hookup, the homepage survey and the Pipeline board use. The homepage and Pipeline bodies went through the real form checkers. The ad row was written by the real `upsertClientAdAttribution()`. I then set each file's created time to the minute on the timeline below.
* The text and the email were handed to capture stubs in place of Twilio and Resend. The stubs wrote down exactly what they were given. That is what is shown below as the phone and the inbox.
* Settings used: LEAD_ALERT_SMS_TO = +15555550100 (Chris's phone, made up), LEAD_ALERT_EMAIL_TO = chris-sim@example.com, MESSAGING_DRY_RUN = 0 (fence open). Scenario 9 leaves the phone setting out.
* Outbound check: 0 attempts to call out over the network. The process had no Twilio, Resend, Mailgun or other provider setting in its environment at all.
* The alert time in each email ("Time:") is the simulated alert time, a few seconds after the lead arrived.
* One setup note: the repo's own database test answers one old CRM-link read as "no row" on a database built from zero (a column was renamed by migration 372). This run did the same. It has nothing to do with the alert.

## The day at a glance

| Time (Arizona) | Scenario | Phone | Inbox |
|---|---|---|---|
| 8:02 AM | 1. A Facebook ad lead applies on the ClickFunnels apply funnel | 1 text | 1 email |
| 8:09 AM | 2. The same lead then books a call | nothing | nothing |
| 9:15 AM | 3. A homepage-survey lead with no ad tag | 1 text | 1 email |
| 10:30 AM | 4. A brand-new person books a call first, with no survey | 1 text | 1 email |
| 11:05 AM | 5. Sarah adds a client on the Pipeline board | 1 text | 1 email |
| 12:20 PM | 6. A demo (test) client | nothing | nothing |
| 1:00 PM | 7. A client made 2 days ago fires entry.captured again | nothing | nothing |
| 1:10 PM | 8. The very same event for lead 3 is delivered a second time | nothing | nothing |
| 2:00 PM | 9. The text number setting is missing (LEAD_ALERT_SMS_TO unset) for a new lead | nothing | 1 email |
| 3:42 PM | 10. The text provider fails once for a new lead | 1 text | 1 email |
| 4:10 PM | 10b. The text provider stays down for every try | nothing | 1 email |

Chris's phone got 5 texts all day (each one is 181 to 207 characters, so each is two text segments). His inbox got 7 emails. 10 scenarios were asked for; there is one extra (10b).

## The timeline, scenario by scenario

### Scenario 1: A Facebook ad lead applies on the ClickFunnels apply funnel

**Time:** 8:02 AM Arizona. **Event:** `entry.captured`.

**What came in.** Maria Delgado clicked a Facebook ad (ad 42), landed on the apply page, and typed her name, email and phone. ClickFunnels posts the form to Fundhub. Fundhub makes her a client file, saves which ad brought her, and fires entry.captured.

**The client file at that moment.** Name: Maria Delgado. Phone saved as: +16025550143. Email: maria.delgado@example.com. Channel: clickfunnels. Demo file: no. Made at 8:02 AM on Oct 7.

**What the code did.** It finished. Text: sent. Email: sent.

**Calls to the providers (the stubs).**

* text, try 1: accepted
* email, try 1: accepted

**Chris's phone got:**

Text to +15555550100 at 8:02 AM (196 characters):

```text
New Fundhub lead
Maria Delgado
(602) 555-0143
maria.delgado@example.com
Source: Ad 42 (42-ringlights)
Open: https://fundhub.ai/app/client-control-panel.html?id=90a3e0d9-3ecf-4139-bd68-8829070fec0f
```

**Chris's inbox got:**

Email to chris-sim@example.com at 8:02 AM:

```text
Subject: New Fundhub lead: Maria Delgado, (602) 555-0143

A new lead just came in.

Name: Maria Delgado
Phone: (602) 555-0143
Email: maria.delgado@example.com
Source: Ad 42 (42-ringlights)
Time: 8:02 AM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=90a3e0d9-3ecf-4139-bd68-8829070fec0f
```

**What the server log said** (only the alert's own lines):

```text
LOG   [lead-alert] sms sent for client 90a3e0d9-3ecf-4139-bd68-8829070fec0f
LOG   [lead-alert] email sent for client 90a3e0d9-3ecf-4139-bd68-8829070fec0f
```

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** One text and one email, with the Source line naming the ad. Both once-only stamps set.

**Result: PASS**

---

### Scenario 2: The same lead then books a call

**Time:** 8:09 AM Arizona. **Event:** `booking.created`.

**What came in.** Maria Delgado picks a time on the calendar. ClickFunnels posts the booking. Fundhub finds her existing file by her email and fires booking.created.

**The client file at that moment.** Name: Maria Delgado. Phone saved as: +16025550143. Email: maria.delgado@example.com. Channel: clickfunnels. Demo file: no. Made at 8:02 AM on Oct 7.

**What the code did.** It finished. Text: already_alerted. Email: already_alerted.

**Chris's phone got:**

Nothing sent.

Reason from the code: the text stamp was already set (`already_alerted`).

**Chris's inbox got:**

Nothing sent.

Reason from the code: the email stamp was already set (`already_alerted`).

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** Nothing new sent. Both channels say already alerted.

**Result: PASS**

---

### Scenario 3: A homepage-survey lead with no ad tag

**Time:** 9:15 AM Arizona. **Event:** `entry.captured`.

**What came in.** Terrence Boyd fills in the survey on the Fundhub homepage. There is no ad behind him. The page sends source "website:home" (the page's own default).

**The client file at that moment.** Name: Terrence Boyd. Phone saved as: +14805550177. Email: terrence.boyd@example.com. Channel: website:home. Demo file: no. Made at 9:15 AM on Oct 7.

**What the code did.** It finished. Text: sent. Email: sent.

**Calls to the providers (the stubs).**

* text, try 1: accepted
* email, try 1: accepted

**Chris's phone got:**

Text to +15555550100 at 9:15 AM (187 characters):

```text
New Fundhub lead
Terrence Boyd
(480) 555-0177
terrence.boyd@example.com
Source: website:home
Open: https://fundhub.ai/app/client-control-panel.html?id=88b1faea-ca94-43aa-8fd9-abe60b985256
```

**Chris's inbox got:**

Email to chris-sim@example.com at 9:15 AM:

```text
Subject: New Fundhub lead: Terrence Boyd, (480) 555-0177

A new lead just came in.

Name: Terrence Boyd
Phone: (480) 555-0177
Email: terrence.boyd@example.com
Source: website:home
Time: 9:15 AM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=88b1faea-ca94-43aa-8fd9-abe60b985256
```

**What the server log said** (only the alert's own lines):

```text
LOG   [lead-alert] sms sent for client 88b1faea-ca94-43aa-8fd9-abe60b985256
LOG   [lead-alert] email sent for client 88b1faea-ca94-43aa-8fd9-abe60b985256
```

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** One text and one email. The Source line falls back to the channel the lead came in on.

**Result: PASS**

---

### Scenario 4: A brand-new person books a call first, with no survey

**Time:** 10:30 AM Arizona. **Event:** `booking.created`.

**What came in.** Priya Nair goes straight to the calendar and books. No survey, so no entry.captured. The ClickFunnels hookup makes her client file in the same delivery and fires booking.created.

**The client file at that moment.** Name: Priya Nair. Phone saved as: +16235550188. Email: priya.nair@example.com. Channel: clickfunnels. Demo file: no. Made at 10:30 AM on Oct 7.

**What the code did.** It finished. Text: sent. Email: sent.

**Calls to the providers (the stubs).**

* text, try 1: accepted
* email, try 1: accepted

**Chris's phone got:**

Text to +15555550100 at 10:30 AM (181 characters):

```text
New Fundhub lead
Priya Nair
(623) 555-0188
priya.nair@example.com
Source: clickfunnels
Open: https://fundhub.ai/app/client-control-panel.html?id=e9d54d9f-58c8-49ba-be2a-f62be1b075f3
```

**Chris's inbox got:**

Email to chris-sim@example.com at 10:30 AM:

```text
Subject: New Fundhub lead: Priya Nair, (623) 555-0188

A new lead just came in.

Name: Priya Nair
Phone: (623) 555-0188
Email: priya.nair@example.com
Source: clickfunnels
Time: 10:30 AM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=e9d54d9f-58c8-49ba-be2a-f62be1b075f3
```

**What the server log said** (only the alert's own lines):

```text
LOG   [lead-alert] sms sent for client e9d54d9f-58c8-49ba-be2a-f62be1b075f3
LOG   [lead-alert] email sent for client e9d54d9f-58c8-49ba-be2a-f62be1b075f3
```

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** One text and one email, because her file is brand new.

**Result: PASS**

---

### Scenario 5: Sarah adds a client on the Pipeline board

**Time:** 11:05 AM Arizona. **Event:** `entry.captured`.

**What came in.** Sarah clicks New Client on the Pipeline board and types Luis Ortega's name, email, phone and the product. The board saves him as a client with source "pipeline" and fires entry.captured.

**The client file at that moment.** Name: Luis Ortega. Phone saved as: +15205550155. Email: luis.ortega@example.com. Channel: pipeline. Demo file: no. Made at 11:05 AM on Oct 7.

**What the code did.** It finished. Text: sent. Email: sent.

**Calls to the providers (the stubs).**

* text, try 1: accepted
* email, try 1: accepted

**Chris's phone got:**

Text to +15555550100 at 11:05 AM (207 characters):

```text
New Fundhub lead
Luis Ortega
(520) 555-0155
luis.ortega@example.com
Source: added by staff on the Pipeline board
Open: https://fundhub.ai/app/client-control-panel.html?id=a4d7baab-5d24-4df4-be44-181d88869571
```

**Chris's inbox got:**

Email to chris-sim@example.com at 11:05 AM:

```text
Subject: New Fundhub lead: Luis Ortega, (520) 555-0155

A new lead just came in.

Name: Luis Ortega
Phone: (520) 555-0155
Email: luis.ortega@example.com
Source: added by staff on the Pipeline board
Time: 11:05 AM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=a4d7baab-5d24-4df4-be44-181d88869571
```

**What the server log said** (only the alert's own lines):

```text
LOG   [lead-alert] sms sent for client a4d7baab-5d24-4df4-be44-181d88869571
LOG   [lead-alert] email sent for client a4d7baab-5d24-4df4-be44-181d88869571
```

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** One text and one email. The Source line says he was added by staff.

**Result: PASS**

---

### Scenario 6: A demo (test) client

**Time:** 12:20 PM Arizona. **Event:** `entry.captured`.

**What came in.** Someone walks the signup by hand with a test address (test.walkthrough+fhtest@example.com). The "+fhtest" tag makes the file a demo file the moment it is born.

**The client file at that moment.** Name: Test Walkthrough. Phone saved as: +16025550100. Email: test.walkthrough+fhtest@example.com. Channel: clickfunnels. Demo file: yes. Made at 12:20 PM on Oct 7.

**What the code did.** It stopped and returned {"done":false,"reason":"demo_client"}.

**Chris's phone got:**

Nothing sent.

Reason from the code: `demo_client`.

**Chris's inbox got:**

Nothing sent.

Reason from the code: `demo_client`.

**Stamps on the file afterwards.** Text stamp: empty. Email stamp: empty.

**Expected:** Nothing sent. The run stops: demo client.

**Result: PASS**

---

### Scenario 7: A client made 2 days ago fires entry.captured again

**Time:** 1:00 PM Arizona. **Event:** `entry.captured`.

**What came in.** Gloria Hansen became a client on Monday October 5. Today her ClickFunnels contact is touched again, so the same event fires for her old file.

**The client file at that moment.** Name: Gloria Hansen. Phone saved as: +16025550166. Email: gloria.hansen@example.com. Channel: clickfunnels. Demo file: no. Made at 1:00 PM on Oct 5.

**What the code did.** It stopped and returned {"done":false,"reason":"older_than_24h"}.

**Chris's phone got:**

Nothing sent.

Reason from the code: `older_than_24h`.

**Chris's inbox got:**

Nothing sent.

Reason from the code: `older_than_24h`.

**Stamps on the file afterwards.** Text stamp: empty. Email stamp: empty.

**Expected:** Nothing sent. The run stops: older than 24 hours.

**Result: PASS**

---

### Scenario 8: The very same event for lead 3 is delivered a second time

**Time:** 1:10 PM Arizona. **Event:** `entry.captured`.

**What came in.** The event for Terrence Boyd (scenario 3, same event id) arrives again, the way a webhook or Inngest can deliver twice.

**The client file at that moment.** Name: Terrence Boyd. Phone saved as: +14805550177. Email: terrence.boyd@example.com. Channel: website:home. Demo file: no. Made at 9:15 AM on Oct 7.

**What the code did.** It finished. Text: already_alerted. Email: already_alerted.

**Chris's phone got:**

Nothing sent.

Reason from the code: the text stamp was already set (`already_alerted`).

**Chris's inbox got:**

Nothing sent.

Reason from the code: the email stamp was already set (`already_alerted`).

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** Nothing new sent. Both channels say already alerted.

**Result: PASS**

---

### Scenario 9: The text number setting is missing (LEAD_ALERT_SMS_TO unset) for a new lead

**Time:** 2:00 PM Arizona. **Event:** `entry.captured`.

**What came in.** Kevin Brandt fills in the apply form. In this run only the email setting exists; the phone-number setting was never filled in.

**The client file at that moment.** Name: Kevin Brandt. Phone saved as: +19285550112. Email: kevin.brandt@example.com. Channel: clickfunnels. Demo file: no. Made at 2:00 PM on Oct 7.

**Setting check.** LEAD_ALERT_SMS_TO not set.

**What the code did.** It finished. Text: not_configured. Email: sent.

**Calls to the providers (the stubs).**

* email, try 1: accepted

**Chris's phone got:**

Nothing sent.

Reason from the code: `not_configured`, the phone setting has no usable value.

**Chris's inbox got:**

Email to chris-sim@example.com at 2:00 PM:

```text
Subject: New Fundhub lead: Kevin Brandt, (928) 555-0112

A new lead just came in.

Name: Kevin Brandt
Phone: (928) 555-0112
Email: kevin.brandt@example.com
Source: clickfunnels
Time: 2:00 PM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=b4e2cc6b-3214-4ce4-b80f-d99acf70cc6d
```

**What the server log said** (only the alert's own lines):

```text
WARN  [lead-alert] LEAD_ALERT_SMS_TO is not set to a usable value; no sms sent for client b4e2cc6b-3214-4ce4-b80f-d99acf70cc6d
LOG   [lead-alert] email sent for client b4e2cc6b-3214-4ce4-b80f-d99acf70cc6d
```

**Stamps on the file afterwards.** Text stamp: empty. Email stamp: set.

**Expected:** Email only. The text is skipped and logged. No text stamp, so a text can still go later.

**Result: PASS**

---

### Scenario 10: The text provider fails once for a new lead

**Time:** 3:42 PM Arizona. **Event:** `entry.captured`.

**What came in.** Aisha Rahman fills in the apply form. The text company (Twilio) answers the first try with a server error (HTTP 503). It works on the second try.

**The client file at that moment.** Name: Aisha Rahman. Phone saved as: +16025550129. Email: aisha.rahman@example.com. Channel: clickfunnels. Demo file: no. Made at 3:42 PM on Oct 7.

**What the code did.** It finished. Text: sent. Email: sent.

**Note.** In real Inngest there is a short wait before the second try, so the text would land a little after the time shown, and the email just after it. This run does not wait, so the clock does not move.

**Steps, in order (Inngest-style retries).**

* step `resolve-client`, try 1: ok
* step `check-eligible`, try 1: ok
* step `alert-sms`, try 1: threw, will retry (lead alert sms not sent: twilio returned HTTP 503)
* step `alert-sms`, try 2: ok
* step `alert-email`, try 1: ok

**Calls to the providers (the stubs).**

* text, try 1: provider error
* text, try 2: accepted
* email, try 1: accepted

**Chris's phone got:**

Text to +15555550100 at 3:42 PM (185 characters):

```text
New Fundhub lead
Aisha Rahman
(602) 555-0129
aisha.rahman@example.com
Source: clickfunnels
Open: https://fundhub.ai/app/client-control-panel.html?id=3e99e389-7e57-4939-8bf1-9faeda476394
```

**Chris's inbox got:**

Email to chris-sim@example.com at 3:42 PM:

```text
Subject: New Fundhub lead: Aisha Rahman, (602) 555-0129

A new lead just came in.

Name: Aisha Rahman
Phone: (602) 555-0129
Email: aisha.rahman@example.com
Source: clickfunnels
Time: 3:42 PM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=3e99e389-7e57-4939-8bf1-9faeda476394
```

**What the server log said** (only the alert's own lines):

```text
ERROR [lead-alert] sms NOT sent for client 3e99e389-7e57-4939-8bf1-9faeda476394: twilio returned HTTP 503
LOG   [lead-alert] sms sent for client 3e99e389-7e57-4939-8bf1-9faeda476394
LOG   [lead-alert] email sent for client 3e99e389-7e57-4939-8bf1-9faeda476394
```

**Stamps on the file afterwards.** Text stamp: set. Email stamp: set.

**Expected:** The text step is retried on its own and the text goes. The email goes right after. Both stamps set. The run ends green.

**Result: PASS**

---

### Scenario 10b (extra): The text provider stays down for every try

**Time:** 4:10 PM Arizona. **Event:** `entry.captured`.

**What came in.** Henry Cole fills in the apply form. Twilio answers every try with HTTP 503.

**The client file at that moment.** Name: Henry Cole. Phone saved as: +16025550138. Email: henry.cole@example.com. Channel: clickfunnels. Demo file: no. Made at 4:10 PM on Oct 7.

**What the code did.** The run ended FAILED with NonRetriableError: lead alert sms not sent: twilio returned HTTP 503.

**Note.** In real Inngest there is a wait between tries, so the email would arrive later than the minute shown here: it only starts after the text step has used all five tries. This run does not wait, so the clock does not move.

**Steps, in order (Inngest-style retries).**

* step `resolve-client`, try 1: ok
* step `check-eligible`, try 1: ok
* step `alert-sms`, try 1: threw, will retry (lead alert sms not sent: twilio returned HTTP 503)
* step `alert-sms`, try 2: threw, will retry (lead alert sms not sent: twilio returned HTTP 503)
* step `alert-sms`, try 3: threw, will retry (lead alert sms not sent: twilio returned HTTP 503)
* step `alert-sms`, try 4: threw, will retry (lead alert sms not sent: twilio returned HTTP 503)
* step `alert-sms`, try 5: gave up (lead alert sms not sent: twilio returned HTTP 503)
* step `alert-email`, try 1: ok

**Calls to the providers (the stubs).**

* text, try 1: provider error
* text, try 2: provider error
* text, try 3: provider error
* text, try 4: provider error
* text, try 5: provider error
* email, try 1: accepted

**Chris's phone got:**

Nothing sent.

**Chris's inbox got:**

Email to chris-sim@example.com at 4:10 PM:

```text
Subject: New Fundhub lead: Henry Cole, (602) 555-0138

A new lead just came in.

Name: Henry Cole
Phone: (602) 555-0138
Email: henry.cole@example.com
Source: clickfunnels
Time: 4:10 PM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=b440e8b0-4099-448e-b025-ee7fe046eeb2
```

**What the server log said** (only the alert's own lines):

```text
ERROR [lead-alert] sms NOT sent for client b440e8b0-4099-448e-b025-ee7fe046eeb2: twilio returned HTTP 503
ERROR [lead-alert] sms NOT sent for client b440e8b0-4099-448e-b025-ee7fe046eeb2: twilio returned HTTP 503
ERROR [lead-alert] sms NOT sent for client b440e8b0-4099-448e-b025-ee7fe046eeb2: twilio returned HTTP 503
ERROR [lead-alert] sms NOT sent for client b440e8b0-4099-448e-b025-ee7fe046eeb2: twilio returned HTTP 503
ERROR [lead-alert] sms NOT sent for client b440e8b0-4099-448e-b025-ee7fe046eeb2: twilio returned HTTP 503
LOG   [lead-alert] email sent for client b440e8b0-4099-448e-b025-ee7fe046eeb2
```

**Stamps on the file afterwards.** Text stamp: empty. Email stamp: set.

**Expected:** Not in the list Chris gave. Shows the worst case: the text step is tried 5 times, then gives up; the email still goes after that; the run ends failed; the text stamp is left empty.

**Result: PASS**

---

## Scorecard

| # | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | A Facebook ad lead applies on the ClickFunnels apply funnel | One text and one email, with the Source line naming the ad. Both once-only stamps set. | text sent, email sent. 1 text, 1 email. | PASS |
| 2 | The same lead then books a call | Nothing new sent. Both channels say already alerted. | text already_alerted, email already_alerted. 0 text, 0 email. | PASS |
| 3 | A homepage-survey lead with no ad tag | One text and one email. The Source line falls back to the channel the lead came in on. | text sent, email sent. 1 text, 1 email. | PASS |
| 4 | A brand-new person books a call first, with no survey | One text and one email, because her file is brand new. | text sent, email sent. 1 text, 1 email. | PASS |
| 5 | Sarah adds a client on the Pipeline board | One text and one email. The Source line says he was added by staff. | text sent, email sent. 1 text, 1 email. | PASS |
| 6 | A demo (test) client | Nothing sent. The run stops: demo client. | Stopped: demo_client. 0 text, 0 email. | PASS |
| 7 | A client made 2 days ago fires entry.captured again | Nothing sent. The run stops: older than 24 hours. | Stopped: older_than_24h. 0 text, 0 email. | PASS |
| 8 | The very same event for lead 3 is delivered a second time | Nothing new sent. Both channels say already alerted. | text already_alerted, email already_alerted. 0 text, 0 email. | PASS |
| 9 | The text number setting is missing (LEAD_ALERT_SMS_TO unset) for a new lead | Email only. The text is skipped and logged. No text stamp, so a text can still go later. | text not_configured, email sent. 0 text, 1 email. | PASS |
| 10 | The text provider fails once for a new lead | The text step is retried on its own and the text goes. The email goes right after. Both stamps set. The run ends green. | text sent, email sent. 1 text, 1 email. | PASS |
| 10b | The text provider stays down for every try | Not in the list Chris gave. Shows the worst case: the text step is tried 5 times, then gives up; the email still goes after that; the run ends failed; the text stamp is left empty. | Run ended failed (NonRetriableError). 0 text, 1 email. | PASS |

**Total: 10 of 10 PASS** on the ten asked-for scenarios. Extra scenario 10b: PASS.
