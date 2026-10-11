# Justice — company email and calendar (2026-10-10)

Chris is setting this up himself. Cost: $0. fundhub.ai mail already runs through Cloudflare Email Routing (MX records point at route1/2/3.mx.cloudflare.net, checked 2026-10-10).

Justice's hours: weekdays 6–10pm Eastern, weekends 9am–5pm Eastern.

## 1. Email address (Cloudflare)

1. Open https://dash.cloudflare.com/?to=/:account/fundhub.ai/email/routing/routes
2. Click **Create address**.
3. Custom address: `justice`
4. Action: **Send to an email**
5. Destination: your own email for now, so the Google code in step 2 comes to you.
6. Save.

## 2. Google account

1. Open https://accounts.google.com/signup in a private window, so it stays separate from your own Google login.
2. Fill in his name and birthday. Next.
3. On "Choose your Gmail address", click **Use your existing email**.
4. Enter `justice@fundhub.ai`. Next.
5. Google sends a code to justice@fundhub.ai. It lands in your inbox. Enter it.
6. Set a password.

## 3. His hours

1. Signed in as justice@fundhub.ai, open https://calendar.google.com/calendar/r/settings
2. General → Time zone → Primary time zone: **Eastern Time - New York**.
3. Back on the calendar, click **Create** → **Appointment schedule**.
4. Availability: Mon–Fri 6:00pm–10:00pm. Sat and Sun 9:00am–5:00pm.
5. Save. His booking link is on the schedule's page.

## 4. Share it with you

1. In his calendar settings, under **Settings for my calendars**, click his calendar.
2. **Share with specific people or groups** → add your email → **See all event details**.

## 5. Hand it to Justice

1. Send him the email and password. He changes the password and turns on 2-step verification.
2. In Cloudflare, edit the `justice` rule and change the destination to his personal email. Cloudflare emails him a verify link, and forwarding to him starts once he clicks it.

## Later, only if he needs it

- Replying as justice@fundhub.ai from his Gmail is a free "Send mail as" setting.
- If leads should book him from the funnel, that is the ClickFunnels calendar, where he gets added as a host.
