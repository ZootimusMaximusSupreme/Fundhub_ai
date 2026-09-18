// The deliverables stylesheet.
//
// 2026-09-17: restyled to the GOLD PACK - the approved print system in
// docs/workflows/gold-deliverables-v5/fundhub_pdf_template.py (css()), the
// sheet that printed docs/workflows/gold-deliverables-v5/*.pdf. Same tokens,
// same type scale, same sizes in pt, so a hosted page sits next to the gold PDF
// and reads as the same document. The class names the builders already emit
// (ported from scripts/black-reports/fundhub_gen.py) are kept and restyled, and
// the gold template's own classes are added beside them for the gold look.
//
// OWNER-SET CHANGES, because this is a web page now and not a printed sheet:
//   * every @page rule is stripped
//   * .cover and .cta-page are ordinary elements with min-height: 100vh, since
//     WeasyPrint painted the @page background and a browser will not
//   * the running footers left the @page margin boxes for normal web flow, and
//     page numbers stop existing - counter(page) is not faked
//   * .pagebreak was `break-after: page`; pages are gone, so it is now the
//     vertical gap that used to sit at the top of the next sheet
//
// Design lock (DIAGRAM_SPEC.md section 7): ink #0C0C0D, track #E8E8EB,
// hairline #DDDDE1, label #6E6E76, muted #9A9AA1. The spectrum is a THIN ACCENT
// ONLY - a hairline, a card's top edge - never a fill. Every number is
// JetBrains Mono, every name is Inter.
//
// NOTHING FROM A CLIENT IS INTERPOLATED INTO THIS FILE. esc() does not escape
// ; { } or ( ), so a client value inside a <style> block would be an injection
// point. Every string below is a module literal.

const SPEC = "linear-gradient(90deg,#8B5CF6 0%,#3B82F6 22%,#22D3EE 45%,#34D399 66%,#FBBF24 84%,#F97066 100%)";
const MONO = '"JetBrains Mono", "Menlo", monospace';

