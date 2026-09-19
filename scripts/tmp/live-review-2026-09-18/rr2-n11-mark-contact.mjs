// rr2-n11: mark up the two contact-step pictures (email field covered solid, numbered red boxes, legend).
import { chromium } from "playwright";
import { readFileSync, unlinkSync } from "node:fs";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N11/review";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 479, height: 900 } });
for (const k of ["a", "b"]) {
  const src = `${OUT}/rr2-${k}-00-contact-step-raw.png`;
  const img = readFileSync(src).toString("base64");
  const box = (n, x, y, w, h) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:4px solid #e00"></div><div style="position:absolute;left:${x - 2}px;top:${y - 22}px;background:#e00;color:#fff;font:bold 14px sans-serif;padding:1px 6px">${n}</div>`;
  await p.setContent(`<body style="margin:0;position:relative"><img src="data:image/png;base64,${img}" style="display:block">
    <div style="position:absolute;left:31px;top:335px;width:415px;height:38px;background:#333;color:#fff;font:13px sans-serif;display:flex;align-items:center;padding-left:10px;box-sizing:border-box">sim prove-inbox plus-tag (hidden)</div>
    ${box(1, 25, 329, 427, 50)}${box(2, 25, 412, 427, 169)}${box(3, 240, 617, 212, 54)}
    <div style="position:absolute;left:4px;top:788px;width:465px;border:3px solid #e00;background:#fff;font:12px sans-serif;padding:6px;box-sizing:border-box"><b>N11 review — live homepage survey, review sim ${k.toUpperCase()} (the one allowed write)</b><br>1: email = a sim plus-tag of the prove inbox (test contact only)<br>2: no phone, no SMS consent — no text or call can go out<br>3: Submit pressed once → POST /api/public/survey-submit 200 → /thank-you</div></body>`);
  await p.screenshot({ path: `${OUT}/rr2-0${k === "a" ? "0a" : "0b"}-signup-contact-step-sim${k}.png`, fullPage: true });
  unlinkSync(src);
}
await b.close();
console.log("marked");
