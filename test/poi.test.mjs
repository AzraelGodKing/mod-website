import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleApi } from "../poi/src/index.ts";
import { EVENTS_KEPT, EVENTS_PER_POI, applySnapshot, diffEvents, findPlatformId, parseSnapshot } from "../poi/src/snapshot.mjs";
import { gameVars } from "../src/data/themes.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/poi-snapshot.json", import.meta.url), "utf8"));
const clone = () => structuredClone(fixture);

function fakeKv() {
  const store = new Map();
  let writes = 0;
  return {
    store,
    get writes() {
      return writes;
    },
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value) {
      writes += 1;
      store.set(key, value);
    },
  };
}

function env(extra = {}) {
  return { POI: fakeKv(), POI_INGEST_TOKEN: "ingest-secret", ...extra };
}

// Each call is a fresh minute so the 5-second limit never trips by accident.
let clock = Date.parse("2026-11-09T20:00:00Z");
const tick = (ms = 60_000) => new Date((clock += ms));

function ingest(e, body, { token = "ingest-secret", type = "application/json", now = tick() } = {}) {
  const request = new Request("https://poi.test/api/poi/ingest", {
    method: "POST",
    headers: { "content-type": type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return handleApi(request, e, now);
}

function get(e, path, { headers = {}, now = new Date(clock) } = {}) {
  return handleApi(new Request(`https://poi.test${path}`, { headers }), e, now);
}

test("the fixture is a valid snapshot with the cases the page has to handle", () => {
  const result = parseSnapshot(fixture);
  assert.equal(result.ok, true, result.error);
  const pois = result.snapshot.pois;
  assert.ok(pois.length >= 30);
  assert.ok(pois.some((poi) => poi.status === "contested" && poi.contested.length >= 2));
  assert.ok(pois.some((poi) => poi.coOwners.length > 0));
  assert.ok(pois.some((poi) => poi.trader));
  assert.ok(pois.some((poi) => poi.x === null && poi.z === null));
});

test("ingest refuses everything when no token is configured", async () => {
  const response = await ingest(env({ POI_INGEST_TOKEN: undefined }), fixture);
  assert.equal(response.status, 401);
});

test("ingest refuses a wrong token, a missing token, and non-JSON", async () => {
  const e = env();
  assert.equal((await ingest(e, fixture, { token: "nope" })).status, 401);
  assert.equal((await ingest(e, fixture, { token: null })).status, 401);
  assert.equal((await ingest(e, fixture, { type: "text/plain" })).status, 415);
  assert.equal((await ingest(e, "{not json")).status, 400);
  assert.equal(e.POI.writes, 0);
});

test("ingest stores a snapshot and GET /api/poi returns it with receivedAt and stale", async () => {
  const e = env();
  const now = tick();
  const response = await ingest(e, fixture, { now });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, stored: now.toISOString(), pois: fixture.pois.length });
  const page = await get(e, "/api/poi", { now: new Date(now.getTime() + 60_000) });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "public, max-age=30");
  const data = await page.json();
  assert.equal(data.receivedAt, now.toISOString());
  assert.equal(data.stale, false);
  assert.equal(data.pois.length, fixture.pois.length);
  const later = await (await get(e, "/api/poi", { now: new Date(now.getTime() + 31 * 60_000) })).json();
  assert.equal(later.stale, true);
});

test("bodies over 512 KB are refused", async () => {
  const big = clone();
  big.padding = "x".repeat(600 * 1024);
  assert.equal((await ingest(env(), big)).status, 413);
});

test("schema problems give a 400 with a short reason", async () => {
  const cases = [
    [(s) => (s.schema = 2), /schema/],
    [(s) => (s.pois[0].status = "owned"), /status/],
    [(s) => (s.pois[3].owner = null), /claimed but has no owner/],
    [(s) => (s.pois[1].id = s.pois[0].id), /listed twice/],
    [(s) => (s.generatedAt = "yesterday"), /generatedAt/],
    [(s) => (s.pois[0].x = "12"), /x must be a number/],
  ];
  for (const [change, reason] of cases) {
    const snapshot = clone();
    change(snapshot);
    const response = await ingest(env(), snapshot);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, reason);
  }
});

