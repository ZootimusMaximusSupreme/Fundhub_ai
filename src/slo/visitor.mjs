// Who hit the roadmap page: a real person, or one of us.
//
// The page cannot see a name until someone types an email. Before that, the
// only tells are the browser itself. After that, a company or test email
// wins, even if the browser looked ordinary.
//
// A normal browser with a normal email stays a person. Chris on his phone
// looks like a person until the email says otherwise.

const BOT_UA = /HeadlessChrome|Playwright|Puppeteer|PhantomJS|Headless|bot|crawler|spider|Bytespider|GPTBot/i;
const TEST_LOCAL = /(^|[.+_-])(e2e|sim|test)([.+_-]|$)/;

export function classifyVisitor({ email, userAgent, webdriver } = {}) {
  if (webdriver === true || webdriver === "true" || webdriver === 1) {
    return { actor: "agent", reason: "automated_browser" };
  }
  if (BOT_UA.test(String(userAgent || ""))) {
    return { actor: "agent", reason: "bot_browser" };
  }
  const mail = String(email || "").trim().toLowerCase();
  const at = mail.lastIndexOf("@");
  if (at > 0) {
    const local = mail.slice(0, at);
    const domain = mail.slice(at + 1);
    if (domain === "fundhub.ai") return { actor: "agent", reason: "company_email" };
    if (domain === "example.com" || domain === "example.net" || domain === "example.org") {
      return { actor: "agent", reason: "test_email" };
    }
    if (TEST_LOCAL.test(local)) return { actor: "agent", reason: "test_email" };
  }
  return { actor: "person", reason: "browser" };
}

/** Calendar day in Arizona, where the ad account lives. */
export function phoenixDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(now);
}
