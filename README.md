# Azrael's Mods

Static site for RimWorld, Sun Haven, and 7 Days to Die mods. The plan is in `docs/PLAN.md`. Setup progress is in `docs/SETUP-STATUS.md`.

```powershell
npm install
npm run dev
```

The report form is served by the Worker, so use `npm run dev:worker` to try it. `npm run dev` is the static site only.

`npm run deploy` builds the site and runs Wrangler. A merge to `main` does that through Buildkite. The agents are the Docker Compose services in this repo.

`/admin` signs in with a passkey or the `ADMIN_TOKEN` Worker secret. Its tabs: Overview (totals and health checks), Downloads (every counter, sortable, Export CSV), Releases (build versions against `downloads.json`), Activity (this site's Download clicks), History (daily clicks and store downloads), and Sign-in (passkeys, sessions, Sign out everywhere). Locked out? Set a new `ADMIN_TOKEN` in the Cloudflare dashboard (Worker → Settings → Variables and Secrets) or with `npx wrangler secret put ADMIN_TOKEN`, sign in with it, and add a passkey under Passkeys. To try passkeys under `npm run dev:worker`, put `ADMIN_ORIGIN=http://localhost:8787` in `.dev.vars` and open `http://localhost:8787/admin`.

New mod versions are posted to Discord after each deploy when the deploy agent has `DISCORD_WEBHOOK_URL` set (in `.buildkite/deploy.env`). Create the webhook in Discord under the channel's Settings → Integrations → Webhooks.

Known issues on mod pages come from Linear: open issues with the mod's label in Todo or In Progress. Set a read-access Linear key as the `LINEAR_READ_KEY` Worker secret (`npx wrangler secret put LINEAR_READ_KEY`); without it the Worker tries `LINEAR_API_KEY`, which only works if that key can read.

Mod pages show changelogs read from the mod repos at build time; `scripts/release-notes.mjs` lists where each game's notes come from.