test("anything that looks like a Steam or platform id, or an IP, is refused", async () => {
  const leaks = [
    (s) => (s.pois[0].owner.id = "76561198012345678"),
    (s) => (s.players[0].name = "Steam_76561198012345678"),
    (s) => (s.players[0].name = "EOS_0002a1b2c3d4e5f6"),
    (s) => (s.players[0].steamId = 76561198012345678),
    (s) => (s.server.name = "Join 203.0.113.7"),
    (s) => (s.players[0].note = "STEAM_0:1:1234567"),
  ];
  for (const leak of leaks) {
    const snapshot = clone();
    leak(snapshot);
    const response = await ingest(env(), snapshot);
    assert.equal(response.status, 400, JSON.stringify(snapshot.players[0]));
    assert.match((await response.json()).error, /Steam or platform id/);
  }
  assert.equal(findPlatformId({ gameVersion: "V3.4 (b6)", day: 42 }), false);
  const version = clone();
  version.server.gameVersion = "2.6.1.3";
  assert.equal(parseSnapshot(version).ok, true);
});

test("unknown fields are dropped, not refused", () => {
  const snapshot = clone();
  snapshot.extra = { anything: true };
  snapshot.pois[0].biome = "forest";
  const result = parseSnapshot(snapshot);
  assert.equal(result.ok, true);
  assert.equal("extra" in result.snapshot, false);
  assert.equal("biome" in result.snapshot.pois[0], false);
});

test("hidden coordinates and hidden names are accepted", () => {
  const snapshot = clone();
  snapshot.settings = { landClaimSize: 41, showNames: false, showCoordinates: false };
  for (const poi of snapshot.pois) Object.assign(poi, { x: null, z: null, sizeX: null, sizeZ: null });
  for (const poi of snapshot.pois) if (poi.owner) poi.owner.name = null;
  for (const player of snapshot.players) player.name = null;
  const result = parseSnapshot(snapshot);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.snapshot.settings.showCoordinates, false);
});

test("a post within 5 seconds of the last one gets a 429", async () => {
  const e = env();
  const first = tick();
  assert.equal((await ingest(e, fixture, { now: first })).status, 200);
  const again = await ingest(e, fixture, { now: new Date(first.getTime() + 2_000) });
  assert.equal(again.status, 429);
  assert.equal(again.headers.get("retry-after"), "5");
});

test("events are written for owner and status changes only, never for heartbeats", async () => {
  const e = env();
  assert.equal((await ingest(e, fixture)).status, 200);
  // The first snapshot is the baseline: no events.
  assert.deepEqual((await (await get(e, "/api/poi/events")).json()).events, []);

  // A heartbeat: same content, new generatedAt. Not written again while recent.
  const heartbeat = clone();
  heartbeat.generatedAt = "2026-11-09T20:10:00Z";
  const writes = e.POI.writes;
  const beat = await (await ingest(e, heartbeat)).json();
  assert.equal(beat.unchanged, true);
  assert.equal(e.POI.writes, writes);

  const changed = clone();
  const gun = changed.pois.find((poi) => poi.name === "store_gun_02");
  Object.assign(gun, { status: "claimed", owner: { id: "p_r5t6y7", name: "Lucid" }, claims: 1, claimedSince: "2026-11-09T20:30:00Z" });
  const farm = changed.pois.find((poi) => poi.name === "farm_01");
  Object.assign(farm, { status: "contested", contested: [{ id: "p_ab12cd", name: "PlayerOne" }, { id: "p_k9m2q1", name: "Wolfie" }] });
  // A name change alone is not an event.
  changed.pois.find((poi) => poi.name === "hospital_01").owner.name = "Lucid2";
  assert.equal((await ingest(e, changed)).status, 200);

  const events = (await (await get(e, "/api/poi/events?limit=50")).json()).events;
  assert.equal(events.length, 2);
  const claim = events.find((event) => event.poi.id === gun.id);
  assert.deepEqual(claim.from, { status: "unclaimed", owner: null });
  assert.deepEqual(claim.to, { status: "claimed", owner: { id: "p_r5t6y7", name: "Lucid" } });
  const history = await (await get(e, `/api/poi/history?poi=${encodeURIComponent(farm.id)}`)).json();
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].to.status, "contested");
  assert.equal((await get(e, "/api/poi/history")).status, 400);
});

