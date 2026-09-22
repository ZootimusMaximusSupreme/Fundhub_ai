import { chromium } from "playwright";
const b = await chromium.launch();
const out = {};
for (const [name, vp, ua] of [["390", { width: 390, height: 844 }, "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36"], ["1280", { width: 1280, height: 900 }, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"]]) {
  const p = await b.newPage({ viewport: vp, userAgent: ua });
  await p.goto("https://apply.fundhub.ai/roadmap/?v=" + Date.now(), { waitUntil: "load" });
  await p.waitForTimeout(2500);
  const top = await p.evaluate(() => document.getElementById("fh-proof-shuffle").getBoundingClientRect().top + scrollY);
  const probe = () => p.evaluate(() => {
    const d = document.getElementById("fh-proof-shuffle");
    const cs = [...d.querySelectorAll(".fh-card")];
    const t = cs.find((c) => c.getAttribute("data-depth") === "0");
    const flying = cs.filter((c) => c.classList.contains("is-out") || c.classList.contains("is-in")).length;
    const op = t ? Math.min(...[t, ...t.children].map((e) => +getComputedStyle(e).opacity)) : null;
    return { i: document.getElementById("fh-deck-i").textContent, op: +op.toFixed(2), flying };
  });
  const res = { normal: [], fast: [] };
  // normal scroll: 100px wheel steps
  await p.evaluate((y) => scrollTo(0, y), top - vp.height);
  for (let k = 0; k < 18; k++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(120); res.normal.push(await probe()); }
  // fast flicks: 600px jumps
  await p.evaluate((y) => scrollTo(0, y), top - vp.height);
  await p.waitForTimeout(700);
  for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, 600); await p.waitForTimeout(120); res.fast.push(await probe()); }
  await p.evaluate((y) => scrollTo(0, y - 200), top); await p.waitForTimeout(150);
  await p.screenshot({ path: `docs/workflows/site-proof-2026-09-22-evidence/recheck/shuffle-${name}.png` });
  out[name] = res;
}
await b.close();
const worst = (a) => Math.min(...a.map((x) => x.op));
for (const k of Object.keys(out)) console.log(k, "normal min opacity:", worst(out[k].normal), "fast min opacity:", worst(out[k].fast), "normal:", out[k].normal.map((x) => x.i + "/" + x.op + (x.flying ? "*" : "")).join(" "), "| fast:", out[k].fast.map((x) => x.i + "/" + x.op + (x.flying ? "*" : "")).join(" "));
