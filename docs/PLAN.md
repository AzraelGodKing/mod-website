# Plan

Static site for AzraelGodKing's mods. Source of truth for this plan is this file.

## Decisions

- Site repo we edit: GitHub `AzraelGodKing/mod-website`. Local clone: `F:\Repositories\mod-website`. Codebase `azraelgodking/Azraels_Mods_Website` is a mirror of that GitHub repo. Do not push to Codebase from this Windows machine. The Origin CLI does not run here, and the saved Codebase token was rejected.
- Mod repos, confirmed: `AzraelGodKing/rimworld_mods`, `AzraelGodKing/SunhavenMod`, `AzraelGodKing/7d2d_mods`. Every mod in those repos is in scope. Do not mirror `7d2d_mods` into Codebase. The site reads the public GitHub repo.
- Catalog file is `mod.json` inside each mod folder, not one file for the whole repo. Libraries (`SharedUtilities`, `TheVault.Abstractions`) are left out.
- Linear workspace `AzraelGodKing`, team `AzraelGodKing`, is on Basic. Confirmed price: $12 per user per month.
- Report form is on `main` and is not deployed. The Linear key is stored in `.dev.vars` on this machine. Test reports AZR-350 and AZR-352 are in Backlog.
- Hosting path stays Buildkite plus Wrangler, on free tiers, until a later decision changes it.

## Verification

Checked 2026-10-02. Re-check before relying on a vendor UI.

- Linear personal API keys can be limited to **Create issues** and to specific teams. Source: Linear docs, API and Webhooks.
- The team has no Triage status, so the Triage inbox is off. Linear's Triage inbox is a team setting. Triage Intelligence, Triage Rules, and Triage Responsibility are Business and Enterprise only. An approval queue is out of scope until asked.
- Cloudflare Workers Builds can connect to Cursor Origin (Codebase) repositories. Documented 2026-09-22. A GitHub mirror is not required for Cloudflare to build this repo.
- Personal Codebase repositories are always private. There is no public visibility. The deployed site can still be public. The site source cannot be public while it lives only in this personal Codebase repo.
- Buildkite Pipelines can connect to Origin-hosted repositories through the Origin app. That app does not build repositories that are only GitHub mirrors. Signing up to Buildkite through Origin starts a 30-day evaluation trial. If nothing is chosen when the trial ends, the Buildkite organization becomes inactive. The Free plan is the intended landing spot. Checkout tokens for private Origin repos are issued to Buildkite-hosted agents. Self-hosted agents need their own checkout credentials.
- The Origin CLI does not support native Windows. Push from this machine is not verified yet.

## GitHub mirror tradeoff

Stay on Codebase only:

- Matches the choice to keep the site in Codebase.
- Cloudflare can build it directly. Workers Builds deploys on each push to the production branch, which is looser than "only I can trigger builds."
- Buildkite can build this repo because it is Origin-hosted.
- The source stays private.

Mirror to GitHub:

- Would match the public mod repos.
- Inbound mirrors (GitHub into Codebase) already exist for other repos. An outbound mirror from Codebase to GitHub is not verified.
- Buildkite's Origin app does not build a GitHub mirror. Those pipelines use GitHub.
- Two hosts means one of them is a copy. If GitHub is the source, this Codebase repo stops being the source.

## Brief

A static website, in Codebase repo `azraelgodking/Azraels_Mods_Website`, separate from the three mod repos, that:

- shows mods for three games (RimWorld, Sun Haven, 7 Days to Die), with one page per game and one per mod
- offers direct mod downloads from Cloudflare R2, as an alternative to Steam, Thunderstore, and Nexus
- has a report form that creates issues in Linear

Repos for the mods are public. Prefer free services. Ask before using anything paid.

### Work in this order

1. Linear Basic is done. Do not deploy the report form until the later form step, and do not deploy it before the checks in that step pass.
2. Site repo: an Astro project, deployed to Cloudflare by a Buildkite pipeline running Wrangler. Cloudflare Workers Builds can read this Codebase repo. The pipeline still uses Buildkite so builds stay manually triggered.
3. Mod data: each mod repo gets a `mod.json` (name, game, description, version, screenshots, download file, Steam/Thunderstore/Nexus links). The site build reads them from the three repos.
4. Downloads: an R2 bucket on a custom domain, laid out as `<game>/<mod>/<version>/<mod>-<version>.zip` plus a `.sha256` file. Public builds only, with no copyrighted assets. Each mod's release pipeline uploads with a token scoped to that one bucket.
5. Report form: Cloudflare Turnstile plus a Cloudflare function that verifies the token on the server, validates and trims input, strips HTML, and creates the Linear issue with the team, the mod's label, and a `website` label.
6. Build agents: Buildkite Free agents in Docker Compose on this machine. Each mod pipeline builds, zips, checksums, uploads to R2, then triggers the site pipeline. Only the owner can trigger builds: no pull request or fork builds, a branch or tag filter, and deploys on their own queue.

Later, only if asked: an approval queue for reports.

### Services

Free tiers first: Cloudflare Workers free, R2 free tier (10 GB, 1 million writes, 10 million reads a month), Turnstile free, Buildkite Free. Warn before anything could cost money.

Use original screenshots and branding. Do not use official game art or logos.

### Secrets

Never put a token or key in chat or in a git repo. Store secrets in a Cloudflare secret, the Buildkite agent environment, or a gitignored local file.
