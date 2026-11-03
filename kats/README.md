# Kat's RICS

The chat coin catalog at `kats.azraelsmods.com`: a Vue app (`web/`), an upload page (`portal/`), and a Worker (`src/index.ts`) that serves catalog lists from the `kats-rics-catalog` R2 bucket.

- `npm run build:kats` builds `kats/assets` (the app, `upload.html`, `portal.js`, `unrar.wasm`).
- `npm run dev:kats` runs it locally with Wrangler. Put `KATS_UPLOAD_TOKEN=...` in `kats/.dev.vars` to try uploads.
- `npm run deploy:kats` deploys it. The Buildkite deploy runs this after the main site.

## Catalog data

`web/public/data/*.json` is the copy shipped with the site. It is used until an upload replaces a list.

An upload at `/upload` reads the CAP export (`.rar`) and `Genes.json` / `Backstories.json` in the browser, turns them into compact row lists, compares them with the live lists, and sends them to the Worker:

1. `POST /api/revisions` starts a revision.
2. `PUT /api/revisions/<id>/<list>` stages each list under `rev/<id>/`.
3. `POST /api/revisions/<id>/commit` checks every list is there and writes `meta/current.json`, which points each list at its revision and keeps the one before it.

Nothing changes for viewers until step 3. `POST /api/rollback` makes the previous `meta/current.json` current again. Lists that have never been uploaded through a revision are read from the older `data/<list>.json` keys, then from the shipped copy.

`GET /data/meta.json` gives the update time, the saved comparison (for the Changes page), and the gene edit rates. Viewer lists and settings backups are never uploaded.

Every `/api/*` request needs the upload password and counts toward a limit of 30 a minute per address (`UPLOAD_LIMIT` in `wrangler.jsonc`).
