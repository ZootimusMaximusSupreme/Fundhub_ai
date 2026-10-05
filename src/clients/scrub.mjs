// One scrubber for everything the client dossier hands out: the structured
// dossier (read by /api/read/agent-context) and the prompt text (sent to a
// model and kept in agent_shadow_log). Spec M0 step 9 review, PR #28.
//
// Two passes, both always on:
//   1. KEYS. A field whose name says it holds an SSN or tax id, a date of
//      birth, a full card or account number, a password, a token or a secret
//      is replaced with "[withheld]", and its path is recorded so the dossier
//      can say what it withheld (never silent).
//   2. VALUES. Inside any string (message bodies, transcripts, notes, event
//      payloads), SSN/TIN-shaped numbers, card/account-length digit runs, and
//      token-shaped strings are replaced in place. The rest of the text stays.
//
// It over-scrubs on purpose: a 9-digit or 13-digit number in a note is lost to
// the model, which is cheaper than an SSN or a card number reaching it.

export const WITHHELD = "[withheld]";

/* Matched against the key in snake_case ("accountIdentifier" →
   "account_identifier"), word by word, so "itin" never matches "waiting". */
const SENSITIVE_KEY = new RegExp(
  "(?:^|_)(?:" + [
    "ssns?", "social_security", "tin", "itin", "taxpayer(?:_id)?", "tax_id", "ein",
    "dobs?", "date_of_birth", "birth_?date", "birthday",
    "account_identifier", "account_number", "acct_num(?:ber)?", "card_number", "pan", "routing(?:_number)?",
    "cvv", "cvc", "pin",
    "password", "passwd", "pwd", "passcode", "otp", "secrets?", "tokens?", "api_key", "apikey", "authorization",
    "credentials?", "cookies?", "set_cookie", "bank_account(?:_number)?",
    "private_key", "storage_key", "storage_path", "s3_key", "object_key"
  ].join("|") + ")(?:_|$)",
  "i"
);

/** Keys that look sensitive by name but hold the safe derived form. */
const SAFE_KEYS = new Set(["ssn_present", "has_ssn", "account_last4", "account_number_last4"]);

