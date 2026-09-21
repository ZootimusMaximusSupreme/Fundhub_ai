// public/roadmap/index.html (sales) and public/roadmap/pay.html (pay) — the
// $297 Capital Playbook door on fundhub.ai. Owner lines, 2026-09-17: trust
// first, no fake testimonials, no SIM MODE, no earnings claims, the price is
// never typed in the HTML, and the pay page says what the person is agreeing to.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(HERE, "../../public/roadmap", p), "utf8");
const sales = read("index.html");
const pay = read("pay.html");

for (const [name, html] of [["index.html", sales], ["pay.html", pay]]) {
  test(`${name}: the price is never typed — it comes from the server`, () => {
    assert.doesNotMatch(html, /297/, "no hardcoded price anywhere in the file");
    assert.match(html, /\/api\/public\/slo-checkout/, "reads the price endpoint");
    assert.match(html, /priceDisplay/, "paints the server's priceDisplay");
    assert.match(html, /data-price/, "has price slots");
  });

  test(`${name}: no sample data, no fake clients`, () => {
    assert.doesNotMatch(html, /SIM MODE|FH_SIM|sim-flag/i, "no SIM MODE");
    assert.doesNotMatch(html, /Sample Client|not a real client|res-card|res-slot/i, "no sample results");
    assert.doesNotMatch(html, /\[\s*CLIENT RESULT/i, "no empty result placeholders");
  });

  test(`${name}: never sends anyone to /watch or /apply or the ClickFunnels /order path`, () => {
    assert.doesNotMatch(html, /href="\/order"|href="\/watch|href="\/apply/, "no stray funnel links");
  });
}

test("sales page: every call to action goes to the pay page", () => {
  const ctas = sales.match(/class="btn" href="[^"]+"/g) || [];
  assert.ok(ctas.length >= 4, "the copy's calls to action are all present");
  for (const c of ctas) assert.match(c, /href="\/roadmap\/pay\.html"/, c);
});

test("sales page: no video box that cannot play", () => {
  // funnel/slo-vsl.mp4 was 404 on 2026-09-17. Put it back only once it exists.
  assert.doesNotMatch(sales, /<video|slo-vsl/, "no dead video player");
});

test("sales page: the $3,000 deposit credit copy survived, from the fragment", () => {
  assert.match(sales, /credits toward your \$3,000 deposit/);
  assert.match(sales, /Soft pull only/);
});

test("pay page: posts the owner's exact body shape", () => {
  assert.match(pay, /method: "POST"/);
  assert.match(pay, /email: addr/);
  assert.match(pay, /first_name:/);
  assert.match(pay, /last_name:/);
});

test("pay page: email is required before anything is sent", () => {
  assert.match(pay, /Email <span class="req">\(required\)<\/span>/);
  const submit = pay.slice(pay.indexOf('form.addEventListener("submit"'));
  assert.ok(
    submit.indexOf("aria-invalid") < submit.indexOf('method: "POST"'),
    "email is validated before the POST"
  );
});

test("pay page: only ever leaves for an https card page the server returned", () => {
  assert.match(pay, /res\.checkoutUrl/);
  assert.match(pay, /\^https:/, "https-only guard on the redirect");
  assert.match(pay, /location\.assign\(url\)/);
});

test("pay page: says what they are agreeing to, on the page", () => {
  assert.match(pay, /charged once/i, "charged once");
  assert.match(pay, /soft pull only after you fill out the next form/i, "soft pull only after the next form");
  assert.match(pay, /We do not sell your data/, "we do not sell their data");
  assert.match(pay, /notices/, "server notices replace the defaults so price and wording never drift");
});

test("pay page: every failure says nothing was charged", () => {
  const fails = pay.match(/say\("[^"]*"\)/g) || [];
  const money = fails.filter((f) => /charge|pay/i.test(f));
  assert.ok(money.length >= 3, "the failure paths are all spoken");
  assert.match(pay, /checkout_not_configured/);
});

test("pay page: nothing personal goes in the web address", () => {
  assert.doesNotMatch(pay, /location\.search|URLSearchParams|\?email=|&email=/);
  assert.doesNotMatch(pay, /localStorage|sessionStorage/);
});
