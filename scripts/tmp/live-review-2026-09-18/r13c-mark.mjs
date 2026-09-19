// Hole 13 round 2 review (r13c) — burn red numbered boxes + a one-line legend onto every review3 shot
// (CLAUDE.md §8). Reads review3.json for what each shot showed. Nothing touches the site.
// Run: node scripts/tmp/live-review-2026-09-18/r13c-mark.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13/review3";
const data = JSON.parse(readFileSync(`${DIR}/review3.json`, "utf8"));
const KIND = { normal: "normal sign-in", cookieonly: "cookie only (fresh browser)", wiped: "cookie kept, storage wiped", stranger: "stranger (no cookie)" };

const jobs = [];
for (const r of data.runs) {
  const kind = KIND[r.label.split("-")[0]];
  const link = r.url.includes("client_id=") ? "?client_id=" : "?id=";
  for (const s of r.shots) {
    const src = s.file.split("/").pop();
    const when = src.includes("-10s") ? "at 10 s" : `first paint (${s.ms} ms)`;
    const st = s.state || {};
    let marks;
    if (!st.path || st.path.startsWith("/portal-login")) {
      marks = [{ n: 1, x: 556, y: 116, w: 328, h: 164, cap: "Client sign-in page (portal-login) — no #11 data, no greeting, no name" }];
    } else {
      const g = st.greeting || "";
      const gw = g.startsWith("Welcome back") ? 165 : 290;
      const settled = !!st.badge;
      marks = [
        { n: 1, x: 346, y: 76, w: gw, h: 28, cap: `Greeting: "${g}"` },
        settled ? { n: 2, x: 504, y: 11, w: 206, h: 36, cap: `Top name: "${st.top}"` } : { n: 2, x: 1362, y: 8, w: 56, h: 34, cap: `Top name: "${st.top}" (blank placeholder)` },
        settled ? { n: 3, x: 870, y: 10, w: 300, h: 36, cap: `Staff badge: "${st.badge}" (correct — who is signed in)` } : null,
      ].filter(Boolean);
      if (!settled) marks.push({ n: 3, x: 866, y: 6, w: 480, h: 40, cap: "Staff badge: not drawn yet" });
    }
    jobs.push({ src, title: `LIVE fundhub.ai · #11 ${link} · ${kind} · ${when}`, marks });
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 400 } });
for (const job of jobs) {
  const b64 = readFileSync(`${DIR}/${job.src}`).toString("base64");
  const boxes = job.marks.map((m) => `
    <div style="position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;border:3px solid #ff2828;box-sizing:border-box"></div>
    <div style="position:absolute;left:${m.x}px;top:${m.y + m.h + 1}px;background:#ff2828;color:#fff;font:700 14px Helvetica;padding:1px 7px">${m.n}</div>`).join("");
  const legend = job.marks.map((m) => `<b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:6px">${m.n}</b>${m.cap.replace(/</g, "&lt;")}`).join(" &nbsp;·&nbsp; ");
  await page.setContent(`<body style="margin:0;background:#fff">
    <div style="position:relative;width:1440px;height:300px;overflow:hidden"><img src="data:image/png;base64,${b64}" style="display:block">${boxes}</div>
    <div style="font:14px Helvetica;padding:8px 14px;border-top:2px solid #ff2828;line-height:1.6"><b>${job.title}</b> &nbsp;—&nbsp; ${legend}</div>
  </body>`);
  const out = `${DIR}/${job.src.replace(/\.png$/, "-marked.png")}`;
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out.split("/").pop());
}
await browser.close();
