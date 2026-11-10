# poi.azraelsmods.com

A private page that shows which player holds which POI on Azrael's 7 Days to Die server.
The **POI Registry** server mod (in `7d2d_mods`, never listed on azraelsmods.com) works out
ownership from land claims and posts a JSON snapshot here. This Worker keeps the latest
snapshot and a short history, and the page in `public/` shows it.

## Secrets

Set with `npx wrangler secret put <NAME> --config poi/wrangler.jsonc`, or put them on the deploy
agent (`.buildkite/deploy.env`) and `scripts/ci-deploy.sh` sets them after each deploy.

| Name | Needed | What it does |
| --- | --- | --- |
| `POI_INGEST_TOKEN` | Yes | The game server mod sends it as `Authorization: Bearer <token>`. Without it, `/api/poi/ingest` refuses every post. |
| `POI_VIEW_TOKEN` | No, but set it | The page password. When set, the page shows a password form first and `/api/poi`, `/api/poi/events` and `/api/poi/history` need the login cookie or `Authorization: Bearer <token>`. When it is not set, the page is public. |

Set both. The data shows where players' bases are, so the page should stay private unless
everyone on the server is happy with it being public. To make it public later, remove
`POI_VIEW_TOKEN` from the deploy agent and run
`npx wrangler secret delete POI_VIEW_TOKEN --config poi/wrangler.jsonc`.

Use long random values (for example `openssl rand -hex 24`). Tokens are compared in constant
time, and the login cookie holds a hash of the password, not the password.

## API

| Route | Who | What |
| --- | --- | --- |
| `POST /api/poi/ingest` | Game server | Stores a snapshot. JSON, at most 512 KB, one post per 5 seconds (429 otherwise). Answers `{ "ok": true, "stored": "<ISO time>", "pois": <n> }`; a repeat of the stored snapshot within 5 minutes also has `"unchanged": true` and is not written again. |
| `GET /api/poi` | Page | The snapshot plus `receivedAt` and `stale` (no report for 30 minutes). 404 with `"empty": true` before the first report. |
| `GET /api/poi/events?limit=50` | Page | The latest ownership changes across all POIs, newest first (up to 500). |
| `GET /api/poi/history?poi=<id>` | Page | The last 20 changes for one POI. |
| `GET /api/poi/health` | Status page | `{ ok, receivedAt, minutesSinceReport, stale }`. Open even when the page is locked; it has no POI data. |
| `POST /api/poi/login`, `POST /api/poi/logout` | Page | Sets or clears the login cookie (30 days). |
| `PUT /api/poi/map/biomes`, `PUT /api/poi/map/roads` | Game server | Stores the world's `biomes.png` or `splat3.png` (PNG, at most 24 MB, ingest token). `?world=<name>&size=<metres>`; without `size` the image width is used. The same image is not written again; a layer from another world is dropped. |
| `GET /api/poi/map/status` | Game server or page | `{ world, size, layers: { biomes: { hash, bytes, width, height, uploadedAt }, roads: … } }`. The mod compares the full SHA-256 `hash` before uploading. |
| `GET /api/poi/map/biomes?v=<hash>`, `GET /api/poi/map/roads?v=<hash>` | Page | The PNG. With the current hash (first 16 characters, from `map` in `GET /api/poi`) it is cached for a year. |

An event is written when a POI's `status` or `owner.id` changes:
`{ at, poi: { id, name }, from: { status, owner }, to: { status, owner } }`. The first
snapshot ever stored is the starting point and writes none. Heartbeats and repeats write none.

Everything lives in one KV value (`state` in the `POI` namespace): the snapshot, the last 500
events, and the last 20 per POI. That is one KV write per changed snapshot and none for a
repeat within 5 minutes, which keeps a mod that posts every minute well inside KV's limits.

## Snapshot

The shape is the contract with the mod. Do not rename fields without changing the mod too.
`test/fixtures/poi-snapshot.json` is a full example (30 POIs, a contested one, co-owned ones,
traders, and one without coordinates).

- `status` is `unclaimed`, `claimed` or `contested`. A `claimed` POI needs an `owner`.
  `contested` lists the players whose claims overlap it.
- Player ids are opaque hashes from the mod. A payload with anything that looks like a Steam,
  Epic, Xbox or PlayStation id, or an IP address, is refused with a 400.
- `x` and `z` are the POI's south-west corner (lowest x and z); the POI covers `x .. x + sizeX` and `z .. z + sizeZ`.
- `x`, `z`, `sizeX`, `sizeZ` can be `null` (`settings.showCoordinates: false`); the map tab
  is hidden then. `owner.name` can be `null` (`settings.showNames: false`); the page shows
  "Player 1", "Player 2" and so on, numbered by id.
- Unknown fields are dropped, not refused.

## Try it without the game

```sh
# Local: npm run dev:poi -- --var POI_INGEST_TOKEN:local-test
curl -sS -X POST http://localhost:8787/api/poi/ingest \
  -H "Authorization: Bearer local-test" \
  -H "Content-Type: application/json" \
  --data-binary @test/fixtures/poi-snapshot.json

# Live
curl -sS -X POST https://poi.azraelsmods.com/api/poi/ingest \
  -H "Authorization: Bearer $POI_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @test/fixtures/poi-snapshot.json
```

Posting the fixture to the live site replaces the real snapshot until the game server posts
again, and its changes go into the activity feed, so use it before the mod is running.

## Status

`status.azraelsmods.com` checks the page and `/api/poi/health` every 5 minutes. The POI page
is left off the public status page. A stale report shows as degraded (the game server is just
off) and does not ping Discord; the page not answering is down and does.

## World map

The Map tab draws the world under the POIs once the mod has uploaded it (POI Registry 1.1.0 and later,
with `ShowCoordinates=on` and `UploadMap=on`). The page recolours `biomes.png` (forest, burnt forest, desert,
snow, wasteland) and lays the roads from `splat3.png` on top, in one canvas of up to 3072 px (2048 on phones).
The image's top-left corner is the world's north-west corner and 0,0 is the middle. The Terrain button hides it.
