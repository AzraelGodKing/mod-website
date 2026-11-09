// poi.azraelsmods.com: checks the snapshot the POI Registry mod posts, works out what
// changed since the last one, and shapes what the page reads. No Worker APIs here, so
// test/poi.test.mjs can run it in Node.
//
// The snapshot shape is the contract with the mod (7d2d_mods). Change a field name here
// only together with the mod.

export const SCHEMA = 1;
export const MAX_BODY_BYTES = 512 * 1024;
// No report for this long means the game server or the mod is off.
export const STALE_MINUTES = 30;
// One accepted post per this many seconds.
export const MIN_POST_SECONDS = 5;
// A snapshot identical to the stored one is not written again until the stored one is
// this old, so heartbeats keep the "updated" time fresh without a KV write each time.
export const REWRITE_SAME_MINUTES = 5;
export const EVENTS_KEPT = 500;
export const EVENTS_PER_POI = 20;

const STATUSES = new Set(["unclaimed", "claimed", "contested"]);
const MAX_POIS = 10_000;
const MAX_PLAYERS = 2_000;
const MAX_TEXT = 200;

class Invalid extends Error {}

// Things that look like a Steam, Epic, Xbox or PlayStation account id, or an IP address.
// Player ids from the mod are opaque hashes, so any of these means the mod is leaking one.
const PLATFORM_ID = [
  /7656119\d{10}/,
  /STEAM_[0-5]:[01]:\d+/i,
  /\[U:1:\d+\]/i,
  /\b(?:Steam|EOS|XBL|PSN)_[0-9A-Za-z]{6,}/i,
];
const IP_ADDRESS = /(?:^|[^\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])|\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){7}\b/i;

function looksPersonal(text) {
  return PLATFORM_ID.some((pattern) => pattern.test(text)) || IP_ADDRESS.test(text);
}

/** True when any key or value anywhere in the payload looks like a platform id or an IP. */
export function findPlatformId(value, depth = 0) {
  if (depth > 12) return false;
  if (typeof value === "string") return looksPersonal(value);
  if (typeof value === "number") return value >= 7.6561190e16 && value < 7.6561200e16;
  if (Array.isArray(value)) return value.some((item) => findPlatformId(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => looksPersonal(key) || findPlatformId(item, depth + 1));
  }
  return false;
}

function text(value, where, { nullable = false, max = MAX_TEXT } = {}) {
  if (value === undefined || value === null) {
    if (nullable) return null;
    throw new Invalid(`${where} is required`);
  }
  if (typeof value !== "string") throw new Invalid(`${where} must be text`);
  const trimmed = value.trim();
  if (!trimmed && !nullable) throw new Invalid(`${where} is empty`);
  if (trimmed.length > max) throw new Invalid(`${where} is longer than ${max} characters`);
  return trimmed || null;
}

