# Letter-mailing add-on: order bump vs one-click upsell (research, 2026-09-22)

Status: research draft. The independent check below found real problems. Nothing is built. No price is set.


## 1. The answer
- Sell mailing as a **one-click upsell right after payment**. Do not put it in a checkout box.
- **$1,000 makes sense there.** It is 3.4 times the $297 price. That is inside the normal upsell range, and it is already your done-for-you price. As a checkout box, about 4 in 100 buyers would take it.
- If they say no, offer a **downsell: $100 a round**, one round at a time.

## 2. Why
- **Order bump:** a checkbox on the card page.
- **One-click upsell:** an offer on the next page, after they pay. One click buys it.
- **Downsell:** a cheaper offer shown after a "no."
- **Take rate:** how many out of 100 people who see an offer buy it.

What the research says:
- Bumps must be small. SamCart says 20–40% of the main price. On $297 that is $59–$119. Small bumps sell well: about 38% take them (Brunson), or 30–40% (SamCart).
- Big bumps don't sell. One agency report found that add-ons costing over twice the order get taken about 3.7% of the time. Its data is weak. $1,000 on $297 is 337% of the order.
- SamCart warns that a big bump "feels like a second purchase decision." It lands right at the card step.
- Big prices go on the upsell page. That page has room to explain, and the buyer already said yes. Asset Academy prices upsells at 2 to 5 times the first price. SamCart says 1 to 3 times. Brunson puts done-for-you offers on the upsell page too.

Money per buyer:
- $1,000 as a bump at 3.7%: about $37.
- As an upsell at 5%: $50.
- As an upsell at 15%: $150.
- Upsell take rates in the research ran 4–23%.

## 3. The offer ladder
**Step 1: Sales page.** The add-on box says "tick the box" and "[CHRIS FILLS BUMP PRICE]." That box does not exist. Replace it with:
> Want us to mail them for you? You'll see that option right after checkout.

**Step 2: Checkout.** $297. No box.

**Step 3: Upsell page, right after payment.**
- Headline: **Want us to mail every letter for you?**
- Under it: We send each round, watch for the bureau answers, and send the next one. All six rounds, done for you.
- Button: **Yes, Mail My Letters · $1,000**
- Link: No thanks, I'll mail them myself

**Step 4: Downsell, only after a "no."**
- Headline: **Rather go one round at a time?**
- Under it: We run one round for $100. You pay when the next round is ready.
- Button: **Yes, One Round At A Time**
- Link: No thanks, take me to my Roadmap

Every path ends on the soft-pull form, like today.

Said once: federal credit repair law (15 U.S.C. 1679b(b)) bars taking money for dispute work before the work is done. The same "paid in advance" idea drove the $2.7B Lexington Law judgment. Paying per round, as each round goes out, fits that law.

## 4. What it costs us
- Day one is about 3–9 Round 1 letters.
- A later round goes out only after a bureau answers "verified." Rounds are at least 30 days apart.
- All six rounds take about six months. That is up to 27 bureau letters, plus extra letters.
- Certified mail with an electronic receipt costs $9.28 a letter. With the paper green card it is $11.02. The mail company DisputeFox charges $6.49.
- 18 letters cost $117–$198. 27 letters cost $175–$298. That is 12–30% of $1,000, before staff time.

**Unknown:** our real cost. PostGrid is our mail company. Its price is not written anywhere in our code, and staff time is unknown too. To find out, mail one real letter and write down what it costs.

What stops us from delivering today:
- Our PostGrid setup can't send certified mail. Real mailing has never been turned on.
- We don't collect a photo ID, proof of address, or signed permission to mail.
- Bureau answers go to the client's home. The client has to upload them before we can send the next round.

## 5. What has to be built
**The blocker:** Commas holds the card, not us. A button on our page can't charge it. Commas does have a way to charge a saved card, but it needs three things:
1. "Manual rebilling" turned on. Only Commas support can do that.
2. A past paid purchase. The $297 counts.
3. An "authorized subscription." A saved card alone is not enough. In Commas' own test, 7 of 8 customers who looked ready still could not be charged. A buyer who paid $297 once may not qualify.

The build:
1. Get manual rebilling turned on. Then test it: buy the $297 and try a $1 charge on that card.
2. **If it works:** build the upsell page between payment and the pull form. Our system charges the saved card and records the sale. It uses a safety code so nobody gets charged twice.
3. **If it fails:** the Yes button opens a second Commas checkout for $1,000. The buyer types the card again. Fewer people will buy, but this works today.
4. Reuse the Commas product name "Consulting Services Standard." It is already the $1,000 done-for-you product.
5. Change the checkout note "charged once, today, for $297." It stops being true when someone clicks Yes.

Skip ClickFunnels' own one-click upsell. Nothing shows it works with Commas.

## 6. Numbers to watch
Check these after the first 100 buyers.
- **Upsell take rate.** 10–30% is healthy. Over 30%, raise the price. Under 5%, the price or the offer is wrong.
- **Money per buyer.** Upsell dollars divided by the number of $297 buyers. This matters more than take rate.
- **Downsell take rate.** The research only has single examples, from 5% to 15%.
- **Pull finish rate.** This is how many buyers finish the soft pull. If it drops, move the upsell after the pull.
- **Refunds.** The research found no normal refund rate to compare against. If $297 refunds go up, the upsell is hurting the sale.
- **Cost per round**, once we know it. Make sure $1,000 still covers it.

