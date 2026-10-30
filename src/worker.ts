import catalogFile from "./data/catalog.json";
import labels from "./data/report-labels.json";
import { games } from "./data/games";
import { handleReport } from "./report/handle.mjs";
import { adminAuthorized, passwordMatches } from "./admin/auth";
import {
  activeSessions,
  authenticationOptions,
  clearedSessionCookie,
  createSession,
  deletePasskey,
  endAllSessions,
  endSession,
  listPasskeys,
  registerPasskey,
  registrationOptions,
  sessionCookie,
  sessionToken,
  sessionValid,
  verifyPasskey,
} from "./admin/passkeys";
import { collectStats, rosterFromCatalog, type Snapshot } from "./stats/collect.mjs";
import { NOT_READY, fetchManifestFiles, latestDownloads, releaseStatus } from "./downloads/latest.mjs";
import { isBot, recordDownload, siteCounts, siteDownloadLog, withSiteCounts } from "./downloads/count.mjs";

interface CatalogMod {
  slug: string;
  name: string;
  game: string;
  version: string;
  uploadedAt?: string;
  links: { steam: string | null; thunderstore: string | null; nexus: string | null };
}

// NEXUSMODS_API_KEY is a Worker secret. Without it, Nexus counts stay at the last stored value.
// ADMIN_TOKEN is the /admin password. Without it, only passkeys sign in.
// DOWNLOADS_DB counts clicks on our own Download buttons, and holds the admin passkeys and sessions.
// Without it, downloads still redirect and /admin accepts only the password as a Bearer token.
// ADMIN_ORIGIN is for local testing only: wrangler dev rewrites request URLs to the production
// host, so set it to http://localhost:8787 in .dev.vars to register passkeys locally.
type SiteEnv = Env & { NEXUSMODS_API_KEY?: string; ADMIN_TOKEN?: string; ADMIN_ORIGIN?: string; DOWNLOADS_DB?: D1Database };

type RefreshSource = "scheduled" | "manual" | "first-request";

interface StoredSnapshot extends Snapshot {
  source: RefreshSource;
  lastScheduled: string | null;
  warnings: string[];
}

interface ReportMod {
  gameName: string;
  modName: string;
  version: string;
  labelId?: string;
  gameLabelId: string;
}

const catalogMods = (catalogFile as { mods: CatalogMod[] }).mods;

function reportCatalog() {
  const mods: Record<string, ReportMod> = {};
  for (const mod of catalogMods) {
    const key = `${mod.game}/${mod.slug}`;
    // A new mod can reach the catalog before its Linear label is added here.
    // Its reports keep the game and website labels instead of failing the Worker.
    const labelId: string | undefined = labels.mods[key as keyof typeof labels.mods];
    if (!labelId) console.warn(`No report label for ${key}; reports use the game label.`);
    const game = games.find((entry) => entry.slug === mod.game);
    const gameLabelId = labels.games[mod.game as keyof typeof labels.games];
    if (!game || !gameLabelId) throw new Error(`Missing game for ${key}`);
    mods[key] = {
      gameName: game.name,
      modName: mod.name,
      version: mod.version,
      ...(labelId ? { labelId } : {}),
      gameLabelId,
    };
  }
  return { websiteLabelId: labels.websiteLabelId, mods };
}

const catalog = reportCatalog();
const statsRoster = rosterFromCatalog(catalogMods);
const STATS_KEY = "snapshot";

// A manual refresh keeps lastScheduled, so the hourly cron timeline is unchanged.
async function refreshStats(env: SiteEnv, source: RefreshSource): Promise<StoredSnapshot> {
  const previous = await env.STATS.get<StoredSnapshot>(STATS_KEY, "json");
  const warnings: string[] = [];
  const next = await collectStats(statsRoster, {
    fetch: (input, init) => fetch(input, init),
    nexusKey: env.NEXUSMODS_API_KEY,
    previous,
    log: (message) => {
      warnings.push(message);
      console.warn(`[stats] ${message}`);
    },
  });
  const stored: StoredSnapshot = {
    ...next,
    source,
    lastScheduled: source === "scheduled" ? next.lastFetched : (previous?.lastScheduled ?? null),
    warnings,
  };
  await env.STATS.put(STATS_KEY, JSON.stringify(stored));
  console.log(JSON.stringify({ event: "stats", result: "refreshed", source, warnings: warnings.length }));
  return stored;
}

async function readStats(env: SiteEnv): Promise<StoredSnapshot> {
  return (await env.STATS.get<StoredSnapshot>(STATS_KEY, "json")) ?? (await refreshStats(env, "first-request"));
}

// Site counts are read live from D1; the store counts come from the hourly snapshot.
async function readSiteCounts(env: SiteEnv): Promise<Record<string, number> | null> {
  if (!env.DOWNLOADS_DB) return null;
  try {
    return await siteCounts(env.DOWNLOADS_DB);
  } catch (error) {
    console.warn(`[downloads] site counts could not be read: ${error}`);
    return null;
  }
}