export const BASE_CSS = `
* { box-sizing: border-box; }
body { font-family: "Inter", "Arial", sans-serif; font-size: 9.75pt;
       color: #0C0C0D; line-height: 1.6; margin: 0;
       -webkit-font-smoothing: antialiased; }
/* Tabular figures on the numbers only. Set on body, Inter's tabular set also
   widens the hyphen, so "Pre-Approval" and "6-Month" printed with gaps. */
td.m, td.num, .mval, .bs-val, .card .big, .hero .amount, span.m { font-variant-numeric: tabular-nums; }
h1 { font-size: 21pt; font-weight: 800; letter-spacing: -.6pt; margin: 0 0 4pt; }
h2 { font-weight: 800; font-size: 16pt; letter-spacing: -.4pt; line-height: 1.2;
     margin: 6pt 0 0; color: #0C0C0D; }
h3 { font-weight: 700; font-size: 11.6pt; letter-spacing: -.2pt; margin: 15pt 0 6pt;
     color: #0C0C0D; }
h4 { font-weight: 700; font-size: 10pt; margin: 12pt 0 4pt; color: #0C0C0D; }
p  { margin: 0 0 10pt; color: #26262A; }
p b, p strong { color: #0C0C0D; }
a { color: inherit; }

.eyebrow { font-family: ${MONO}; font-size: 6.8pt; letter-spacing: 2pt;
           color: #85858D; margin: 30pt 0 0; text-transform: uppercase; }
.rule { height: 2pt; margin: 10pt 0 13pt; background: ${SPEC}; }
.mono { font-family: ${MONO}; }
span.m, td.m, .m-num { font-family: ${MONO}; font-weight: 500; font-size: .93em; }
.small { font-size: 8pt; color: #6E6E76; line-height: 1.5; margin: 6pt 0 10pt; }
.note, .monoline { font-family: ${MONO}; font-size: 6.6pt; letter-spacing: 1pt;
        color: #9A9AA1; margin: 4pt 0 14pt; text-transform: lowercase; }
.lead { font-size: 11pt; line-height: 1.68; color: #1B1B1E; margin: 6pt 0 12pt; }

/* callouts - the gold .co: grey panel, a heavy ink bar on the left */
.callout, .co { background: #F6F6F8; padding: 11pt 13pt; margin: 4pt 0 13pt;
                border-left: 2.6pt solid #0C0C0D; font-size: 9.3pt; line-height: 1.58;
                color: #2A2A2F; break-inside: avoid; }
.callout.bar { border: none; border-left: 2.6pt solid #0C0C0D; background: #F6F6F8; }
.co.info { background: #fff; border: .9pt solid #D8D8DD; }
.co.up { border-left: 2.6pt solid transparent; border-image: ${SPEC} 1;
         border-top: none; border-right: none; border-bottom: none; }
.ct { font-weight: 700; font-size: 9.6pt; margin-bottom: 5pt; color: #0C0C0D; }
.cb { font-size: 9.3pt; line-height: 1.58; color: #2A2A2F; }
.callout p:last-child, .co p:last-child { margin-bottom: 0; }

/* tables - gold table.fh: an ink rule under the mono head, hairlines between rows */
table { width: 100%; border-collapse: collapse; margin: 2pt 0 13pt; }
th { font-family: ${MONO}; font-weight: 500; font-size: 6.6pt; letter-spacing: 1.1pt;
     text-transform: uppercase; color: #6E6E76; text-align: left;
     padding: 7pt 9pt 6pt 0; border-bottom: 1.1pt solid #0C0C0D; vertical-align: bottom; }
td { font-size: 8.9pt; line-height: 1.45; color: #232327; padding: 6.5pt 9pt 6.5pt 0;
     border-bottom: .7pt solid #E7E7EA; vertical-align: top; }
tr { break-inside: avoid; }
td.num, th.num { text-align: right; padding-right: 0; }
.cellrest { display: block; margin-top: 3pt; font-size: 8.1pt; color: #55555C; }
.table-wrap { overflow-x: auto; }

/* status chips - .tag is the old name, .chip the gold one; same three weights */
.tag, .chip { font-family: ${MONO}; font-weight: 500; font-size: 6.4pt; letter-spacing: .9pt;
              padding: 2pt 5.5pt; border-radius: 2.5pt; white-space: nowrap;
              border: .9pt solid #0C0C0D; color: #0C0C0D; text-transform: uppercase;
              display: inline-block; line-height: 1.5; }
.tag.solid, .chip.solid { background: #0C0C0D; color: #fff; }
.tag.grey, .chip.mid { background: #6A6A72; color: #fff; border-color: #6A6A72; }
.tag.open, .chip.line { background: #fff; color: #0C0C0D; border-color: #0C0C0D; }

/* stat cards - gold .mrow/.mc; the old .cards/.card is the same object */
.cards, .mrow { display: flex; gap: 8pt; margin: 4pt 0 13pt; break-inside: avoid; }
.card, .mc { flex: 1; border: .9pt solid #E3E3E7; border-top: 2pt solid #0C0C0D;
             padding: 11pt; background: #fff; min-width: 0; }
.card .lbl, .mlab { font-family: ${MONO}; font-size: 6.3pt; letter-spacing: 1.2pt;
                    text-transform: uppercase; color: #6E6E76; }
.card .big, .mval { font-family: ${MONO}; font-weight: 700; font-size: 19pt;
                    letter-spacing: -.5pt; color: #0C0C0D; margin: 6pt 0 0; line-height: 1.2; }
.card .sub, .mver { font-family: ${MONO}; font-weight: 500; font-size: 6.4pt; letter-spacing: .8pt;
                    text-transform: uppercase; color: #0C0C0D; margin-top: 5pt; }
.card .body, .mnote { font-size: 7.6pt; line-height: 1.5; color: #55555C; margin-top: 6pt; }

/* one big number - gold .bigstat; the old .hero is the same object */
.hero, .bigstat { break-inside: avoid; border: .9pt solid #E3E3E7; border-top: 2.6pt solid #0C0C0D;
                  padding: 16pt 18pt 15pt; margin: 4pt 0 13pt; }
.hero .amount, .bs-val { font-family: ${MONO}; font-weight: 700; font-size: 33pt;
                         letter-spacing: -1pt; color: #0C0C0D; line-height: 1.15; }
.bs-lab { font-family: ${MONO}; font-size: 6.8pt; letter-spacing: 1.6pt;
          text-transform: uppercase; color: #6E6E76; margin-bottom: 7pt; }
.bs-sub { font-size: 9pt; color: #55555C; margin-top: 6pt; }

/* utilization bars (the old HTML bars; the gold look draws them as a chart) */
.bar-row { margin: 0 0 12pt; }
.bar-row .head { display: flex; justify-content: space-between; font-weight: 700; font-size: 9pt; }
.bar-row .head span:last-child { font-family: ${MONO}; }
.bar-track { position: relative; height: 12pt; background: #E8E8EB; margin-top: 4pt; }
.bar-fill  { position: absolute; left: 0; top: 0; bottom: 0; background: #0C0C0D; }
.bar-mark  { position: absolute; top: -3pt; bottom: -3pt; width: 0;
             border-left: 1pt dashed #0C0C0D; }

/* numbered steps */
.steps { margin: 6pt 0 13pt; }
.step { display: flex; gap: 10pt; padding: 7pt 0; border-bottom: .7pt solid #ECECEF; }
.step .n { width: 16pt; height: 16pt; border-radius: 50%; background: #0C0C0D; color: #fff;
           font-family: ${MONO}; font-weight: 700; font-size: 7.2pt;
           text-align: center; line-height: 16pt; flex: none; }
.step .t { font-weight: 700; font-size: 9pt; color: #0C0C0D; }
.step .d { font-family: ${MONO}; font-size: 6.4pt; letter-spacing: .6pt; color: #6E6E76;
           text-transform: uppercase; }

/* timeline strip */
.tl { display: flex; margin: 10pt 0 6pt; border-top: 1.1pt solid #0C0C0D; }
.tl .m { flex: 1; padding: 9pt 6pt 11pt; border-right: .7pt solid #E7E7EA; min-width: 0; }
.tl .m:last-child { border-right: none; }
.tl .m .k { font-family: ${MONO}; font-size: 6pt; letter-spacing: 1.2pt; color: #6E6E76; }
.tl .m .h { font-weight: 700; font-size: 9pt; margin: 2pt 0 3pt; color: #0C0C0D; }
.tl .m .b { font-size: 7.6pt; color: #55555C; line-height: 1.45; }

/* checklists and lists - gold .fh-check / .fh-ul / .fh-ol */
.check { position: relative; padding-left: 17pt; margin: 0 0 4.5pt; font-size: 9.3pt;
         line-height: 1.5; color: #26262A; }
.check::before { content: ""; position: absolute; left: 0; top: 2.6pt; width: 7pt; height: 7pt;
                 border: .9pt solid #0C0C0D; }
ul.plain, .fh-ul, .fh-check, .fh-ol { margin: 0 0 10pt; padding: 0 0 0 2pt; list-style: none; }
ul.plain li, .fh-ul li, .fh-check li { position: relative; padding-left: 13pt; margin-bottom: 4.5pt;
                                       font-size: 9.3pt; line-height: 1.5; color: #26262A; }
ul.plain li::before, .fh-ul li::before { content: ""; position: absolute; left: 0; top: 5.2pt;
                                         width: 3.2pt; height: 3.2pt; background: #0C0C0D; }
.fh-check li { padding-left: 17pt; }
.fh-check li::before { content: ""; position: absolute; left: 0; top: 2.6pt; width: 7pt;
                       height: 7pt; border: .9pt solid #0C0C0D; }
.fh-ol { counter-reset: fhol; }
.fh-ol li { position: relative; padding-left: 19pt; margin-bottom: 5pt; font-size: 9.3pt;
            line-height: 1.5; counter-increment: fhol; color: #26262A; }
.fh-ol li::before { content: counter(fhol); position: absolute; left: 0; top: .4pt;
                    font-family: ${MONO}; font-weight: 700; font-size: 8pt; color: #0C0C0D; }

/* four-part card and numbered cost item */
.card4 { break-inside: avoid; border: .9pt solid #E3E3E7; padding: 10pt 12pt; margin: 0 0 9pt; }
.c4t { font-weight: 700; font-size: 9.8pt; margin-bottom: 6pt; color: #0C0C0D; }
.card4 .fh-ul { margin-bottom: 0; }
.cost { break-inside: avoid; display: flex; margin: 0 0 10pt; border-bottom: .7pt solid #ECECEF;
        padding-bottom: 10pt; }
.cnum { font-family: ${MONO}; font-weight: 700; font-size: 13pt; color: #0C0C0D; width: 26pt; flex: none; }
.cbody { flex: 1; min-width: 0; }
.ctitle { font-weight: 700; font-size: 10pt; color: #0C0C0D; margin-bottom: 4pt; }
.cline { font-size: 9.1pt; line-height: 1.52; color: #33333A; margin-bottom: 2.5pt; }
.mquote { font-family: ${MONO}; font-size: 8.4pt; letter-spacing: .4pt; color: #6E6E76;
          margin: 2pt 0 12pt; }

/* lender card - gold .lender; .nm/.why are the old names for .lname/.fit */
.lender { break-inside: avoid; border: .9pt solid #E3E3E7; border-top: 2pt solid #0C0C0D;
          padding: 11pt 13pt 12pt; margin: 0 0 9pt; background: #fff; }
.lender .nm, .lname { font-weight: 700; font-size: 10.6pt; letter-spacing: -.2pt; color: #0C0C0D;
                      margin-bottom: 0; }
.kvrow { margin-top: 7pt; }
.lender .kv, .kv { display: flex; justify-content: flex-start; gap: 0; padding: 0;
                   margin-bottom: 3pt; border-bottom: none; font-size: 8.8pt; }
.lender .kv .k, .kv .k { font-family: ${MONO}; font-size: 6.6pt; letter-spacing: 1pt;
                         text-transform: uppercase; color: #6E6E76; width: 108pt; flex: none;
                         padding-top: 1.6pt; }
.kv .v { color: #232327; }
.lender .why, .fit { font-size: 8.9pt; line-height: 1.55; color: #45454B; margin-top: 7pt;
                     border-top: .7pt solid #EDEDEF; padding-top: 7pt; }

/* was break-after: page. Pages stop existing on a web page, so what is left of
   a page break is the vertical air that used to open the next sheet. */
.pagebreak { height: 0; margin: 26pt 0 0; }

/* --- diagrams --- */
/* The older charts set no font-family on their <text>, so they inherit mono
   here. The gold charts set one on every <text> (Inter for names, mono for
   numbers), and a stylesheet rule would beat that attribute, so they are left
   alone. */
svg text:not([font-family]) { font-family: ${MONO}; }
.chart { break-inside: avoid; margin: 8pt 0 15pt; }
.chart svg { display: block; width: 100%; height: auto; max-width: 508pt; }
.diagram { margin: 14pt 0 16pt; }
.flowrow { display: flex; align-items: stretch; gap: 0; margin: 10pt 0 8pt; }
.flowbox { flex: 1; border: 1.1pt solid #0C0C0D; padding: 11pt 9pt; text-align: center; min-width: 0; }
.flowbox .fl { font-family: ${MONO}; font-size: 6pt; letter-spacing: 1.4pt; color: #6E6E76; }
.flowbox .ft { font-weight: 700; font-size: 10pt; margin: 4pt 0 2pt; }
.flowbox .fs { font-family: ${MONO}; font-size: 6.4pt; letter-spacing: .6pt; color: #6E6E76; }
.flowbox.hl { border-width: 1.6pt; box-shadow: inset 0 2.4pt 0 0 #0C0C0D; position: relative; }
.flowbox.hl::before, .scorebox.hl::before { content: ""; position: absolute; left: 0; right: 0;
  top: 0; height: 2.4pt; background: ${SPEC}; }
.flowarrow { align-self: center; padding: 0 6pt; font-size: 12pt; }
.midlabel { text-align: center; font-family: ${MONO}; font-size: 6.4pt; letter-spacing: 1.6pt;
            font-weight: 700; }
.midarrow { text-align: center; font-size: 12pt; line-height: 1; margin: 2pt 0 6pt; }
.scorebox { flex: 1; border: .9pt solid #DDDDE1; padding: 14pt 10pt; text-align: center;
            position: relative; min-width: 0; }
.scorebox .sl { font-family: ${MONO}; font-size: 6.4pt; letter-spacing: 1.6pt; color: #6E6E76; }
.scorebox .sn { font-family: ${MONO}; font-weight: 700; font-size: 26pt; margin: 8pt 0 4pt; }
.scorebox .ss { font-size: 8pt; color: #6E6E76; }
.scorebox .sb { font-family: ${MONO}; font-size: 6pt; letter-spacing: 1.6pt; color: #9A9AA1;
                margin-top: 10pt; }
.scorebox.hl { border: 1.6pt solid #0C0C0D; }
.scorebox.hl .sb { color: #0C0C0D; font-weight: 700; }

/* month row with numbered circles */
.mcol { flex: 1; text-align: center; padding: 0 4pt; min-width: 0; }
.mcol .circ { width: 16pt; height: 16pt; border-radius: 50%; background: #0C0C0D;
              color: #fff; font-family: ${MONO}; font-size: 7.4pt; font-weight: 700;
              line-height: 16pt; margin: 0 auto 8pt; }
.mcol .mk { font-family: ${MONO}; font-size: 6pt; letter-spacing: 1.4pt; color: #6E6E76; }
.mcol .mt { font-weight: 700; font-size: 9.5pt; margin: 2pt 0 3pt; }
.mcol .mb { font-size: 7.6pt; color: #6E6E76; line-height: 1.45; }
.mcol .mex { font-family: ${MONO}; font-size: 7pt; font-weight: 700; margin-top: 8pt; }

.side { display: flex; gap: 20pt; align-items: flex-start; }
.side .grow { flex: 1; min-width: 0; }

/* the book-a-call button - used on the closing panel and inside the body */
.book-btn { display: inline-block; background: #fff; color: #0C0C0D; text-decoration: none;
            font-family: ${MONO}; font-weight: 700; font-size: 8.4pt; letter-spacing: 1.4pt;
            text-transform: uppercase; padding: 11pt 18pt; border-radius: 2.5pt;
            border: 1pt solid #fff; }
.book-btn:hover, .book-btn:focus-visible { background: #0C0C0D; color: #fff; outline: none; }
.book-btn.ink { background: #0C0C0D; color: #fff; border-color: #0C0C0D; }
.book-btn.ink:hover, .book-btn.ink:focus-visible { background: #fff; color: #0C0C0D; }

/* v2 variant: rainbow gradient stat cards (kept for the separate v2 treatment) */
body.v2 .scorebox, body.v2 .card {
  background: linear-gradient(160deg,#7b5cff 0%,#3aa0ff 26%,#2fd6c3 50%,
              #7bd44a 66%,#f5c542 82%,#ff7a45 100%);
  border: 1px solid #bbb; }
body.v2 .scorebox .sl, body.v2 .card .lbl { color: rgba(255,255,255,.85); }
body.v2 .scorebox .ss, body.v2 .card .body { color: #10312b; }
body.v2 .card .sub { color: #0e2a25; }
`;