## 7. Questions for Chris
1. Does the $297 count toward the $1,000, like the FAQ says? If yes, the upsell charges $703.
2. Is the upsell your existing $1,000 done-for-you product, or a new product that only mails letters?
3. Is it OK for us to email Commas support to turn on manual rebilling?
## Independent check: what the draft gets wrong

1. Section 1 says $1,000 is "inside the normal upsell range." That overstates it. SamCart's range is 1 to 3 times the price, so its top is $891. SamCart's sweet spot is 50 to 100% of the price, which is $149 to $297, and the doc leaves that out. Only Asset Academy's 2 to 5 times range covers $1,000. The other research calls 3.4 times "the top edge," or a price you close on a sales call.

2. Section 1 says "about 4 in 100 buyers would take it" as a fact. The number comes from Focus Digital, which the research rates low: its dates and its revenue math don't add up. It is also a table for all add-ons, not for checkout boxes. Section 2 admits the data is weak. Section 1 does not.

3. The money math compares two different kinds of number. The 3.7% is the only figure tied to price, and it covers any add-on over twice the order, whether box or upsell page. The 4–23% upsell rates are for upsells at any price, and the published examples are cheap (like $47 to $197). Nothing in the research shows a $1,000 upsell on $297 converting at 5–15%. The only price-based number says about 3.7%. So "$50–$150 per buyer" is unsupported. By the doc's own Section 6 rule, under 5% means the price is wrong.

4. The legal note contradicts the plan. The doc says paying per round "as each round goes out" fits 15 U.S.C. 1679b(b). But the main offer charges $1,000 up front for about six months of work. The research says that "runs straight into this." The downsell also charges at the click, and its copy says "You pay when the next round is ready," which is before the round is mailed. Also, the $2.7B Lexington Law judgment rested on the phone-sales rule (the Telemarketing Sales Rule), not 1679b(b). "The same idea" mixes two laws.

5. The "$100 a round" downsell does not match the owner-set $100 round. That round is $100 for all three bureaus, plus $10 for a creditor letter and $20 for the CFPB and state attorney general filings. The owner also set that it is NOT "mail the letters we already wrote." Paying triggers a fresh credit pull and a new round. It also clashes with the existing $200 "first round, done for you" product. The doc never checks the downsell's margin. Round 1 can be up to 9 letters, which is $58–$99 in postage alone.

6. The upsell copy promises things the research says we can't deliver:
   - "Watch for the bureau answers": the answers go to the client's home, as the doc's own Section 4 says.
   - "All six rounds": rounds 2–6 only happen if a bureau answers "verified."

7. The Section 5 build list skips every delivery blocker named in Section 4:
   - PostGrid can't send certified mail or a return receipt, but the sales page promises certified mail.
   - Live mailing has never been turned on.
   - Nothing collects a photo ID, proof of address or signed mailing permission.
   - There is no step for clients to upload bureau replies.

   As written, the plan charges $1,000 in one click for a service that can't go out yet.

8. The Section 4 cost math uses $1,000. Section 7 Q1 says the upsell charges $703 if the $297 counts. At $703, postage for 18–27 letters is 17–42% of the money, before staff time. The upsell button also shows a flat "$1,000," which clashes with the FAQ's promise that "your $297 counts toward it."

9. Section 7 Q1 misses that pull.html already tells buyers the $297 counts toward the $3,000 funding deposit. Counting it toward $1,000 too promises the same $297 twice. The doc also ignores the $3,000 offer on the booking page. A $1,000 upsell sits between the two and may take sales from it.

10. Section 5 says "The $297 counts" as the past paid purchase. The research lists that as unconfirmed. Today's checkout is a one-time link that can't be reused. The research says a card must be saved, with the buyer's consent, at the first payment. The doc never checks whether the $297 checkout saves a reusable card at all.

11. Section 5 says "In Commas' own test, 7 of 8…". The research says nobody has confirmed who publishes commasdocs.com, and it may be a third-party copy. "Commas' own" overstates it.

12. Section 5 leaves out Commas details from the research:
   - The charge needs Commas' number for the customer, looked up by email. The id in the payment notice (webhook) won't work.
   - Notes sent with a charge are not saved and do not come back in the payment notice.
   - Our webhook code doesn't read the upsell flag.

   So "records the sale" needs its own record-keeping. The doc also never asks whether Commas' own after-checkout upsell pages work on a one-time product. The research flags that as a question for Commas support.

13. Section 5 step 3 says the fallback "works today." That overstates it. The checkout code always sends a fixed $297, so a $1,000 second checkout needs new code. And a page where the buyer types the card again is not one click, so the 5–15% one-click math doesn't apply to it.

14. Section 5 step 4 answers Q2 before Chris does. The research names two $1,000 products. "Consulting Services Standard" is the full done-for-you credit repair product, with a contract and financing. "Consulting Services Package" is called "the $1,000 DIY product." Reusing Standard means the sale is treated as full done-for-you repair, and a one-click page has no step to sign that product's contract.

15. For the $297 offer, the upsell fights the live sales pitch. The VSL (the sales video script) says "You still do the work. You mail the letters." The FAQ sells "you mailing your own letters." Ad 7 attacks companies that mail letters for you. The doc says nothing about changing them. The FAQ does promise a done-for-you option after checkout, so a post-checkout offer itself fits.

16. Section 4 says to "mail one real letter" to learn our cost. That won't show the certified-mail cost, because PostGrid can only send first class or priority, and live mailing has never been turned on.