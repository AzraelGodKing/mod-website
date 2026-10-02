# Changelog

## Unreleased

- The workers.dev address stays on when the site is deployed.
- Each game keeps its own page, and each mod is colored from that mod inside the game.
- Every page links RimWorld, Sun Haven, and 7 Days to Die, and each mod page links the other mods for that game.
- Mod pages link to the public zip on `downloads.azraelsmods.com`, with a checksum file beside it.
- The 7 Days to Die mods use those same download links. Azrael and Living World send Download to a not-ready page.
- The site is served on `azraelsmods.com` and `www.azraelsmods.com`.
- The build writes the catalog before the tests run, so the report tests can load `catalog.json`.
- The site build reads `mod.json` from `main` in the three mod repos.
- The deploy step stores the report-form secrets on the worker and refuses a hostname list that includes localhost.
- Added a Buildkite pipeline that tests and builds the site, then deploys only after a manual confirmation. The deploy agent is the only one with the Cloudflare token.
- Added the site plan and setup status for the Codebase repo.
- Added a static Astro shell with one page per game.
- Mod pages now read `mod.json` from the three mod repos.
- Created the Standard R2 bucket `azraels-mods` and turned on its public r2.dev address.
- Lowered the Cloudflare budget email from $10 to $1 so spend past the free tier sends a warning. The alert does not stop usage.
- Added a report form on each mod page. Turnstile is checked on the server, the text is trimmed and HTML is stripped, and a Linear issue is created with that mod's label and the `website` label.
- The report label now comes from the mod page address, so a report sent from Homesteader is tagged Homesteader.
- Website reports also get a game label: RimWorld, Sun Haven, or 7 Days to Die.
- Site edits now happen in the GitHub repo. Codebase receives them through the mirror.
