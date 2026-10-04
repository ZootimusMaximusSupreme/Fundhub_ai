# Env full copies — never masked

**Owner law (2026-10-04):** Laptop `.env` and `credentials/` are the working copies for agents, Claude cloud paste, and scripts. **`****************` placeholders are forbidden.** They are not secrets; they break push, ship, SMS, webhooks, and cloud sessions.

## Always

- Keep **full** values in gitignored `.env` and refresh from Netlify when a line looks masked.
- Run **`node scripts/env-refresh-local-from-netlify.mjs`** after any mask is found (needs `netlify` logged in on the Mac).
- Regenerate **`credentials/cloud-env-for-claude.txt`** with that script before Chris pastes cloud env vars.
- Read **`credentials/README.md`** for file names.

## Never

- Write or leave `****************` in `.env` “for safety”
- Paste cloud env from a block that still contains masks
- Assume `netlify env:get --context production` returns full values for `--secret` vars (it often does not — the refresh script falls back to **dev**)

## When refresh cannot unmask

Report the **key names** still masked. Chris reveals them once in Netlify **Site configuration → Environment variables** (production), updates `.env`, then re-run the script. Do not guess.

## Example

```text
Ask: "Copy env for Claude cloud."

❌ Copy .env with BLAND_API_KEY=****************1369.
✅ node scripts/env-refresh-local-from-netlify.mjs → open credentials/cloud-env-for-claude.txt → pbcopy.
```