function snake(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

export function isSensitiveKey(key) {
  const k = snake(key);
  if (SAFE_KEYS.has(k)) return false;
  return SENSITIVE_KEY.test(k);
}

/* Keys that, written as quoted JSON inside a string ("dob":"1980-02-03",
   \"password\":\"x\"), have their value withheld. */
const JSON_KEY_IN_TEXT = new RegExp(
  String.raw`(\\?"(?:[A-Za-z0-9]+_)*(?:ssns?|social_security(?:_number)?|tin|ein|dobs?|date_of_birth|birth_?date|birthday|password|passwd|pwd|passcode|pin|otp|tokens?|access_token|refresh_token|api_?key|secrets?|client_secret|credentials?|cookies?|bank_account(?:_number)?|account_?number|account_?identifier|accountIdentifier|card_?number|cvv|cvc)\\?"\s*:\s*)` +
  String.raw`(\\?"(?:[^"\\]|\\(?!"))*\\?"|-?\d[\d.\-/]*|\[[^\]]*\]|\{[^{}]*\})`,
  "gi"
);

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_VALUE =
  String.raw`(?:\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}` +
  String.raw`|${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}` +
  String.raw`|\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}\.?,?\s+\d{4})`;
/* A birth-date label, an optional ":" / "-" / "is" / "was", then a date.
   Only the date is replaced; the label stays so the sentence still reads. */
const DOB_IN_TEXT = new RegExp(
  String.raw`(\b(?:d\.?\s?o\.?\s?b\.?|date\s+of\s+birth|birth\s*date|birthday|born(?:\s+on)?)\s*(?:(?:[:\-–]|\bis\b|\bwas\b)\s*)?)` +
  `(${DATE_VALUE})`,
  "gi"
);
/* A password / passcode / PIN label, a separator (":", "=", "-", "is"), then
   the value. The separator is required, so "password reset link" is kept. */
const PASSWORD_IN_TEXT = /(\b(?:password|passwd|pwd|passcode|pass\s+code)\s*(?:[:=\-–]|\bis\b|\bwas\b)\s*)("[^"]*"|'[^']*'|[^\s"',;]+)/gi;
const PIN_IN_TEXT = /(\b(?:pin(?:\s+(?:code|number))?|otp|one[\s-]time\s+(?:code|passcode))\s*(?:[:=\-–#]|\bis\b|\bwas\b)\s*)(\d{3,8})\b/gi;

/* Card-shaped digit groups: 4-4-4-4 (up to 19 digits), 4-6-5, or one run of
   13 to 19 digits. Never part of a longer digit/dash run, so two phone numbers
   or two ISO dates side by side are never read as one card. */
const CARD_SHAPED = /(?<![\d\-])(?:\d{4}([ \-])\d{4}\1\d{4}\1\d{1,7}|\d{4}([ \-])\d{6}\2\d{5}|\d{13,19})(?![\d\-])/g;

/** luhnValid(digits) — the card-number checksum. */
export function luhnValid(digits) {
  const d = String(digits).replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Keep the value's own quoting (none, "…", or escaped \"…\") around the replacement. */
function quoted(original, replacement) {
  if (original.startsWith('\\"')) return `\\"${replacement}\\"`;
  if (original.startsWith('"')) return `"${replacement}"`;
  return `"${replacement}"`;
}

const VALUE_RULES = [
  // Quoted JSON keys first: the whole value goes, whatever its shape.
  [JSON_KEY_IN_TEXT, (_m, key, val) => `${key}${quoted(val, WITHHELD)}`],
  // Secrets in a link's query string, before any token rule can touch the
  // value, so a signed URL reads "?token=[withheld]" cleanly.
  [/([?&](?:token|access_token|auth|key|api_key|sig|signature|code|password|pwd|otp)=)[^&\s"'#]+/gi, `$1${WITHHELD}`],
  // Label-tied values in free text.
  [DOB_IN_TEXT, "$1[dob withheld]"],
  [PASSWORD_IN_TEXT, "$1[password withheld]"],
  [PIN_IN_TEXT, "$1[pin withheld]"],
  // Token shapes, so their digits are not half-scrubbed below.
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "[token withheld]"],
  [/\bwhsec_[A-Za-z0-9+/=]{16,}/g, "[token withheld]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, "[token withheld]"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[token withheld]"],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[token withheld]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[token withheld]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [token withheld]"],
  [/\bBasic\s+[A-Za-z0-9+/]{12,}={0,2}/g, "Basic [token withheld]"],
  [/\b[A-Za-z0-9]{40,}\b/g, "[token withheld]"],
  // Card numbers: card-shaped AND passing the Luhn check.
  [CARD_SHAPED, (m) => (luhnValid(m) ? "[number withheld]" : m)],
  // SSN / TIN / EIN: 3-2-4 split by nothing, a space, dash, en dash or dot
  // (the same one both times), even glued to letters ("ssn123456789"). Never
  // part of a longer number, and never a "$" amount.
  [/(?<![\d\-–.$])\d{3}([ \-–.]?)\d{2}\1\d{4}(?![\d\-–]|\.\d)/g, "[ssn withheld]"],
  [/(?<![\d\-–.$])\d{2}[\-–]\d{7}(?![\d\-–]|\.\d)/g, "[tin withheld]"]
];

/** scrubText(string) → the same text with sensitive values replaced. */
export function scrubText(text) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (const [re, rep] of VALUE_RULES) out = out.replace(re, rep);
  return out;
}

/**
 * scrubSensitive(value, { withheld?, path? }) → a scrubbed deep copy.
 * withheld (an array) collects the path of every field removed by name.
 * Numbers under a sensitive key are withheld; other numbers pass untouched.
 */
export function scrubSensitive(value, { withheld = null, path = "" } = {}) {
  if (value == null) return value;
  if (typeof value === "string") return scrubText(value);
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((v, i) => scrubSensitive(v, { withheld, path: `${path}[${i}]` }));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const here = path ? `${path}.${k}` : k;
    if (isSensitiveKey(k)) {
      if (v != null && v !== "") {
        out[k] = WITHHELD;
        if (withheld) withheld.push(here);
      }
      continue;
    }
    out[k] = scrubSensitive(v, { withheld, path: here });
  }
  return out;
}
