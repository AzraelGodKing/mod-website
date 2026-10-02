# Setup status

Updated 2026-10-02.

## Done

- Linear workspace AzraelGodKing is on the Basic plan. Confirmed price: $12 per user per month.
- Linear docs confirm a personal API key can be limited to Create issues and to one team. A key is in `.dev.vars` on this machine.
- Site work is in GitHub `AzraelGodKing/mod-website`, local clone `F:\Repositories\mod-website`. Pull request #1 is merged to `main`. Codebase `azraelgodking/Azraels_Mods_Website` is a mirror. Pushes go to GitHub.
- Cloudflare Workers Builds can connect to a Cursor Origin repo (Cloudflare changelog, 2026-09-22).
- Personal Codebase repos are private only. This site source cannot be made public in Codebase.
- Buildkite's Origin app does not build a GitHub mirror. This pipeline connects to GitHub `AzraelGodKing/mod-website` instead.
- Confirmed mod repos: `AzraelGodKing/rimworld_mods`, `AzraelGodKing/SunhavenMod`, and `AzraelGodKing/7d2d_mods`. Every mod in those repos is in scope.
- `mod.json` is written for 9 RimWorld mods, 14 Sun Haven mods, and 5 7 Days to Die mods. Local site build lists them. RimWorld and Sun Haven pages link to the existing GitHub zip when one exists.
- R2 is enabled on account Azraelgodking. One Standard bucket, `azraels-mods`, is in ENAM. Public address `pub-aa73fdeb8db147eb8c49d8634a51646c.r2.dev` is on. No custom domain. The bucket is empty.
- Cloudflare emails the account billing address when spend reaches $1. That alert does not stop uploads or downloads. R2 has no hard monthly cap; usage past the free tier is billed.
- Each mod page has a report form. The Worker checks Turnstile, trims the text, strips HTML, and creates a Linear issue with that mod's label and the `website` label. The Turnstile widget allows `localhost`, `127.0.0.1`, and `azraels-mods-website.azraelgodking95.workers.dev`. The form is not deployed.

## In progress

- Codebase is the mirror. This machine does not push there. The Origin CLI does not run on native Windows, and `git push` to Codebase was rejected.
- `mod.json` is committed on `chore/mod-json` in the three mod repos and pushed to GitHub. Those branches are not merged to each repo's main. The site build reads the local worktrees.
- The report form runs locally with `npm run dev:worker`. A Linear key is in `.dev.vars`. Test reports AZR-350 and AZR-352 are in Backlog.
- Buildkite agents `site` and `deploy` are connected on this machine. The deploy agent is the only one with the Cloudflare token and the report-form secrets. Nothing is deployed. The public hostname will be `azraels-mods-website.azraelgodking95.workers.dev`.

## Waiting on me

- Nothing for the report form. AZR-350 and AZR-352 are the test issues in Backlog. Close or cancel them when you do not need them.
- Merge the deploy-secrets pull request, start one build of `main` in Buildkite, and leave **Deploy the site** unclicked until that build's test step passes.
