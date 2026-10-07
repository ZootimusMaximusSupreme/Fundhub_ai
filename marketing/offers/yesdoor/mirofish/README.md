# MiroFish for Yesdoor (2026-10-07)

MiroFish (https://github.com/666ghj/MiroFish, AGPL-3.0) builds a simulated crowd of AI people from seed documents and forecasts how they react. It is kept **outside** this repo as a separate research tool. It is not part of the product, so the AGPL does not reach Fundhub code.

## Status

- Installed and import-checked in a cloud scratch folder (Python 3.12 via uv, frontend via npm). That folder is temporary; the setup steps are below.
- **Blocked before the first run:** no keys in the cloud session for:
  - `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`: any OpenAI-style model API. MiroFish recommends Qwen (`qwen-plus`) on Alibaba Bailian. Runs use a lot of tokens, so start under 40 rounds.
  - `ZEP_API_KEY`: Zep Cloud memory (https://app.getzep.com/). It has a free monthly allowance.

## Setup (any machine with the keys)

```bash
git clone --depth 1 https://github.com/666ghj/MiroFish.git && cd MiroFish
cp .env.example .env   # fill the four keys above
cd backend && uv sync --python 3.12 && cd ..
npm install && npm run dev
```

## First run: Yesdoor offer test

Seed: `seed-yesdoor.md`. Questions: `questions.md`. Upload the seed, ask each question, keep rounds under 40, then save each report next to these files as `report-<question #>-<date>.md`.

## More use cases (owner-set 2026-10-07: if it works, find more)

- Ad hooks: simulate a feed of avatars reacting to 10 hooks before spending (SLO, Ascension, Yesdoor).
- Pricing: how renters, buildings or partners react to a price change before it ships.
- VSL and page copy: which objections a simulated crowd raises, line by line.
- Closer calls: rehearse leasing-manager or brokerage objections before Tier 1 meetings.
- New company picks: test a third portfolio company idea on a simulated market.
- Policy or rate news: how a rate change or a credit-rule change moves funding demand.
