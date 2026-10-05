// The real Round 1 letter from the "See a sample" section of the /roadmap page,
// word for word. It is our letter engine's output for a made-up test client,
// "Sample Client" (100 Test Ave, Denton, TX 76205), so the clip marks it "Sample".
// Source: marketing/landing-pages/slo/slo-01-sales.html, the `pack` entry of `var P={`.
//
// Only the opening paragraph and Dispute Item 1 are used. Items 2 and 3 hold
// words the ad rules keep off screen ("may", "carries"), and the page can only
// show the top of the letter anyway. Line breaks inside the sender, bureau and
// RE blocks are where a printed letter breaks them; the words are unchanged.

export type LetterBlock = {kind: 'p' | 'item' | 'cite'; text: string};

export const SAMPLE_LETTER = {
  sender: ['Sample Client', '100 Test Ave', 'Denton, TX 76205'],
  date: 'October 2, 2026',
  bureau: ['Experian', 'P.O. Box 4500', 'Allen, TX 75013'],
  /** "RE: Formal Dispute — SIGNET BANK/VIRGINIA | Account Ending in 4443", broken after the dash. */
  rePrefix: 'RE: Formal Dispute —',
  reAccount: 'SIGNET BANK/VIRGINIA | Account Ending in 4443',
  salutation: 'To Whom It May Concern,',
  body: [
    {kind: 'p', text: "I am writing to formally dispute inaccurate and incomplete information appearing on my Experian credit report. The account in question is reported by SIGNET BANK/VIRGINIA, ending in 4443. After reviewing my credit file, I have identified multiple Metro 2 reporting violations that make this account's current reporting inaccurate. I am requesting a full reinvestigation under FCRA § 1681i(a)(1)(A), which requires Experian to complete this investigation within 30 days of receipt of this letter. Each violation is detailed separately below."},
    {kind: 'item', text: 'DISPUTE ITEM 1 — Non-Zero Balance on a Closed Account'},
    {kind: 'cite', text: 'Metro 2 Field 21 (Current Balance) | FCRA § 1681s-2(a)(1)(A)'},
    {kind: 'p', text: "This account is reported as closed, yet Field 21 shows a current balance of $4,798. Under Metro 2 standards, a closed account must report a $0 balance in Field 21. These two data points directly contradict each other. Either the account is closed and the balance should be $0, or the balance is still active and the status is wrong. Both cannot be true at the same time. Reporting a $4,798 balance on a closed account is inaccurate under FCRA § 1681s-2(a)(1)(A), which prohibits furnishing information that a person knows or has reasonable cause to believe is inaccurate. I am requesting that Experian investigate this contradiction and correct Field 21 to reflect an accurate balance consistent with the reported account status."},
  ] as LetterBlock[],
};

/**
 * Headings for the five pages behind the Round 1 letter (tabs 2 to 6), from the
 * sample's "every round in your pack" list, which matches the titles in the
 * letter catalog (src/metro2/letters/catalog.mjs). The words "Round 2" and
 * "Round 3" are dropped: the tabs carry the number, and "Round 2" may not
 * appear on screen.
 */
export const SAMPLE_LATER_ROUNDS = [
  'FCRA / method of verification',
  'Final notice',
  'CFPB complaint',
  'State attorney general complaint',
  'Final notice, reissued',
];
