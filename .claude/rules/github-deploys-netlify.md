# GitHub deploys to Netlify

**Owner law (2026-10-09):** GitHub is the only thing that pushes the live site. The Mac was a stand-in from before GitHub was the remote. That is over.

## Law

- `main` on GitHub is the live site. What is live is what is on `main`, nothing more.
- Every change reaches the live site by a merged pull request into `main`, then GitHub deploys it to Netlify.
- Nobody deploys from a laptop. No `netlify deploy` and no `npm run ship` from the Mac to production.
- Work that exists only on the Mac is not live-safe. Push it to GitHub the same day.
- The live site, GitHub `main`, and the database changes in `db/migrations` must agree. If they don't, fixing that comes before new work.

## Never

- Deploy from a laptop while this law is in force
- Leave live pages or API routes that exist only on a Mac
- Edit live files in place on Netlify

## Always

- Commit and push the Mac's unpushed work to GitHub, then open a pull request into `main`
- Ship by merging into `main`
- Keep the `ship` checks (guard tests, database changes, health check) as the steps GitHub runs

## Today (2026-10-09)

The Mac was ahead of GitHub: the live database had 391 database changes applied, GitHub `main` expected 365, and the live teleprompter page was not in GitHub at all. Step one is a `git push` from the Mac. Step two is wiring GitHub to deploy to Netlify. Until both are done, this law is a goal, and the old `npm run ship` stays as the only way to deploy.

Replaces the "Ship with `npm run ship`" instruction in `CLAUDE.md` §11 once step two is done. Same law: `CLAUDE.md` (owner-set 2026-10-09) and `.cursor/rules/github-deploys-netlify.mdc`.
