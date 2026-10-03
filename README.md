# Azrael's Mods

Static site for RimWorld, Sun Haven, and 7 Days to Die mods. The plan is in `docs/PLAN.md`. Setup progress is in `docs/SETUP-STATUS.md`.

```powershell
npm install
npm run dev
```

The report form is served by the Worker, so use `npm run dev:worker` to try it. `npm run dev` is the static site only.

`npm run deploy` builds the site and runs Wrangler. A merge to `main` does that through Buildkite. The agents are the Docker Compose services in this repo.