test("history keeps 500 events overall and 20 per POI, newest first", () => {
  let state = null;
  const base = parseSnapshot(fixture).snapshot;
  let now = Date.parse("2026-11-09T00:00:00Z");
  state = applySnapshot(state, base, new Date(now)).state;
  for (let i = 0; i < 300; i += 1) {
    const next = structuredClone(base);
    // Two POIs flip owner on every snapshot.
    for (const name of ["store_gun_02", "bank_01"]) {
      const poi = next.pois.find((entry) => entry.name === name);
      Object.assign(poi, { status: "claimed", owner: { id: i % 2 ? "p_ab12cd" : "p_ef34gh", name: null } });
    }
    now += 60_000;
    state = applySnapshot(state, next, new Date(now)).state;
  }
  assert.equal(state.events.length, EVENTS_KEPT);
  const gunId = base.pois.find((poi) => poi.name === "store_gun_02").id;
  assert.equal(state.byPoi[gunId].length, EVENTS_PER_POI);
  assert.ok(Date.parse(state.events[0].at) >= Date.parse(state.events[EVENTS_KEPT - 1].at));
  assert.ok(Date.parse(state.byPoi[gunId][0].at) > Date.parse(state.byPoi[gunId][1].at));
});

test("a new POI that is already claimed writes an event, a new unclaimed one does not", () => {
  const before = parseSnapshot(fixture).snapshot;
  const after = structuredClone(before);
  after.pois.push({ ...after.pois[0], id: "new_claimed@1,1", name: "new_claimed", coOwners: [] });
  after.pois.push({ ...after.pois[1], id: "new_open@2,2", name: "new_open" });
  const events = diffEvents(before, after, "2026-11-09T21:00:00Z");
  assert.deepEqual(events.map((event) => event.poi.id), ["new_claimed@1,1"]);
});

test("with a view token the data needs the cookie or a Bearer header", async () => {
  const e = env({ POI_VIEW_TOKEN: "view-secret" });
  assert.equal((await ingest(e, fixture)).status, 200);
  for (const path of ["/api/poi", "/api/poi/events", "/api/poi/history?poi=x"]) {
    const locked = await get(e, path);
    assert.equal(locked.status, 401);
    assert.equal((await locked.json()).locked, true);
  }
  const bearer = await get(e, "/api/poi", { headers: { authorization: "Bearer view-secret" } });
  assert.equal(bearer.status, 200);
  assert.equal(bearer.headers.get("cache-control"), "no-store");

  const wrong = await handleApi(new Request("https://poi.test/api/poi/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "guess" }) }), e);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  const login = await handleApi(new Request("https://poi.test/api/poi/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "view-secret" }) }), e);
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!setCookie.includes("view-secret"));
  const cookie = setCookie.split(";")[0];
  assert.equal((await get(e, "/api/poi", { headers: { cookie } })).status, 200);
  assert.equal((await get(e, "/api/poi", { headers: { cookie: "poi_view=forged" } })).status, 401);
});

test("the health endpoint is open and holds no POI data", async () => {
  const e = env({ POI_VIEW_TOKEN: "view-secret" });
  const empty = await (await get(e, "/api/poi/health")).json();
  assert.equal(empty.stale, true);
  assert.equal(empty.receivedAt, null);
  assert.equal((await get(e, "/api/poi")).status, 401);
  await ingest(e, fixture);
  const response = await get(e, "/api/poi/health");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.stale, false);
  assert.deepEqual(Object.keys(body).sort(), ["minutesSinceReport", "ok", "receivedAt", "stale"]);
});

test("before the first report /api/poi says so", async () => {
  const response = await get(env(), "/api/poi");
  assert.equal(response.status, 404);
  assert.equal((await response.json()).empty, true);
});

test("the page uses the 7 Days to Die colours from themes.ts", () => {
  const css = readFileSync(new URL("../poi/public/style.css", import.meta.url), "utf8");
  for (const pair of gameVars("7-days-to-die").split(";")) {
    const [name, value] = [pair.slice(0, pair.indexOf(":")), pair.slice(pair.indexOf(":") + 1)];
    assert.ok(css.includes(`${name}:${value};`), `${name} should be ${value}`);
  }
});

test("the page loads nothing from other sites", () => {
  for (const file of ["index.html", "app.js", "style.css"]) {
    const text = readFileSync(new URL(`../poi/public/${file}`, import.meta.url), "utf8");
    const urls = [...text.matchAll(/(?:src|href)=["'](https?:[^"']+)["']/g)].map((match) => match[1]);
    // Links out are fine; the only thing loaded from elsewhere is the site's own favicon.
    for (const url of urls) assert.ok(url.startsWith("https://azraelsmods.com"), `${file} loads ${url}`);
    assert.ok(!/@import|fonts\.googleapis|cdn\.|unpkg|jsdelivr|analytics|gtag/.test(text), `${file} pulls in something external`);
  }
});