function number(value, where, { nullable = true, integer = false, min = -Infinity } = {}) {
  if (value === undefined || value === null) {
    if (nullable) return null;
    throw new Invalid(`${where} is required`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Invalid(`${where} must be a number`);
  if (integer && !Number.isInteger(value)) throw new Invalid(`${where} must be a whole number`);
  if (value < min) throw new Invalid(`${where} is too small`);
  return value;
}

function time(value, where, { nullable = true } = {}) {
  if (value === undefined || value === null) {
    if (nullable) return null;
    throw new Invalid(`${where} is required`);
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Invalid(`${where} must be an ISO time`);
  return new Date(value).toISOString();
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function object(value, where, { nullable = false } = {}) {
  if (value === undefined || value === null) {
    if (nullable) return null;
    throw new Invalid(`${where} is required`);
  }
  if (typeof value !== "object" || Array.isArray(value)) throw new Invalid(`${where} must be an object`);
  return value;
}

function list(value, where, max) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Invalid(`${where} must be a list`);
  if (value.length > max) throw new Invalid(`${where} has more than ${max} entries`);
  return value;
}

function playerId(value, where) {
  const id = text(value, where, { max: 64 });
  if (!/^[A-Za-z0-9_.:-]+$/.test(id)) throw new Invalid(`${where} has characters an id can't have`);
  return id;
}

function playerRef(value, where, { nullable = false } = {}) {
  const ref = object(value, where, { nullable });
  if (!ref) return null;
  return { id: playerId(ref.id, `${where}.id`), name: text(ref.name, `${where}.name`, { nullable: true, max: 64 }) };
}

function poi(value, index) {
  const where = `pois[${index}]`;
  const raw = object(value, where);
  const status = text(raw.status, `${where}.status`);
  if (!STATUSES.has(status)) throw new Invalid(`${where}.status must be unclaimed, claimed or contested`);
  const owner = playerRef(raw.owner, `${where}.owner`, { nullable: true });
  if (status === "claimed" && !owner) throw new Invalid(`${where} is claimed but has no owner`);
  const tier = number(raw.tier, `${where}.tier`, { integer: true, min: 0 });
  return {
    id: text(raw.id, `${where}.id`),
    name: text(raw.name, `${where}.name`),
    displayName: text(raw.displayName, `${where}.displayName`, { nullable: true }),
    tier,
    x: number(raw.x, `${where}.x`),
    z: number(raw.z, `${where}.z`),
    sizeX: number(raw.sizeX, `${where}.sizeX`, { min: 0 }),
    sizeZ: number(raw.sizeZ, `${where}.sizeZ`, { min: 0 }),
    trader: bool(raw.trader, false),
    status,
    owner,
    coOwners: list(raw.coOwners, `${where}.coOwners`, 64).map((ref, i) => playerRef(ref, `${where}.coOwners[${i}]`)),
    contested: list(raw.contested, `${where}.contested`, 64).map((ref, i) => playerRef(ref, `${where}.contested[${i}]`)),
    claims: number(raw.claims, `${where}.claims`, { integer: true, min: 0 }) ?? 0,
    claimedSince: time(raw.claimedSince, `${where}.claimedSince`),
  };
}

function player(value, index) {
  const where = `players[${index}]`;
  const raw = object(value, where);
  return {
    id: playerId(raw.id, `${where}.id`),
    name: text(raw.name, `${where}.name`, { nullable: true, max: 64 }),
    online: bool(raw.online, false),
    lastSeen: time(raw.lastSeen, `${where}.lastSeen`),
    claimedPois: number(raw.claimedPois, `${where}.claimedPois`, { integer: true, min: 0 }) ?? 0,
  };
}

/**
 * Checks a posted snapshot and keeps only the known fields (unknown ones are dropped, not
 * refused). Returns { ok: true, snapshot } or { ok: false, error }.
 */
export function parseSnapshot(payload) {
  try {
    const raw = object(payload, "The body");
    if (raw.schema !== SCHEMA) throw new Invalid(`schema must be ${SCHEMA}`);
    // The game version ("1.2.3.4") can look like an IP address, so it only gets the id check.
    const version = raw.server?.gameVersion;
    const versionLeaks = typeof version === "string" && PLATFORM_ID.some((pattern) => pattern.test(version));
    if (versionLeaks || findPlatformId({ ...raw, server: { ...(raw.server ?? {}), gameVersion: null } })) throw new Invalid("The snapshot holds something that looks like a Steam or platform id or an IP address");
    const server = object(raw.server, "server");
    const settings = object(raw.settings, "settings", { nullable: true }) ?? {};
    const seed = server.seed;
    if (seed !== undefined && seed !== null && typeof seed !== "string" && typeof seed !== "number") throw new Invalid("server.seed must be text or a number");
    const pois = list(raw.pois, "pois", MAX_POIS).map(poi);
    const ids = new Set();
    for (const entry of pois) {
      if (ids.has(entry.id)) throw new Invalid(`POI id ${entry.id} is listed twice`);
      ids.add(entry.id);
    }
    return {
      ok: true,
      snapshot: {
        schema: SCHEMA,
        server: {
          name: text(server.name, "server.name", { nullable: true }),
          world: text(server.world, "server.world", { nullable: true }),
          seed: typeof seed === "string" ? text(seed, "server.seed", { nullable: true }) : seed ?? null,
          gameVersion: text(server.gameVersion, "server.gameVersion", { nullable: true }),
          day: number(server.day, "server.day", { integer: true, min: 0 }),
        },
        generatedAt: time(raw.generatedAt, "generatedAt", { nullable: false }),
        settings: {
          landClaimSize: number(settings.landClaimSize, "settings.landClaimSize", { min: 0 }),
          showNames: bool(settings.showNames, true),
          showCoordinates: bool(settings.showCoordinates, true),
        },
        pois,
        players: list(raw.players, "players", MAX_PLAYERS).map(player),
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

function ownerOf(entry) {
  return entry?.owner ? { id: entry.owner.id, name: entry.owner.name } : null;
}

/**
 * One event per POI whose status or owner changed. The first snapshot ever stored sets the
 * baseline and writes none, and a POI that shows up already unclaimed writes none either.
 */
export function diffEvents(previous, next, at) {
  if (!previous) return [];
  const before = new Map(previous.pois.map((entry) => [entry.id, entry]));
  const events = [];
  for (const entry of next.pois) {
    const old = before.get(entry.id);
    const from = old ? { status: old.status, owner: ownerOf(old) } : { status: "unclaimed", owner: null };
    const to = { status: entry.status, owner: ownerOf(entry) };
    if (from.status === to.status && (from.owner?.id ?? null) === (to.owner?.id ?? null)) continue;
    events.push({ at, poi: { id: entry.id, name: entry.displayName ?? entry.name }, from, to });
  }
  return events;
}

export function emptyState() {
  return { snapshot: null, receivedAt: null, events: [], byPoi: {} };
}

// Everything but the time the mod stamped on it, to tell a heartbeat from a change.
function sameContent(a, b) {
  if (!a || !b) return false;
  return JSON.stringify({ ...a, generatedAt: null }) === JSON.stringify({ ...b, generatedAt: null });
}

/**
 * Folds an accepted snapshot into the stored state. `write` is false for a repeat of the
 * stored snapshot that arrives while the stored one is still recent.
 */
export function applySnapshot(state, snapshot, now = new Date()) {
  const current = { ...emptyState(), ...(state ?? {}) };
  const at = now.toISOString();
  const same = sameContent(current.snapshot, snapshot);
  if (same && current.receivedAt && now - new Date(current.receivedAt) < REWRITE_SAME_MINUTES * 60_000) {
    return { state: current, events: [], write: false };
  }
  const events = same ? [] : diffEvents(current.snapshot, snapshot, at);
  const byPoi = { ...current.byPoi };
  for (const event of events) {
    byPoi[event.poi.id] = [event, ...(byPoi[event.poi.id] ?? [])].slice(0, EVENTS_PER_POI);
  }
  return {
    state: { snapshot, receivedAt: at, events: [...[...events].reverse(), ...current.events].slice(0, EVENTS_KEPT), byPoi },
    events,
    write: true,
  };
}

export function isStale(receivedAt, now = new Date()) {
  return !receivedAt || now - new Date(receivedAt) > STALE_MINUTES * 60_000;
}

/** What GET /api/poi returns: the snapshot plus when it arrived and whether it is stale. */
export function publicSnapshot(state, now = new Date()) {
  if (!state?.snapshot) return null;
  return { ...state.snapshot, receivedAt: state.receivedAt, stale: isStale(state.receivedAt, now) };
}

/** Newest first, at most `limit` (1 to 500, default 50). */
export function latestEvents(state, limit) {
  const count = Math.min(EVENTS_KEPT, Math.max(1, Number.parseInt(limit, 10) || 50));
  return (state?.events ?? []).slice(0, count);
}

export function poiHistory(state, id) {
  return state?.byPoi?.[id] ?? [];
}

/** For the status page: no POI data, only whether reports are arriving. */
export function health(state, now = new Date()) {
  const receivedAt = state?.receivedAt ?? null;
  const minutes = receivedAt ? Math.floor((now - new Date(receivedAt)) / 60_000) : null;
  return { ok: true, receivedAt, minutesSinceReport: minutes, stale: isStale(receivedAt, now) };
}