async function statsWithSite(env: SiteEnv, snapshot: StoredSnapshot): Promise<StoredSnapshot> {
  return withSiteCounts(snapshot, statsRoster, await readSiteCounts(env));
}

async function handleStats(request: Request, env: SiteEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const { lastFetched, mods, games: gameStats } = await statsWithSite(env, await readStats(env));
  const body = JSON.stringify({ lastFetched, mods, games: gameStats });
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

// downloads.json is read on each request (edge-cached for five minutes), so a mod
// release reaches the download buttons without rebuilding the site.
async function currentDownloads() {
  return latestDownloads(catalogMods, await fetchManifestFiles((input, init) => fetch(input, init)));
}

async function handleDownloads(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const body = JSON.stringify(await currentDownloads());
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

async function handleDownloadRedirect(request: Request, env: SiteEnv, ctx: ExecutionContext, pathname: string): Promise<Response> {
  const key = pathname.replace(/^\/download\//, "").replace(/\/+$/, "");
  if (NOT_READY.has(key)) return Response.redirect(new URL("/not-ready", request.url).href, 302);
  const latest = (await currentDownloads())[key];
  if (!latest) return new Response("Not found", { status: 404 });
  const db = env.DOWNLOADS_DB;
  if (db && request.method === "GET" && !isBot(request.headers.get("user-agent"))) {
    // The redirect does not wait for the write.
    ctx.waitUntil(recordDownload(db, key, latest.version).catch((error) => console.warn(`[downloads] count failed for ${key}: ${error}`)));
  }
  // no-store: a cached redirect would skip the Worker and the click would not be counted.
  return new Response(null, {
    status: 302,
    headers: { location: latest.url, "cache-control": "no-store" },
  });
}

function adminJson(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// The session cookie is SameSite=Strict; checking Origin on writes is a second guard against CSRF.
function sameOrigin(request: Request, url: URL): boolean {
  return request.method === "GET" || request.headers.get("origin") === url.origin;
}

async function signedIn(request: Request, env: SiteEnv): Promise<boolean> {
  if (await adminAuthorized(request, env.ADMIN_TOKEN)) return true;
  const token = sessionToken(request);
  return !!token && !!env.DOWNLOADS_DB && (await sessionValid(env.DOWNLOADS_DB, token));
}

async function startSession(db: D1Database, method: "password" | "passkey"): Promise<Response> {
  const token = await createSession(db, method);
  console.log(JSON.stringify({ event: "admin", result: "signed-in", method }));
  return adminJson(200, { signedIn: true }, { "set-cookie": sessionCookie(token) });
}

type AdminRoute = (request: Request, env: SiteEnv, url: URL, db: D1Database | undefined) => Promise<Response>;

const needsDb = () => adminJson(503, { error: "Passkeys need the D1 database binding." });

// Routes anyone can call: they are how you sign in.
const publicAdminRoutes: Record<string, AdminRoute> = {
  "GET /api/admin/session": async (request, env, _url, db) => {
    const passkeys = db ? (await listPasskeys(db)).length : 0;
    return adminJson(200, {
      signedIn: await signedIn(request, env),
      password: !!env.ADMIN_TOKEN && !!db,
      passkeys: passkeys > 0,
    });
  },
  "POST /api/admin/login": async (request, env, _url, db) => {
    if (!db) return needsDb();
    const body = await readJson<{ password?: string }>(request);
    if (!(await passwordMatches(String(body?.password ?? ""), env.ADMIN_TOKEN))) {
      console.log(JSON.stringify({ event: "admin", result: "denied", method: "password" }));
      return adminJson(401, { error: "The password was not accepted." });
    }
    return startSession(db, "password");
  },
  "POST /api/admin/passkey/login-options": async (_request, _env, url, db) => {
    if (!db) return needsDb();
    return adminJson(200, await authenticationOptions(db, url));
  },
  "POST /api/admin/passkey/login": async (request, _env, url, db) => {
    if (!db) return needsDb();
    const body = await readJson<{ response?: Parameters<typeof verifyPasskey>[2] }>(request);
    let verified = false;
    try {
      verified = !!body?.response && (await verifyPasskey(db, url, body.response));
    } catch (error) {
      console.log(JSON.stringify({ event: "admin", result: "passkey-error", error: String(error) }));
    }
    if (!verified) {
      console.log(JSON.stringify({ event: "admin", result: "denied", method: "passkey" }));
      return adminJson(401, { error: "That passkey was not accepted." });
    }
    return startSession(db, "passkey");
  },
  "POST /api/admin/logout": async (request, _env, _url, db) => {
    const token = sessionToken(request);
    if (token && db) await endSession(db, token);
    return adminJson(200, { signedIn: false }, { "set-cookie": clearedSessionCookie() });
  },
};

// Routes behind sign-in.
const privateAdminRoutes: Record<string, AdminRoute> = {
  "GET /api/admin/stats": async (_request, env) => adminJson(200, await statsWithSite(env, await readStats(env))),
  "POST /api/admin/refresh": async (_request, env) => adminJson(200, await statsWithSite(env, await refreshStats(env, "manual"))),
  "GET /api/admin/passkeys": async (_request, _env, _url, db) => (db ? adminJson(200, { passkeys: await listPasskeys(db) }) : needsDb()),
  "GET /api/admin/site-downloads": async (_request, _env, _url, db) => (db ? adminJson(200, { rows: await siteDownloadLog(db) }) : needsDb()),
  "GET /api/admin/releases": async () => {
    const files = await fetchManifestFiles((input, init) => fetch(input, init));
    return adminJson(200, { manifest: files !== null, mods: releaseStatus(catalogMods, files) });
  },
  "GET /api/admin/overview": async (_request, env, _url, db) =>
    adminJson(200, {
      sessions: db ? await activeSessions(db) : null,
      password: !!env.ADMIN_TOKEN,
      database: !!db,
      nexusKey: !!env.NEXUSMODS_API_KEY,
    }),
  "POST /api/admin/sessions/clear": async (_request, _env, _url, db) => {
    if (!db) return needsDb();
    await endAllSessions(db);
    console.log(JSON.stringify({ event: "admin", result: "signed-out-everywhere" }));
    return adminJson(200, { signedIn: false }, { "set-cookie": clearedSessionCookie() });
  },
  "POST /api/admin/passkey/register-options": async (_request, _env, url, db) => {
    if (!db) return needsDb();
    return adminJson(200, await registrationOptions(db, url));
  },
  "POST /api/admin/passkey/register": async (request, _env, url, db) => {
    if (!db) return needsDb();
    const body = await readJson<{ response?: Parameters<typeof registerPasskey>[2]; name?: string }>(request);
    let passkey = null;
    try {
      passkey = body?.response ? await registerPasskey(db, url, body.response, String(body.name ?? "")) : null;
    } catch (error) {
      console.log(JSON.stringify({ event: "admin", result: "register-error", error: String(error) }));
    }
    if (!passkey) return adminJson(400, { error: "The passkey could not be saved. Try again." });
    console.log(JSON.stringify({ event: "admin", result: "passkey-added" }));
    return adminJson(200, { passkey });
  },
};

async function handleAdmin(request: Request, env: SiteEnv, url: URL): Promise<Response> {
  const db = env.DOWNLOADS_DB;
  if (!env.ADMIN_TOKEN && !db) {
    console.log(JSON.stringify({ event: "admin", result: "unconfigured" }));
    return adminJson(503, { error: "The admin page is not configured." });
  }
  if (!sameOrigin(request, url)) return adminJson(403, { error: "Cross-site request refused." });
  // Passkeys are bound to this origin.
  const site = env.ADMIN_ORIGIN ? new URL(env.ADMIN_ORIGIN) : url;

  const key = `${request.method} ${url.pathname}`;
  const publicRoute = publicAdminRoutes[key];
  if (publicRoute) return publicRoute(request, env, site, db);

  const removal = request.method === "DELETE" && url.pathname.match(/^\/api\/admin\/passkeys\/([^/]+)$/);
  const privateRoute = privateAdminRoutes[key];
  if (!privateRoute && !removal) return adminJson(404, { error: "Not found." });
  if (!(await signedIn(request, env))) {
    console.log(JSON.stringify({ event: "admin", result: "denied", route: key }));
    return adminJson(401, { error: "Sign in again." });
  }
  if (privateRoute) return privateRoute(request, env, site, db);

  if (!db) return needsDb();
  // Without a password, removing the last passkey would lock everyone out.
  if (!env.ADMIN_TOKEN && (await listPasskeys(db)).length <= 1) {
    return adminJson(409, { error: "This is the only way in. Add another passkey or set ADMIN_TOKEN first." });
  }
  const removed = await deletePasskey(db, decodeURIComponent((removal as RegExpMatchArray)[1]));
  return removed ? adminJson(200, { removed: true }) : adminJson(404, { error: "That passkey no longer exists." });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/report") {
      return handleReport(request, env, catalog);
    }
    if (url.pathname === "/api/stats") {
      return handleStats(request, env);
    }
    if (url.pathname === "/api/downloads") {
      return handleDownloads(request);
    }
    if (url.pathname.startsWith("/download/")) {
      return handleDownloadRedirect(request, env, ctx, url.pathname);
    }
    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(refreshStats(env, "scheduled").then(() => undefined));
  },
} satisfies ExportedHandler<SiteEnv>;