test("the day endpoint is open and gives only the in-game day", async () => {
  const e = env({ POI_VIEW_TOKEN: "view-secret" });
  assert.deepEqual(await (await get(e, "/api/poi/day")).json(), { day: null, fresh: false, receivedAt: null });
  await ingest(e, fixture);
  const body = await (await get(e, "/api/poi/day")).json();
  assert.equal(body.day, fixture.server.day);
  assert.equal(body.fresh, true);
  assert.deepEqual(Object.keys(body).sort(), ["day", "fresh", "receivedAt"]);
});

// ---------- world map ----------

// A real 1x1 PNG with the IHDR width and height swapped for the size the test wants.
function png(width = 4096, height = width, extra = 0) {
  const base = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const bytes = new Uint8Array(base.length + extra);
  bytes.set(base);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function putMap(e, layer, body, { token = "ingest-secret", query = "world=Old%20Honihebu%20County&size=4096" } = {}) {
  const request = new Request(`https://poi.test/api/poi/map/${layer}?${query}`, {
    method: "PUT",
    headers: { "content-type": "image/png", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });
  return handleApi(request, e, tick());
}

test("map upload needs the ingest token and a PNG", async () => {
  const e = env();
  assert.equal((await putMap(e, "biomes", png(), { token: "" })).status, 401);
  assert.equal((await putMap(e, "biomes", png(), { token: "wrong" })).status, 401);
  assert.equal((await putMap(e, "biomes", new TextEncoder().encode("not a png"))).status, 400);
  assert.equal((await putMap(e, "water", png())).status, 404);
  assert.equal((await putMap(e, "biomes", png(), { query: "world=x&size=12" })).status, 400);
  assert.equal(e.POI.writes, 0);
});

test("a map upload is stored once, and the page gets it with the snapshot", async () => {
  const e = env();
  assert.equal((await ingest(e, clone())).status, 200);
  const first = await putMap(e, "biomes", png());
  assert.equal(first.status, 200);
  const { hash } = await first.json();
  const writes = e.POI.writes;
  const again = await (await putMap(e, "biomes", png())).json();
  assert.equal(again.unchanged, true);
  assert.equal(e.POI.writes, writes, "the same image is not written again");

  const data = await (await get(e, "/api/poi")).json();
  assert.deepEqual(data.map, { world: "Old Honihebu County", size: 4096, layers: { biomes: { hash: hash.slice(0, 16), width: 4096, height: 4096 } } });

  const image = await get(e, `/api/poi/map/biomes?v=${hash.slice(0, 16)}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.match(image.headers.get("cache-control"), /immutable/);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), png());
  assert.equal((await get(e, "/api/poi/map/roads")).status, 404);

  const status = await (await get(e, "/api/poi/map/status", { headers: { authorization: "Bearer ingest-secret" } })).json();
  assert.equal(status.layers.biomes.hash, hash);
});

test("the size defaults to the image width, and a new world drops the old world's layers", async () => {
  const e = env();
  await putMap(e, "biomes", png(6144), { query: "world=Navezgane" });
  await putMap(e, "roads", png(6144, 6144, 1), { query: "world=Navezgane" });
  let status = await (await get(e, "/api/poi/map/status")).json();
  assert.equal(status.size, 6144);
  assert.deepEqual(Object.keys(status.layers).sort(), ["biomes", "roads"]);

  await putMap(e, "biomes", png(8192), { query: "world=New%20World&size=8192" });
  status = await (await get(e, "/api/poi/map/status")).json();
  assert.equal(status.world, "New World");
  assert.deepEqual(Object.keys(status.layers), ["biomes"]);
});

test("with a view token the map images need the login too", async () => {
  const e = env({ POI_VIEW_TOKEN: "view-secret" });
  await putMap(e, "biomes", png());
  assert.equal((await get(e, "/api/poi/map/biomes")).status, 401);
  assert.equal((await get(e, "/api/poi/map/status")).status, 401);
  assert.equal((await get(e, "/api/poi/map/biomes", { headers: { authorization: "Bearer view-secret" } })).status, 200);
  assert.equal((await get(e, "/api/poi/map/status", { headers: { authorization: "Bearer ingest-secret" } })).status, 200);
});
