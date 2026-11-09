# Subdomains

Each is its own small Worker, deployed by `scripts/ci-deploy.sh` after the main site. A failed subdomain deploy leaves the rest live.

| Site | Folder | What it does |
| --- | --- | --- |
| kats.azraelsmods.com | `kats/` | Kat's RICS chat coin catalog (see `kats/README.md`). |
| docs.azraelsmods.com | `docs-site/` | Guides for Modwright and Survivor's Toolkit, built on request from each repo's `README.md` (one page per `##` section) and `CHANGELOG.md`. GitHub copies are cached 10 minutes; the last good copy is kept a week in case GitHub is down. |
| live.azraelsmods.com | `live/` | OBS overlay. `/` builds an `/overlay?...` link; the overlay cycles through picked mods (from `/releases.json`) and Kat's RICS lists (from `kats.azraelsmods.com/data/*.json`). |
| poi.azraelsmods.com | `poi/` | Private. Which player holds which POI on Azrael's 7 Days to Die server, posted by the POI Registry server mod. Password-protected with `POI_VIEW_TOKEN`; not linked from the main site or the public status page. See `poi/README.md`. |
| status.azraelsmods.com | `status/` | Cron every 5 minutes checks each site, the download list, a few mod files per run (round robin), and the tool releases (every 30 min). A day of history is kept in KV. A service is down after 2 failed runs in a row. |

- Local: `npm run dev:docs`, `npm run dev:live`, `npm run dev:status`, `npm run dev:poi`.
- Private mods: a `mod.json` with `"private": true` is skipped by the catalog build, so it gets no page, count, download link, release, feed item, sitemap entry, badge or status check (`isPrivateMod` in `src/downloads/latest.mjs`).
- Status alerts: set `STATUS_WEBHOOK_URL` (a Discord webhook) on the deploy agent. Without it the page still works, it just doesn't ping.
- The Ko-fi link and subdomain list shared with the main site are in `src/data/links.mjs`.
