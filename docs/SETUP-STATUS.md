# Setup status

Updated 2026-10-02.

## Done

- Linear workspace AzraelGodKing is on the Basic plan. Confirmed price: $12 per user per month.
- Linear docs confirm a personal API key can be limited to Create issues and to one team. No key has been created.
- Site repo is Codebase `azraelgodking/Azraels_Mods_Website`. Local clone is `F:\Repositories\Azraels_Mods_Website` on branch `feat/report-form`. No commit yet.
- Cloudflare Workers Builds can connect to a Cursor Origin repo (Cloudflare changelog, 2026-09-22).
- Personal Codebase repos are private only. This site source cannot be made public in Codebase.
- Buildkite can connect to an Origin-hosted repo. It does not build GitHub-mirror repos through the Origin app.
- Confirmed mod repos: `AzraelGodKing/rimworld_mods`, `AzraelGodKing/SunhavenMod`, and `AzraelGodKing/7d2d_mods`. Every mod in those repos is in scope.
- `mod.json` is written for 9 RimWorld mods, 14 Sun Haven mods, and 5 7 Days to Die mods. Local site build lists them. RimWorld and Sun Haven pages link to the existing GitHub zip when one exists.
- R2 is enabled on account Azraelgodking. One Standard bucket, `azraels-mods`, is in ENAM. Public address `pub-aa73fdeb8db147eb8c49d8634a51646c.r2.dev` is on. No custom domain. The bucket is empty.
- Cloudflare emails the account billing address when spend reaches $1. That alert does not stop uploads or downloads. R2 has no hard monthly cap; usage past the free tier is billed.
- Each mod page has a report form. The Worker checks Turnstile, trims the text, strips HTML, and creates a Linear issue with that mod's label and the `website` label. The Turnstile widget allows `localhost` and `127.0.0.1`. The form is not deployed.

## In progress

- Plan docs are in the local clone. A push to Codebase is not verified. `git ls-remote` waited on a login, and the Origin CLI does not support native Windows.
- Each mod has a `mod.json` on branch `chore/mod-json` in a worktree: `rimworld_mods-modjson`, `SunhavenMod-modjson`, and `7d2d-modjson`. The site build reads those files. Nothing is committed or deployed.
- The report form runs locally with `npm run dev:worker`. A Linear key is in `.dev.vars`. A test report filed AZR-350 with the Azrael and website labels.

## Waiting on me

- Nothing for the report form. AZR-350 is the test issue in Backlog. Close or cancel it when you do not need it.
