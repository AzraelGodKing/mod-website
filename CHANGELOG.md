# Changelog

## Unreleased

- Added the site plan and setup status for the Codebase repo.
- Added a static Astro shell with one page per game.
- Mod pages now read `mod.json` from the three mod repos.
- Created the Standard R2 bucket `azraels-mods` and turned on its public r2.dev address.
- Lowered the Cloudflare budget email from $10 to $1 so spend past the free tier sends a warning. The alert does not stop usage.
- Added a report form on each mod page. Turnstile is checked on the server, the text is trimmed and HTML is stripped, and a Linear issue is created with that mod's label and the `website` label.
- The report label now comes from the mod page address, so a report sent from Homesteader is tagged Homesteader.
- Website reports also get a game label: RimWorld, Sun Haven, or 7 Days to Die.