export const COVER_CSS = `
/* --- full-bleed BLACK panels: cover + final CTA ---
   These were @page cover in the PDF. As ordinary elements they must paint their
   own background and claim their own height, because nothing under them does. */
.cover, .cta-page { min-height: 100vh; position: relative; background: #0c0c0c; color: #fff;
                    margin-left: -52pt; margin-right: -52pt; display: flex; flex-direction: column; }
.cover { margin-top: -58pt; margin-bottom: 30pt; }
.cta-page { margin-top: 44pt; }
.cover, .cta-page { background: #0A0A0A; }

/* gold cover: spectrum hairline across the top, wordmark + tag, the title a
   third of the way down, four meta cells and the green-dot foot at the bottom */
.spec-top { height: 3.5pt; width: 100%; background: ${SPEC}; flex: none; }
.cov-in, .clo-in { flex: 1; display: flex; flex-direction: column; padding: 44pt 52pt 34pt; }
.cov-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16pt;
            flex-wrap: wrap; }
.wordmark { font-weight: 800; font-size: 19pt; letter-spacing: -.4pt; color: #fff; }
.cov-tag { font-family: ${MONO}; font-size: 7pt; letter-spacing: 1.6pt; color: #6E6E76;
           text-transform: uppercase; }
.cov-mid { margin: auto 0; padding: 60pt 0; }
.cov-eyebrow { font-family: ${MONO}; font-size: 7.5pt; letter-spacing: 2.6pt; color: #8A8A92;
               text-transform: uppercase; }
.cover h1.cov-title, .cov-title { font-weight: 800; font-size: 36pt; line-height: 1.08;
             letter-spacing: -1pt; color: #fff; margin: 14pt 0 0; max-width: 6.6in; }
.cov-rule { width: 62pt; height: 2.5pt; background: ${SPEC}; margin-top: 22pt; }
.cov-meta { display: flex; flex-wrap: wrap; row-gap: 14pt; margin-bottom: 28pt; }
.cm { flex: 1 1 0; min-width: 110pt; border-left: .9pt solid #26262B; padding: 2pt 12pt; }
.cm .l { font-family: ${MONO}; font-size: 6.2pt; letter-spacing: 1.4pt; color: #6E6E76;
         text-transform: uppercase; }
.cm .v { font-family: ${MONO}; font-weight: 500; font-size: 8.6pt; color: #F2F2F4; margin-top: 5pt;
         overflow-wrap: anywhere; }
.cov-foot, .clo-foot { display: flex; justify-content: space-between; gap: 16pt; flex-wrap: wrap;
                       border-top: .9pt solid #1D1D22; padding-top: 12pt;
                       font-family: ${MONO}; font-size: 6.6pt; letter-spacing: 1pt; color: #6E6E76; }
.dot { color: #34D399; }

/* gold closing panel */
.clo-mid { margin: auto 0; padding: 50pt 0; text-align: center; }
.clo-title { font-weight: 800; font-size: 27pt; letter-spacing: -.8pt; color: #fff; margin: 0;
             line-height: 1.15; }
.clo-rule { width: 62pt; height: 2.5pt; background: ${SPEC}; margin: 18pt auto 0; }
.clo-sub { font-size: 10.3pt; color: #A9A9B1; margin: 16pt auto 0; max-width: 5.4in; line-height: 1.6; }
.clo-cta { margin-top: 26pt; }
.qr-link { display: inline-block; text-decoration: none; margin-top: 22pt; }
.cta-page .qr { width: 128pt; height: 128pt; border: 1pt dashed #3A3A41; margin: 0 auto;
                display: flex; align-items: center; justify-content: center; background: transparent;
                font-family: ${MONO}; font-size: 7.5pt; letter-spacing: 1.5pt; color: #6E6E76;
                line-height: 1; }
.qr-cap { font-family: ${MONO}; font-size: 6.8pt; letter-spacing: 1pt; color: #6E6E76; margin-top: 12pt;
          text-transform: uppercase; }
.clo-url { display: inline-block; font-family: ${MONO}; font-weight: 500; font-size: 11.5pt; color: #fff;
           margin-top: 16pt; text-decoration: underline; text-decoration-color: #3A3A41;
           text-underline-offset: 4pt; overflow-wrap: anywhere; }
.clo-url:hover { text-decoration-color: #fff; }
.clo-alt { font-size: 8pt; color: #6E6E76; margin-top: 7pt; }

/* the older cover markup (the look the parity test pins) - kept presentable */
.cover > div:first-child:not(.spec-top), .cta-page > div:first-child:not(.spec-top) { padding: 44pt 52pt 0; }
.cover .brand, .cta-page .brand { font-size: 15pt; font-weight: 800; letter-spacing: -.02em; color: #fff; }
.cover .kicker { font-family: ${MONO}; font-size: 6.5pt; letter-spacing: .3em; color: #7d7d7d; margin-left: 10px; }
.cover .doctype { font-family: ${MONO}; font-size: 7pt; letter-spacing: .3em; color: #7d7d7d;
                  margin: 58mm 52pt 0; }
.cover .accent { height: 3px; width: 46mm; margin: 8px 52pt 6px;
                 background: ${SPEC}; }
.cover > h1 { font-size: 34pt; line-height: 1.08; margin: 6px 52pt 40px; max-width: 82%; color: #fff; }
.cover .meta { display: flex; gap: 34px; border-top: 1.5px solid #3a3a3a; padding-top: 12px; margin: 0 52pt; }
.cover .meta .k { font-family: ${MONO}; font-size: 6pt; letter-spacing: .22em; color: #7d7d7d; }
.cover .meta .v { font-size: 10pt; margin-top: 3px; color: #fff; }
.foot-dark { margin: auto 52pt 34pt; padding-top: 12pt; display: flex; justify-content: space-between;
             font-family: ${MONO}; font-size: 6pt; letter-spacing: .22em; color: #7d7d7d; }
.foot-dark .dot { color: #35d07f; letter-spacing: 0; margin-right: 6px; }
.cta-page > h2 { font-size: 22pt; color: #fff; margin: 42mm 52pt 0; }
.cta-page > p { color: #cfcfcf; max-width: 70%; margin-left: 52pt; }
.cta-page > .rule { width: 46mm; margin-left: 52pt; }
.cta-page > .qr { border: 1px solid #3a3a3a; background: #161616; width: 120px; height: 120px;
                  margin: 22px 52pt 10px; font-family: ${MONO}; font-size: 6.5pt; color: #6a6a6a;
                  text-align: center; line-height: 120px; letter-spacing: .18em; }
.cta-page .url { font-family: ${MONO}; font-size: 9.5pt; color: #fff; margin-top: 10px; }
.cta-page .small { color: #8a8a8a; }
.cta-page .lbl { font-family: ${MONO}; font-size: 6.5pt; letter-spacing: .22em; color: #7d7d7d;
                 margin-left: 52pt; }
`;

