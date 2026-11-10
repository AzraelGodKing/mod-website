// poi.azraelsmods.com: who owns which POI on Azrael's 7 Days to Die server. The POI
// Registry server mod posts a snapshot to /api/poi/ingest; the page reads /api/poi.
// Setup and secrets: poi/README.md.
import { tokenMatches } from "../../src/donors/donors.mjs";
import {
  MAX_BODY_BYTES,
  MIN_POST_SECONDS,
  applySnapshot,
  emptyState,
  health,
  latestEvents,
  parseSnapshot,
  poiHistory,
  publicSnapshot,
  serverDay,
} from "./snapshot.mjs";
import { MAP_LAYERS, MAX_MAP_BYTES, checkMapUpload, emptyMapMeta, hashBytes, nextMapMeta, publicMap, sameMapLayer } from "./map.mjs";

export interface Env {
  ASSETS: Fetcher;
  // The latest snapshot plus the event history, in one value under "state", and the world
  // map under "map" (description) and "map:biomes" / "map:roads" (PNGs).
  POI: KVNamespace;
  // Required. The game server mod sends it as "Authorization: Bearer <token>".
  // Without it every ingest is refused.
  POI_INGEST_TOKEN?: string;
  // Optional. When set, the page data needs it (a cookie from the password form, or a
  // Bearer header). When unset, the page is public.
  POI_VIEW_TOKEN?: string;
}

const STATE_KEY = "state";
// The world map: a small JSON description, and one PNG per layer under map:<layer>.
const MAP_META_KEY = "map";
const mapKey = (layer: string) => `map:${layer}`;
const COOKIE = "poi_view";
const COOKIE_DAYS = 30;

// Per isolate, on top of the stored time, so a burst that lands on one isolate is caught
// before KV has caught up.
let lastAccepted = 0;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      ...headers,
    },
  });
}

async function readState(env: Env) {
  return ((await env.POI.get(STATE_KEY, "json")) as ReturnType<typeof emptyState> | null) ?? emptyState();
}

