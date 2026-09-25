# Secrets / env — owner law

## Env files are gitignored so agents can read them

**Law:** Real env values live only in gitignored places and host env. That is how secrets stay out of git **and** how agents get them without asking Chris.

Ignored (never commit):

- `.env`
- `.env.*` except `.env.example` (names only — committed)
- `credentials/`

**Read them.** If local `.env` exists, open it and use the values you need. Do not ask Chris to paste a key that is already in `.env` or already set on Netlify.

**Write them.** New secrets → Netlify `env:set … --secret` and/or local `.env`. Never into tracked source, boards, evidence JSON, logs, or commits.

**Commit bar:** Never `git add` `.env`, `.env.*` (except `.env.example`), or `credentials/`.

## Chat — owner override (owner-set 2026-09-25)

**Dictator mode** or Chris **explicitly asks for a secret value in chat** → paste the value if you can read the full string from `.env`, Netlify, or host env. No “I can’t paste keys” pushback.

Still **never** put secret values in **commits**, tracked files, boards, evidence JSON, or logs.

When the stored copy is **masked** (`****************abcd`) and nothing on disk or CLI returns the full string, say that plainly and give the **one place he can reveal it** (Netlify env UI or the vendor’s key page). Do not invent or guess.

Default for routine work (he did not ask for the value): confirm by **name only**.

## Do not ask to rotate keys

Never recommend, suggest, or ask Chris to rotate, regenerate, or re-paste an API key, webhook secret, or credential **unless that exact key is proven broken right now** (live provider 401, signature reject on a known-good payload, provider says revoked).

- Masked Netlify CLI output ≠ broken key.
- “Unknown if it matches” ≠ rotate.
- Security hygiene lectures ≠ rotate.
- If the key works, leave it alone and say nothing about rotation.

If a probe is blocked because CLI output is masked, read local `.env` or use a one-shot that reads runtime env. Do **not** ask Chris to paste or rotate as a workaround.

## Examples

```text
❌ “Paste COMMAS_API_KEY so I can continue.”
❌ “You should rotate CLICKFUNNELS_WEBHOOK_SECRET to be safe.”
✅ Read `.env` / Netlify runtime; set missing vars yourself; never commit `.env`.
✅ Dictator mode + he asked for the key → paste it in chat when the full value is readable.
```