/**
 * The page frame. @page carried the Letter sheet and its 58/52/66/52pt margins;
 * a scrolling document needs a measure of its own or the lines run the width of
 * the monitor. The text column is 508pt - Letter's 612pt less the gold sheet's
 * two 52pt side margins - so a line of body text and every chart are the same
 * size they are in the gold PDF. box-sizing is border-box, so the padding is
 * ADDED to the 508pt, not taken out of it.
 *
 * The sheet sits on a grey desk with a soft edge, so on a wide screen it reads as
 * the paper document it is.
 */
export const PAGE_CSS = `
html { background: #E9E9EC; }
body { background: #fff; max-width: calc(508pt + 104pt); margin: 24pt auto;
       padding: 58pt 52pt 66pt; overflow-x: hidden;
       box-shadow: 0 1px 2px rgba(12,12,13,.06), 0 12px 40px rgba(12,12,13,.10); }
img, svg { max-width: 100%; }

/* The running footer. It was @bottom-left / @bottom-right inside @page, which a
   browser does not paint. It sits in normal flow at the end of the document
   instead, and it carries NO page number: a scrolling document has no page
   count, and a faked number would be a lie. */
.running-foot { display: flex; justify-content: space-between; gap: 16pt;
                margin: 0; padding: 14pt 52pt 16pt; margin-left: -52pt; margin-right: -52pt;
                margin-bottom: -66pt; background: #0A0A0A; border-top: .9pt solid #1D1D22;
                font-family: "JetBrains Mono", "Menlo", monospace; font-size: 6.4pt;
                color: #6E6E76; letter-spacing: .6pt; }

@media (max-width: 700px) {
  body { padding: 28px 16px 40px; margin: 0; box-shadow: none; }
  .cover, .cta-page { margin-left: -16px; margin-right: -16px; }
  .cover { margin-top: -28px; }
  .running-foot { margin-left: -16px; margin-right: -16px; margin-bottom: -40px; padding: 14px 16px; }
  .cov-in, .clo-in { padding: 28px 20px 24px; }
  .cov-title, .cover h1.cov-title { font-size: 28pt; }
  .clo-title { font-size: 22pt; }
  .cards, .mrow, .flowrow, .side, .tl { flex-wrap: wrap; }
  .card, .mc { flex: 1 1 40%; }
  table { display: block; overflow-x: auto; }
  /* A gold chart is drawn for a 508pt column. On a phone it runs edge to edge
     and shows the whole picture; it is vector, so a pinch-zoom stays sharp. A
     chart that scrolled sideways cut its own sentences off at the screen edge. */
  .chart { margin-left: -12px; margin-right: -12px; }
  .kv .k, .lender .kv .k { width: 88pt; }
}

@media print {
  html { background: #fff; }
  body { box-shadow: none; margin: 0 auto; }
}
`;