async function readMapMeta(env: Env) {
  return ((await env.POI.get(MAP_META_KEY, "json")) as ReturnType<typeof emptyMapMeta> | null) ?? emptyMapMeta();
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function cookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

// The cookie holds a hash of the view token, not the token itself.
async function cookieValue(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`poi-view:${token}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function canView(request: Request, env: Env) {
  if (!env.POI_VIEW_TOKEN) return true;
  if (await tokenMatches(bearer(request), env.POI_VIEW_TOKEN)) return true;
  const fromCookie = cookie(request, COOKIE);
  return fromCookie ? tokenMatches(fromCookie, await cookieValue(env.POI_VIEW_TOKEN)) : false;
}

function viewCache(env: Env) {
  return env.POI_VIEW_TOKEN ? "no-store" : "public, max-age=30";
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { tooBig: true as const };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return { tooBig: true as const };
  return { text: new TextDecoder().decode(bytes) };
}

export async function handleIngest(request: Request, env: Env, now = new Date()): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405, { allow: "POST" });
  if (!env.POI_INGEST_TOKEN || !(await tokenMatches(bearer(request), env.POI_INGEST_TOKEN))) {
    console.log(JSON.stringify({ event: "poi-ingest", result: "denied" }));
    return json({ error: "Token not accepted" }, 401);
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return json({ error: "Send application/json" }, 415);
  }
  const body = await readBody(request);
  if ("tooBig" in body) return json({ error: `The body is over ${MAX_BODY_BYTES / 1024} KB` }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return json({ error: "The body is not valid JSON" }, 400);
  }
  const parsed = parseSnapshot(payload);
  if (!parsed.ok) {
    console.log(JSON.stringify({ event: "poi-ingest", result: "invalid", error: parsed.error }));
    return json({ error: parsed.error }, 400);
  }

  const wait = MIN_POST_SECONDS * 1000;
  if (now.getTime() - lastAccepted < wait) return json({ error: "Too many posts" }, 429, { "retry-after": String(MIN_POST_SECONDS) });
  const state = await readState(env);
  if (state.receivedAt && now.getTime() - new Date(state.receivedAt).getTime() < wait) {
    return json({ error: "Too many posts" }, 429, { "retry-after": String(MIN_POST_SECONDS) });
  }
  lastAccepted = now.getTime();

  const result = applySnapshot(state, parsed.snapshot, now);
  if (result.write) await env.POI.put(STATE_KEY, JSON.stringify(result.state));
  console.log(JSON.stringify({ event: "poi-ingest", result: result.write ? "stored" : "unchanged", pois: parsed.snapshot.pois.length, changes: result.events.length }));
  return json({ ok: true, stored: result.state.receivedAt, pois: parsed.snapshot.pois.length, ...(result.write ? {} : { unchanged: true }) });
}

async function isGameServer(request: Request, env: Env) {
  return Boolean(env.POI_INGEST_TOKEN) && (await tokenMatches(bearer(request), env.POI_INGEST_TOKEN!));
}

// PUT /api/poi/map/<layer> (game server), GET /api/poi/map/status (game server or page),
// GET /api/poi/map/<layer>?v=<hash> (page).
export async function handleMap(request: Request, env: Env, path: string, now = new Date()): Promise<Response> {
  const url = new URL(request.url);
  const name = path.slice("/api/poi/map/".length);
  if (request.method === "PUT") {
    if (!(await isGameServer(request, env))) {
      console.log(JSON.stringify({ event: "poi-map", result: "denied" }));
      return json({ error: "Token not accepted" }, 401);
    }
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_MAP_BYTES) return json({ error: `The image is over ${MAX_MAP_BYTES / 1024 / 1024} MB` }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const upload = checkMapUpload(name, url.searchParams, bytes);
    if (!upload.ok) return json({ error: upload.error }, upload.status);
    const hash = await hashBytes(bytes);
    const meta = await readMapMeta(env);
    if (sameMapLayer(meta, upload, hash)) return json({ ok: true, layer: name, hash, unchanged: true });
    await env.POI.put(mapKey(name), bytes);
    await env.POI.put(MAP_META_KEY, JSON.stringify(nextMapMeta(meta, upload, hash, bytes.byteLength, now)));
    console.log(JSON.stringify({ event: "poi-map", result: "stored", layer: name, bytes: bytes.byteLength, size: upload.size }));
    return json({ ok: true, layer: name, hash });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Use GET or PUT" }, 405, { allow: "GET, HEAD, PUT" });

  if (name === "status") {
    if (!(await isGameServer(request, env)) && !(await canView(request, env))) return json({ error: "locked", locked: true }, 401);
    return json(await readMapMeta(env));
  }
  if (!MAP_LAYERS.includes(name)) return json({ error: "Not found" }, 404);
  if (!(await canView(request, env))) return json({ error: "locked", locked: true }, 401);
  const meta = await readMapMeta(env);
  const layer = (meta.layers as Record<string, { hash: string } | undefined>)[name];
  const bytes = layer ? ((await env.POI.get(mapKey(name), "arrayBuffer")) as ArrayBuffer | null) : null;
  if (!layer || !bytes) return json({ error: "No map uploaded yet" }, 404);
  // A URL with the current hash never changes, so the browser can keep it.
  const pinned = url.searchParams.get("v") === layer.hash.slice(0, 16);
  const scope = env.POI_VIEW_TOKEN ? "private" : "public";
  return new Response(request.method === "HEAD" ? null : bytes, {
    headers: {
      "content-type": "image/png",
      "cache-control": pinned ? `${scope}, max-age=31536000, immutable` : "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405, { allow: "POST" });
  if (!env.POI_VIEW_TOKEN) return json({ ok: true, locked: false });
  let password = "";
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) password = String(((await request.json()) as { password?: unknown }).password ?? "");
    else password = String((await request.formData()).get("password") ?? "");
  } catch {
    return json({ error: "Send a password" }, 400);
  }
  if (!(await tokenMatches(password, env.POI_VIEW_TOKEN))) {
    console.log(JSON.stringify({ event: "poi-login", result: "denied" }));
    return json({ error: "That password is not right" }, 401);
  }
  const value = await cookieValue(env.POI_VIEW_TOKEN);
  return json({ ok: true }, 200, {
    "set-cookie": `${COOKIE}=${value}; Path=/; Max-Age=${COOKIE_DAYS * 86_400}; HttpOnly; Secure; SameSite=Strict`,
  });
}

function handleLogout(request: Request): Response {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405, { allow: "POST" });
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
}

export async function handleApi(request: Request, env: Env, now = new Date()): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/api/poi/ingest") return handleIngest(request, env, now);
  if (path === "/api/poi/login") return handleLogin(request, env);
  if (path === "/api/poi/logout") return handleLogout(request);
  if (path.startsWith("/api/poi/map/")) return handleMap(request, env, path, now);
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Use GET" }, 405, { allow: "GET, HEAD" });

  // No POI data, so the status page can read it without the view token.
  if (path === "/api/poi/health") return json(health(await readState(env), now), 200, { "cache-control": "public, max-age=30" });

  // Only the in-game day, for the stream overlay's blood moon countdown (live.azraelsmods.com).
  if (path === "/api/poi/day") {
    return json(serverDay(await readState(env), now), 200, { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" });
  }

  const routes = ["/api/poi", "/api/poi/history", "/api/poi/events"];
  if (!routes.includes(path)) return json({ error: "Not found" }, 404);
  if (!(await canView(request, env))) return json({ error: "locked", locked: true }, 401);
  const state = await readState(env);
  const cache = { "cache-control": viewCache(env) };
  if (path === "/api/poi") {
    const snapshot = publicSnapshot(state, now);
    return snapshot ? json({ ...snapshot, map: publicMap(await readMapMeta(env)) }, 200, cache) : json({ error: "The game server has not reported yet", empty: true }, 404);
  }
  if (path === "/api/poi/events") return json({ events: latestEvents(state, url.searchParams.get("limit")) }, 200, cache);
  const id = url.searchParams.get("poi");
  if (!id) return json({ error: "Add ?poi=<id>" }, 400);
  return json({ poi: id, events: poiHistory(state, id) }, 200, cache);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
