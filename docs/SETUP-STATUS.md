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
- `mod.json` is written for 9 RimWorld mods, 14 Sun Haven mods, and 5 7 Days to Die mods. Local site build lists them. Pages link to `downloads.azraelsmods.com`. Azrael and Living World link Download to `/not-ready` instead.
- R2 bucket `azraels-mods` is in ENAM. Public downloads are at `https://downloads.azraelsmods.com`, laid out as `<game>/<mod>/<version>/<mod>-<version>.zip` plus a `.sha256` file. The r2.dev address remains for testing.
- Cloudflare emails the account billing address when spend reaches $1. That alert does not stop uploads or downloads. R2 has no hard monthly cap; usage past the free tier is billed.
- Each mod page has a report form. The Worker checks Turnstile, trims the text, strips HTML, and creates a Linear issue with that mod's label and the `website` label. The Turnstile widget allows `localhost`, `127.0.0.1`, `azraelsmods.com`, `www.azraelsmods.com`, and `azraels-mods-website.azraelgodking95.workers.dev`. The form is deployed.

## In progress

- Codebase is the mirror. This machine does not push there. The Origin CLI does not run on native Windows, and `git push` to Codebase was rejected.
- `mod.json` is on `main` in the three mod repos. The site build reads those `main` branches.
- The report form runs locally with `npm run dev:worker`. A Linear key is in `.dev.vars`. Test reports AZR-350 and AZR-352 are in Backlog.
- KatsRics is a separate worker, `kats-rics`, at `kats.azraelsmods.com`. It is not linked from the mod pages. The upload password is `kats/.dev.vars`. The mods Buildkite pipeline does not deploy this worker.
- Buildkite agents `site` and `deploy` are connected on this machine. The site is deployed at `https://azraelsmods.com`. The workers.dev address still works.

## Waiting on me

- Nothing for the report form. AZR-350 and AZR-352 are the test issues in Backlog. Close or cancel them when you do not need them.
- Confirm a Buildkite deploy of `main` if the live mod pages still use the GitHub zip links.
