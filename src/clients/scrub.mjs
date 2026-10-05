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
    "password", "passwd", "passcode", "secret", "tokens?", "api_key", "apikey", "authorization",
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

const VALUE_RULES = [
  // Token-shaped strings first, so their digits are not half-scrubbed below.
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "[token withheld]"],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[token withheld]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[token withheld]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [token withheld]"],
  [/([?&](?:token|access_token|auth|key|api_key|sig|signature|code)=)[^&\s"']+/gi, `$1${WITHHELD}`],
  [/\b[A-Za-z0-9]{40,}\b/g, "[token withheld]"],
  // Card or account numbers: 13 to 19 digits, spaces or dashes allowed.
  [/\b\d(?:[ -]?\d){12,18}\b/g, "[number withheld]"],
  // SSN / TIN / EIN: 3-2-4 with dashes, spaces or nothing, and 2-7 EIN form.
  [/\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/g, "[ssn withheld]"],
  [/\b\d{2}-\d{7}\b/g, "[tin withheld]"]
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
