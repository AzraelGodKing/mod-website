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
} from "./snapshot.mjs";

export interface Env {
  ASSETS: Fetcher;
  // The latest snapshot plus the event history, in one value under "state".
  POI: KVNamespace;
  // Required. The game server mod sends it as "Authorization: Bearer <token>".
  // Without it every ingest is refused.
  POI_INGEST_TOKEN?: string;
  // Optional. When set, the page data needs it (a cookie from the password form, or a
  // Bearer header). When unset, the page is public.
  POI_VIEW_TOKEN?: string;
}

const STATE_KEY = "state";
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
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Use GET" }, 405, { allow: "GET, HEAD" });

  // No POI data, so the status page can read it without the view token.
  if (path === "/api/poi/health") return json(health(await readState(env), now), 200, { "cache-control": "public, max-age=30" });

  const routes = ["/api/poi", "/api/poi/history", "/api/poi/events"];
  if (!routes.includes(path)) return json({ error: "Not found" }, 404);
  if (!(await canView(request, env))) return json({ error: "locked", locked: true }, 401);
  const state = await readState(env);
  const cache = { "cache-control": viewCache(env) };
  if (path === "/api/poi") {
    const snapshot = publicSnapshot(state, now);
    return snapshot ? json(snapshot, 200, cache) : json({ error: "The game server has not reported yet", empty: true }, 404);
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
